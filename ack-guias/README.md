# ACK Freight App

Standalone air waybill app for **ACK TEAM LLC**. It issues MAWB and HAWB documents, labels, and the document pack (CCSF, CCSP, delivery order, lithium letter, pickup order, TSA), stores per-guía uploads, keeps clients with an agreed rate per chargeable kilogram, tracks AWB stock with the mod-7 check digit, and can create a QuickBooks Online draft invoice.

The only issuer is ACK TEAM LLC.

| | |
| --- | --- |
| IATA | `SE1701005` |
| Account | `A2939-US-MIA-MIA` |
| TSA IAC | `SE2508006` |
| Address | 6550 NW 97th Ave Suite 220, Doral FL 33178 |
| Signature | ACK TEAM LLC AS AGENT FOR CARRIER |

Google sign-in is limited to the `ackfreight.com` Workspace domain, and only to addresses in `ADMIN_EMAILS` or added on Usuarios. `ADMIN_EMAILS` defaults to `victor.abreu@ackfreight.com` and `andres.alvarado@ackfreight.com` and those accounts are always Admin. Roles are Admin, Operations, Accounting, and Viewer. Accounting can invoice and open guías read-only. The migration seeds `xiomara.viloria@ackfreight.com` as Accounting.

GCP project `ack-guias` (number `711303341686`), region `us-east1`.

## Local

```bash
cd ack-guias
pnpm install
pnpm exec prisma migrate dev
pnpm dev
```

The app listens on port 43123. Copy `.env.example` to `.env`. Development sign-in is available when `NODE_ENV` is not production. Leave `ENABLE_DEV_LOGIN` unset on Cloud Run.

## Cloud Shell, in this order

Run these from a clone of this repo, in Cloud Shell, with `gcloud` already logged into project `ack-guias`.

### 1. setup

```bash
cd ack-guias
bash DEPLOY_GCLOUD.sh setup
```

This enables APIs, creates Cloud SQL Postgres `ack-guias-db` (database `ack_guias`, user `ack_guias`), stores `DATABASE_URL` and `AUTH_SECRET` in Secret Manager, creates the runtime service account `ack-guias-run` with Cloud SQL client and secret accessor only, and creates the Cloud Run service `ack-guias` if it does not exist yet. Passwords are not printed. If `DATABASE_URL` already exists, the SQL password is not rotated.

### 2. OAuth client, then deploy

Create the Google OAuth client (steps below) and store the values without printing them:

```bash
read -s GOOGLE_CLIENT_ID
printf '%s' "$GOOGLE_CLIENT_ID" | gcloud secrets versions add GOOGLE_CLIENT_ID --project=ack-guias --data-file=-
unset GOOGLE_CLIENT_ID
read -s GOOGLE_CLIENT_SECRET
printf '%s' "$GOOGLE_CLIENT_SECRET" | gcloud secrets versions add GOOGLE_CLIENT_SECRET --project=ack-guias --data-file=-
unset GOOGLE_CLIENT_SECRET
```

```bash
cd ack-guias
bash DEPLOY_GCLOUD.sh deploy
```

`deploy` updates the service, then runs database migrations, then prints the public URL. That URL is `https://ack-guias-711303341686.us-east1.run.app` unless `APP_URL` is set. Sign-in redirect is `{public URL}/api/auth/callback/google`. Do not use the `*.a.run.app` host from `gcloud run services describe`.

### 3. migrate

`deploy` already runs this. Use it alone only when you need to migrate the current image again:

```bash
cd ack-guias
bash DEPLOY_GCLOUD.sh migrate
```

Runs `prisma migrate deploy` and then `prisma migrate status` as a Cloud Run job on the service image. The job fails if a migration is still pending.

### 4. export (once, read-only, against the old database)

```bash
cd ack-guias
pnpm install --frozen-lockfile
read -s KOPE_SOURCE_DATABASE_URL
export KOPE_SOURCE_DATABASE_URL
pnpm exec tsx scripts/export-ack-from-kope.ts --out "$HOME/ack-export.json"
unset KOPE_SOURCE_DATABASE_URL
```

