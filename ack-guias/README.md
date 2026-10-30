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

The script opens the source with `default_transaction_read_only=on`. It reads the live Kope tables (`Client`, `ClientAgreedRate.clientId`, `AwbParty`, and the guía tables) and only uses `GuiaClient` when that table exists. ACK rows are `agentKey = 'ack'`. Kope marks AWB stock the same way: `AwbStockNumber.agentKey = 'ack'`, for every airline prefix, including 729 Avianca. Clients are the ones those guías and agreed rates reference. The JSON is shaped for this app's `GuiaClient` rows. It writes guías, goods lines, parties, documents, Drive refs, all ACK AWB stock, and AES ITN. It does not copy file bytes, users, tokens, or any other issuer. It prints counts only. Do not paste the source URL into the shell as a visible command.

### 5. import

```bash
cd ack-guias
bash DEPLOY_GCLOUD.sh import "$HOME/ack-export.json"
```

Starts the Cloud SQL proxy, rewrites `DATABASE_URL` to `127.0.0.1` without printing it, and upserts guías by original id. AWB numbers stay the same. Running it again updates those rows. Stock numbers that already exist, by id or by AWB, are skipped, so a second import can add prefixes such as 729 without touching 045 and 810. Rows that are not ACK TEAM LLC are refused.

## OAuth client in the ack-guias console

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select project **ack-guias** (711303341686).
2. APIs & Services → OAuth consent screen. User type Internal if the Workspace allows it. App name **ACK Freight App**. Support email an `@ackfreight.com` address.
3. APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.
4. Name: `ACK Freight App`.
5. Authorized JavaScript origins: `https://<cloud run url>` (the URL from `deploy`, no path).
6. Authorized redirect URIs: `https://<cloud run url>/api/auth/callback/google`.
7. Create. Copy the client id and secret into Secret Manager with the `read -s` commands above. Do not commit them.
8. The app sends `hd=ackfreight.com`. A Google account outside that domain is rejected, including when the hosted-domain claim is missing.

## Drive

Uploads go to a Shared drive. A service account has no Drive storage quota, so the app creates each file in that Shared drive instead of in My Drive.

Drive is configured when `ACK_GUIAS_DRIVE_ROOT_ID` is the Shared drive id. There is no built-in id. Pass it on deploy:

```bash
gcloud services enable drive.googleapis.com --project=ack-guias
export ACK_GUIAS_DRIVE_ROOT_ID="<shared drive id>"
cd ack-guias
bash DEPLOY_GCLOUD.sh deploy
```

If `ACK_GUIAS_DRIVE_ROOT_ID` is not exported, deploy reads the value already on the Cloud Run service and writes it back. Export a new id to point at a different Shared drive.

Share that Shared drive with `ack-guias-run@ack-guias.iam.gserviceaccount.com` as Content manager. Deploy runs as that service account, and Drive calls use its Application Default Credentials with the `https://www.googleapis.com/auth/drive` scope.

`GOOGLE_DRIVE_SA_JSON` is optional. `deploy` mounts that secret only when it already exists in Secret Manager. When the secret is absent, uploads still use the Cloud Run service account. A key is not required, including where `iam.disableServiceAccountKeyCreation` is enforced.

`ACK_GUIAS_DRIVE_FOLDER` is optional. When it is unset, files go in a child folder named `ACK Guías` unless the shared-drive root already has that name. Set it to a blank value before deploy to put files directly in the root.

Every generated PDF, import, and team upload is saved in the database first (`GuiaDocumentFile`), then copied to Drive as a backup under `ACK Guías / client / AWB`. Without Drive the document is still saved and shows `Database only` on Documentos, with the Drive error. Retry sends the saved copy to Drive again.

Uploads without `ACK_GUIAS_DRIVE_ROOT_ID` do not reach Drive and report `Drive is not configured`.

Imported `driveFileId` and `driveUrl` values are the files already stored by Kope. The import does not copy bytes and does not move them into the ACK Shared drive. Opening those files works when the Cloud Run service account can see them.

## Client portal, emails and flight status

A client of ACK gets a login that is tied to one client of the book. It sees only the AWB (the shipper original and the conditions, 2 pages) and the flight status of that client's issued guías. Nothing else is reachable with it.

1. In **Directorio**, pick the client and use **Acceso del cliente** to invite a contact by email. The invitation is a one-time link (7 days) where the contact chooses a password. The same link shape serves a password reset. A pending link can be copied again from the same panel.
2. The client signs in at the sign-in page, in the **Clientes** box, and lands on `/portal`.
3. Every 30 minutes Cloud Scheduler calls `/api/guias/flight-check`. Each issued guía is looked up from the day before its flight date to the day after, until it lands or is canceled, but only every 8 hours (4 when delayed, 3 when en route) because AeroDataBox's free plan has a monthly quota of 400 units and each flight lookup uses 2. When the status changes, the client's logins get an email in Spanish. **Revisar ahora** on a guía does the same check by hand.

### Secrets

Flight status comes from AeroDataBox on RapidAPI. Emails go over SMTP, by default Google Workspace (`smtp.gmail.com`, port 587) with a mailbox of ackfreight.com and an app password. Create the secrets once, without echoing the values:

```bash
read -s AERODATABOX_API_KEY
printf '%s' "$AERODATABOX_API_KEY" | gcloud secrets create AERODATABOX_API_KEY --project=ack-guias --replication-policy=automatic --data-file=-
unset AERODATABOX_API_KEY
```

```bash
printf '%s' "ops@ackfreight.com" | gcloud secrets create SMTP_USER --project=ack-guias --replication-policy=automatic --data-file=-
read -s SMTP_PASSWORD
printf '%s' "$SMTP_PASSWORD" | gcloud secrets create SMTP_PASSWORD --project=ack-guias --replication-policy=automatic --data-file=-
unset SMTP_PASSWORD
```

```bash
openssl rand -base64 32 | gcloud secrets create FLIGHT_CHECK_SECRET --project=ack-guias --replication-policy=automatic --data-file=-
```

Use `gcloud secrets versions add NAME --data-file=-` when a secret already exists. Optional: `export MAIL_FROM='ACK TEAM LLC <info@ackfreight.com>'` before `deploy` to change the sender name. Then:

```bash
bash DEPLOY_GCLOUD.sh deploy
bash DEPLOY_GCLOUD.sh schedule
```

`schedule` creates (or updates) the Cloud Scheduler job `ack-guias-flight-check`. Without `SMTP_USER` and `SMTP_PASSWORD` the invitation is still created and the link can be copied by hand, and status changes are saved but no email goes out. Without `AERODATABOX_API_KEY` no flight is checked.

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
