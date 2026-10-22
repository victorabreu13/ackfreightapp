#!/usr/bin/env bash
# ACK Guías on Cloud Run. Commands: setup, deploy, migrate, import.
# Never prints secret values.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-ack-guias}"
PROJECT_NUMBER="${PROJECT_NUMBER:-711303341686}"
REGION="${REGION:-us-east1}"
SERVICE="ack-guias"
INSTANCE="ack-guias-db"
DB_NAME="ack_guias"
DB_USER="ack_guias"
RUNTIME_SA="ack-guias-run"
JOB="ack-guias-migrate"
INSTANCE_CONNECTION="${PROJECT_ID}:${REGION}:${INSTANCE}"

if [[ "$PROJECT_ID" != "ack-guias" ]]; then
  echo "PROJECT_ID must be ack-guias."
  exit 1
fi

gcloud config set project "$PROJECT_ID" >/dev/null

secret_exists() {
  gcloud secrets describe "$1" --project="$PROJECT_ID" >/dev/null 2>&1
}

bind_secret() {
  local name="$1"
  gcloud secrets add-iam-policy-binding "$name" \
    --project="$PROJECT_ID" \
    --member="serviceAccount:${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet >/dev/null
}

write_secret() {
  local name="$1"
  local file="$2"
  if secret_exists "$name"; then
    gcloud secrets versions add "$name" --project="$PROJECT_ID" --data-file="$file" >/dev/null
  else
    gcloud secrets create "$name" --project="$PROJECT_ID" --replication-policy="automatic" --data-file="$file" >/dev/null
  fi
  bind_secret "$name"
}

runtime_secrets() {
  local secrets="DATABASE_URL=DATABASE_URL:latest,AUTH_SECRET=AUTH_SECRET:latest,GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest"
  local optional
  for optional in GOOGLE_DRIVE_SA_JSON QBO_CLIENT_ID QBO_CLIENT_SECRET QBO_TOKEN_KEY; do
    if secret_exists "$optional"; then
      secrets="${secrets},${optional}=${optional}:latest"
    fi
  done
  printf '%s' "$secrets"
}

runtime_env() {
  local url
  url="$(gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')"
  local env="ADMIN_EMAILS=victor.abreu@ackfreight.com,andres.alvarado@ackfreight.com,AUTH_TRUST_HOST=true,AUTH_URL=${url}"
  if [[ -n "${ACK_GUIAS_DRIVE_ROOT_ID:-}" ]]; then
    env="${env},ACK_GUIAS_DRIVE_ROOT_ID=${ACK_GUIAS_DRIVE_ROOT_ID}"
  fi
  if [[ -n "${ACK_GUIAS_DRIVE_FOLDER:-}" ]]; then
    env="${env},ACK_GUIAS_DRIVE_FOLDER=${ACK_GUIAS_DRIVE_FOLDER}"
  fi
  if [[ -n "${QBO_ENVIRONMENT:-}" ]]; then
    env="${env},QBO_ENVIRONMENT=${QBO_ENVIRONMENT}"
  fi
  printf '%s' "$env"
}

cmd_setup() {
  gcloud services enable \
    run.googleapis.com \
    sqladmin.googleapis.com \
    secretmanager.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    iam.googleapis.com \
    compute.googleapis.com \
    --project="$PROJECT_ID"

  if ! gcloud iam service-accounts describe "${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com" --project="$PROJECT_ID" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$RUNTIME_SA" \
      --project="$PROJECT_ID" \
      --display-name="ACK Guías Cloud Run"
  fi

  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/cloudsql.client" \
    --quiet >/dev/null

  gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --project="$PROJECT_ID" \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/iam.serviceAccountUser" \
    --quiet >/dev/null

  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/run.developer" \
    --quiet >/dev/null

  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/artifactregistry.writer" \
    --quiet >/dev/null

  if ! gcloud sql instances describe "$INSTANCE" --project="$PROJECT_ID" >/dev/null 2>&1; then
    gcloud sql instances create "$INSTANCE" \
      --project="$PROJECT_ID" \
      --database-version=POSTGRES_16 \
      --edition=enterprise \
      --tier=db-g1-small \
      --region="$REGION" \
      --storage-size=10GB \
      --storage-type=SSD \
      --availability-type=zonal \
      --backup-start-time=08:00 \
      --quiet
  fi

  if ! gcloud sql databases describe "$DB_NAME" --instance="$INSTANCE" --project="$PROJECT_ID" >/dev/null 2>&1; then
    gcloud sql databases create "$DB_NAME" --instance="$INSTANCE" --project="$PROJECT_ID" --quiet
  fi

  if ! secret_exists DATABASE_URL; then
    local pass url_file
    pass="$(openssl rand -hex 24)"
    url_file="$(mktemp)"
    chmod 600 "$url_file"
    DB_USER="$DB_USER" DB_PASS="$pass" DB_NAME="$DB_NAME" INSTANCE_CONNECTION="$INSTANCE_CONNECTION" URL_FILE="$url_file" python3 - <<'PY'
import os
url = "postgresql://{user}:{password}@localhost/{db}?host=/cloudsql/{instance}&schema=public".format(
    user=os.environ["DB_USER"],
    password=os.environ["DB_PASS"],
    db=os.environ["DB_NAME"],
    instance=os.environ["INSTANCE_CONNECTION"],
)
open(os.environ["URL_FILE"], "w").write(url)
PY
    if ! gcloud sql users list --instance="$INSTANCE" --project="$PROJECT_ID" --format='value(name)' | grep -qx "$DB_USER"; then
      gcloud sql users create "$DB_USER" --instance="$INSTANCE" --project="$PROJECT_ID" --password="$pass" --quiet
    fi
    unset pass
    write_secret DATABASE_URL "$url_file"
    rm -f "$url_file"
    echo "DATABASE_URL secret created. The password was not printed."
  else
    bind_secret DATABASE_URL
    echo "DATABASE_URL secret already exists. Password was not rotated."
  fi

  if ! secret_exists AUTH_SECRET; then
    local auth_file
    auth_file="$(mktemp)"
    chmod 600 "$auth_file"
    openssl rand -base64 32 >"$auth_file"
    write_secret AUTH_SECRET "$auth_file"
    rm -f "$auth_file"
    echo "AUTH_SECRET created. The value was not printed."
  else
    bind_secret AUTH_SECRET
  fi

  local placeholder
  placeholder="$(mktemp)"
  chmod 600 "$placeholder"
  printf '%s' 'pending' >"$placeholder"
  if ! secret_exists GOOGLE_CLIENT_ID; then
    write_secret GOOGLE_CLIENT_ID "$placeholder"
    echo "GOOGLE_CLIENT_ID created with a placeholder. Add the real OAuth client id before sign-in."
  else
    bind_secret GOOGLE_CLIENT_ID
  fi
  if ! secret_exists GOOGLE_CLIENT_SECRET; then
    write_secret GOOGLE_CLIENT_SECRET "$placeholder"
    echo "GOOGLE_CLIENT_SECRET created with a placeholder. Add the real OAuth client secret before sign-in."
  else
    bind_secret GOOGLE_CLIENT_SECRET
  fi
  rm -f "$placeholder"

  if ! gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
    gcloud run deploy "$SERVICE" \
      --project="$PROJECT_ID" \
      --region="$REGION" \
      --image="us-docker.pkg.dev/cloudrun/container/hello" \
      --service-account="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
      --allow-unauthenticated \
      --quiet
    echo "Cloud Run service ${SERVICE} created with a placeholder image. Run deploy next."
  else
    echo "Cloud Run service ${SERVICE} already exists."
  fi
}

