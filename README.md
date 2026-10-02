# ACK Freight

Dispatch and driver-log app for ACK Freight (iOS, Android, and web). Built with Expo / React Native and Firebase.

Customers (freight forwarders and shippers) file a **trip request**: date, pickup time, from/to, and up to 10 air-waybill lines. Each line has a piece count, unit type (ULD or loose), weight, priority, and optional documents (AWB, letter of authorization, delivery order). Import-fee files can be attached once for the whole request. Those files are stored in Firebase Storage at `tripRequestDocs/{customerId}/{requestId}/...` and the request itself is a Firestore `tripRequests` document.

An **admin** (dispatch) assigns a driver to each AWB line. The assigned driver sees that request, opens the customer's documents, taps Start, and later completes it with a ULD number and proof photos. Completing writes a separate **trip log** (`trips`) and links it from the AWB line. The customer can open that proof from the request once a line is completed; they do not get direct access to the `trips` collection.

Admins also invoice a completed request through QuickBooks Online, review every driver's log, and track driver payroll (per trip or per kilogram). Payroll marks trips paid inside the app. It does not send money.

## Roles

| Role | How they get in | What they do |
| --- | --- | --- |
| Customer | Sign up in the app, or an admin creates the account and emails a password reset | File and track trip requests |
| Driver | Sign up in the app | See assigned requests, start and complete them, or log a trip by hand |
| Admin | An existing admin promotes them in **Manage Users** | Dispatch, logs, payroll, users, QuickBooks |

Signup cannot grant admin. The first admin is created by signing up as a driver or customer and then setting `role` to `admin` on that `users/{uid}` document in the Firebase console (console writes bypass the security rules). After that, use Manage Users.

## 1. Install Node.js

This project needs Node.js 22 or newer. Cloud Functions run on the Node.js 22 runtime. Confirm:

```bash
node -v
npm -v
```

## 2. Create a Firebase project

The repo is wired to the Firebase project `ack-freight` (`.firebaserc`).

1. [Firebase console](https://console.firebase.google.com) → use that project (or point `.firebaserc` at another one).
2. **Authentication** → Sign-in method → enable **Email/Password**.
3. **Firestore Database** → create the database. Deploy `firestore.rules` (do not leave the database in test mode).
4. **Storage** → get started, then deploy `storage.rules`.
5. In **Project settings → General → Your apps**, register a Web app. Expo uses the Firebase Web SDK on every platform. Copy the config into `.env` (see below).
6. Deploy rules and indexes:

```bash
npm install -g firebase-tools
firebase login
firebase use ack-freight
firebase deploy --only firestore,storage
```

## 3. Configure the app

```bash
cp .env.example .env
```

Fill in the `EXPO_PUBLIC_FIREBASE_*` values from the Firebase web app config.

`GOOGLE_MAPS_ANDROID_API_KEY` is optional for local web and iOS simulator work. Android builds need it so `react-native-maps` can load tiles. `app.config.js` reads it at build time and does not commit a key. For EAS Build, set the same name as an [EAS secret](https://docs.expo.dev/build-reference/variables/). Restrict the key in Google Cloud to package `com.ackfreight.driverlog`.

Web live tracking uses a keyless Google Maps embed and does not need this variable.

## 4. Install dependencies and run

```bash
npm install
npx expo install --fix
npx expo start
```

`expo install --fix` aligns native packages to the Expo SDK. To try it on a phone without a store build, use the Expo Go app and the QR code from `npx expo start`.

- `npm run web` starts the web app. Admins use the web app for payroll, driver records, deleted trips, Drivers Available, and the QuickBooks connection.
- `npm test` runs the Cloud Function unit tests and the assignment helper tests.
- `npm run test:rules` runs the Firestore rules against the emulator (Java 21 required).

## 5. How the data is stored

- **Auth.** Firebase Authentication, email and password. Each person has a `users/{uid}` document with `role` of `admin`, `driver`, or `customer`.
- **Trip requests.** `tripRequests`. Status moves `submitted` → `assigned` → `in_progress` → `completed` → `invoiced`, or `cancelled`. Each AWB line has its own driver and status. Customers can edit route, schedule, notes, cargo, and files until a driver starts the request. They cannot change who is assigned or a line's status.
- **Trip logs.** `trips`. Proof files live in Storage at `proofs/{driverId}/...`. Customers see those files only through the `getTripRequestProofs` Cloud Function, and only for logs linked from their own request.
- **Duplicate ULD numbers.** `checkDuplicateUld` and `submitTripLog` look up `tripUldKeys` (server-only). They do not scan every trip and they do not return the other driver's name. After deploying functions, run `backfillTripUldKeys` once so trips logged before the index existed are included. See the pull request notes if you are upgrading.
- **Live location.** While a driver has the in-progress request open on a phone, the app writes a single current point to `tripRequests.driverLocations.{driverId}`. It is not a route, and it stops when they leave that screen.

## 6. Cloud Functions

`functions/index.js` sends mail through Gmail (daily trip summary at 11:59 PM `America/New_York`, plus mail when a request is created, a driver is assigned, a trip is completed, or a trip is deleted), Expo push notifications on native, QuickBooks invoicing, user administration, and the trip-log / proof / ULD-index callables.

One-time email setup:

1. Turn on 2-Step Verification for the sending Google account and create an [app password](https://myaccount.google.com/apppasswords).
2. Store it as secrets (the CLI prompts; the values are not written into the repo):

```bash
firebase functions:secrets:set GMAIL_USER
firebase functions:secrets:set GMAIL_APP_PASSWORD
```

3. Deploy functions (from the repo root, after `npm install` inside `functions/`):

```bash
cd functions && npm install && cd ..
firebase deploy --only functions
```

QuickBooks uses separate secrets (`QB_PROD_CLIENT_ID`, `QB_PROD_CLIENT_SECRET`, and the sandbox pair). An admin connects the company from the Dispatch screen on the web app. The OAuth redirect is `https://us-central1-ack-freight.cloudfunctions.net/quickbooksOAuthCallback`.

To test the nightly summary without waiting, open Cloud Scheduler, find `sendDailyTripSummary`, and click **Run now**.

## 7. Web hosting

`npm run deploy:web` exports the Expo web bundle and deploys Firebase Hosting for project `ack-freight`. Do that only when you mean to publish. The legal pages in `legal/` are copied into the hosting output.

## 8. Store builds

Store binaries are built with [EAS Build](https://docs.expo.dev/build/introduction/) (`npx eas-cli build`). `eas.json` has a preview profile (internal Android APK) and a production profile. That step needs an Apple Developer account and a Google Play Console account. Set `GOOGLE_MAPS_ANDROID_API_KEY` in the build environment before building Android.

OTA updates (`eas update`) ship JavaScript changes to installs that already include `expo-updates`. Do not publish an update until the matching Cloud Functions and security rules are deployed.