The script opens the source with `default_transaction_read_only=on`. It reads the live Kope tables (`Client`, `ClientAgreedRate.clientId`, `AwbParty`, and the guía tables) and only uses `GuiaClient` when that table exists. ACK rows are `agentKey = 'ack'`. Clients are the ones those guías and agreed rates reference. The JSON is shaped for this app's `GuiaClient` rows. It writes guías, goods lines, parties, documents, Drive refs, AWB stock prefixes 045 and 810, and AES ITN. It does not copy file bytes, users, tokens, or any other issuer. It prints counts only. Do not paste the source URL into the shell as a visible command.

### 5. import

```bash
cd ack-guias
bash DEPLOY_GCLOUD.sh import "$HOME/ack-export.json"
```

Starts the Cloud SQL proxy, rewrites `DATABASE_URL` to `127.0.0.1` without printing it, and upserts by original id. AWB numbers stay the same. Running it again updates the same rows. Rows that are not ACK TEAM LLC are refused. Stock prefixes other than 045 and 810 are skipped.

## OAuth client in the ack-guias console

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select project **ack-guias** (711303341686).
2. APIs & Services → OAuth consent screen. User type Internal if the Workspace allows it. App name **ACK Freight App**. Support email an `@ackfreight.com` address.
3. APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.
4. Name: `ACK Freight App`.
5. Authorized JavaScript origins: `https://<cloud run url>` (the URL from `deploy`, no path).
6. Authorized redirect URIs: `https://<cloud run url>/api/auth/callback/google`.
7. Create. Copy the client id and secret into Secret Manager with the `read -s` commands above. Do not commit them.
8. The app sends `hd=ackfreight.com`. A Google account outside that domain is rejected, including when the hosted-domain claim is missing.

## Optional Drive

Uploads fail with `Drive is not configured` until both of these are set:

- Secret `GOOGLE_DRIVE_SA_JSON`: the service account key JSON. It must contain `client_email` and `private_key`. The app asks Google for the `https://www.googleapis.com/auth/drive` scope.
- Env `ACK_GUIAS_DRIVE_ROOT_ID`: the Drive folder id (the last path segment of the folder URL). Share that folder with the service account email as an Editor. On a Shared drive, add the service account as a Content manager.

`ACK_GUIAS_DRIVE_FOLDER` is optional. When it is unset, files go in a child folder named `ACK Guías` unless the root folder already has that name. Set it to a blank value before deploy to put files directly in the root folder.

Imported `driveFileId` and `driveUrl` values are the files already stored by Kope. The import does not copy bytes and does not move them into the ACK folder. The ACK service account can open those files only if Kope's folder is shared with it too.

Share a Drive folder with the service account in `GOOGLE_DRIVE_SA_JSON`.

```bash
read -s GOOGLE_DRIVE_SA_JSON
printf '%s' "$GOOGLE_DRIVE_SA_JSON" | gcloud secrets versions add GOOGLE_DRIVE_SA_JSON --project=ack-guias --data-file=-
unset GOOGLE_DRIVE_SA_JSON
export ACK_GUIAS_DRIVE_ROOT_ID="<folder id>"
# optional, default folder name is ACK Guías
# export ACK_GUIAS_DRIVE_FOLDER="ACK Guías"
cd ack-guias
bash DEPLOY_GCLOUD.sh deploy
```

Create the secret the first time with `gcloud secrets create GOOGLE_DRIVE_SA_JSON --project=ack-guias --replication-policy=automatic --data-file=-` and paste the JSON, then Ctrl-D. Do not echo it.

## Optional QuickBooks Online

Intuit redirect URI: `https://<cloud run url>/api/guias/qbo/callback`.

```bash
gcloud secrets create QBO_CLIENT_ID --project=ack-guias --replication-policy=automatic --data-file=-
gcloud secrets create QBO_CLIENT_SECRET --project=ack-guias --replication-policy=automatic --data-file=-
openssl rand -base64 32 | gcloud secrets create QBO_TOKEN_KEY --project=ack-guias --replication-policy=automatic --data-file=-
```

Use `secrets versions add` if the secret already exists. Then `bash DEPLOY_GCLOUD.sh deploy`. An admin connects QuickBooks from Settings. Draft invoices are not emailed.

## Tests

```bash
cd ack-guias
pnpm test
pnpm exec tsc --noEmit
```

PDF text checks need `pdftotext` (`poppler-utils`). Database-backed upload tests skip unless `DATABASE_URL` is set.