cmd_deploy() {
  local secrets env
  secrets="$(runtime_secrets)"
  gcloud run deploy "$SERVICE" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --source=. \
    --service-account="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --add-cloudsql-instances="$INSTANCE_CONNECTION" \
    --set-secrets="$secrets" \
    --allow-unauthenticated \
    --memory=1Gi \
    --cpu=1 \
    --min-instances=0 \
    --max-instances=4 \
    --port=8080 \
    --quiet
  env="$(runtime_env)"
  gcloud run services update "$SERVICE" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --update-env-vars="$env" \
    --quiet
  gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)'
}

cmd_migrate() {
  local image
  image="$(gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT_ID" --format='value(spec.template.spec.containers[0].image)')"
  gcloud run jobs deploy "$JOB" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --image="$image" \
    --service-account="${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --set-cloudsql-instances="$INSTANCE_CONNECTION" \
    --set-secrets="DATABASE_URL=DATABASE_URL:latest" \
    --command="sh" \
    --args="-c,pnpm exec prisma migrate deploy && pnpm exec prisma migrate status" \
    --max-retries=0 \
    --task-timeout=600 \
    --quiet
  gcloud run jobs execute "$JOB" --project="$PROJECT_ID" --region="$REGION" --wait
}

cmd_import() {
  local file="$1"
  if [[ -z "$file" || ! -f "$file" ]]; then
    echo "usage: bash DEPLOY_GCLOUD.sh import path.json"
    exit 1
  fi
  local proxy pid url_file
  if command -v cloud-sql-proxy >/dev/null 2>&1; then
    proxy="cloud-sql-proxy"
  else
    proxy="/tmp/cloud-sql-proxy"
    if [[ ! -x "$proxy" ]]; then
      curl -fsSL -o "$proxy" "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.3/cloud-sql-proxy.linux.amd64"
      chmod +x "$proxy"
    fi
  fi
  "$proxy" "$INSTANCE_CONNECTION" --port 5432 >/tmp/ack-guias-sql-proxy.log 2>&1 &
  pid="$!"
  trap 'kill "$pid" >/dev/null 2>&1 || true' EXIT
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if (echo >/dev/tcp/127.0.0.1/5432) >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  url_file="$(mktemp)"
  chmod 600 "$url_file"
  SRC_DATABASE_URL="$(gcloud secrets versions access latest --secret=DATABASE_URL --project="$PROJECT_ID")" \
    URL_FILE="$url_file" python3 - <<'PY'
import os
import urllib.parse
raw = os.environ["SRC_DATABASE_URL"]
parts = urllib.parse.urlsplit(raw)
user = urllib.parse.quote(parts.username or "", safe="")
password = urllib.parse.quote(parts.password or "", safe="")
path = parts.path or "/ack_guias"
local = f"postgresql://{user}:{password}@127.0.0.1:5432{path}?schema=public"
open(os.environ["URL_FILE"], "w").write(local)
PY
  unset SRC_DATABASE_URL
  DATABASE_URL="$(cat "$url_file")" pnpm exec prisma generate >/dev/null
  DATABASE_URL="$(cat "$url_file")" pnpm exec tsx scripts/import-ack.ts "$file"
  rm -f "$url_file"
  unset DATABASE_URL
  kill "$pid" >/dev/null 2>&1 || true
  trap - EXIT
}

case "${1:-}" in
  setup) cmd_setup ;;
  deploy) cmd_deploy ;;
  migrate) cmd_migrate ;;
  import) cmd_import "${2:-}" ;;
  *)
    echo "usage: bash DEPLOY_GCLOUD.sh setup|deploy|migrate|import <file.json>"
    exit 1
    ;;
esac
