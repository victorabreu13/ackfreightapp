# ACK Freight

Dispatch and driver-log app for ACK Freight (iOS, Android, and web). Built with Expo / React Native and Firebase.

Customers (freight forwarders and shippers) file a **trip request**: date, pickup time, from/to, and up to 10 air-waybill lines. Each line has a piece count, unit type (ULD or loose), weight, priority, and optional documents (AWB, letter of authorization, delivery order). Import-fee files can be attached once for the whole request. Those files are stored in Firebase Storage at `tripRequestDocs/{customerId}/{requestId}/...` and the request itself is a Firestore `tripRequests` document.

An **admin** (dispatch) can assign a driver to each AWB line. Unassigned lines also sit on an **open job board**. An on-duty driver can accept one; the first accept wins. A driver who was assigned directly can accept or decline. Declining puts the line back on the board and emails dispatch. Start stays disabled until the driver accepts. After start, the driver marks the freight **picked up**, then completes it with a ULD number, proof photos, and the receiver's signature. Completing writes a separate **trip log** (`trips`) and links it from the AWB line. The customer can open that proof, including the signature, from the request once a line is completed; they do not get direct access to the `trips` collection.

Submitting a request stores a **quote** from that customer's existing billing rate (`billType` / `billRate`): the trip rate once, or the kilogram rate times total weight. If there is no usable rate, the request is stored as **no quote**. The app does not invent lane prices, and editing the weight later does not change the stored quote.

Each driver has a **pay agreement** on their profile (Manage Users → Pay agreement). It can combine a percent of the quote, a flat amount by trip type (ULD/BUP, skid/loose, airport transfer), base plus per mile plus per ULD or skid, and extras for wait time, hazmat, and after hours. Rates start empty. An optional company default (Admin → Driver pay) applies only when that driver's agreement has no rates. With neither, the job says **Pay set by dispatch** and the driver cannot accept until dispatch types an amount on that request. Open-board pay is calculated for the driver who is looking, then saved when they accept. A direct assignment saves that driver's amount when dispatch assigns them. Completed trips lock the offer. An admin adjustment (with a reason) does not change the locked amount. Drivers see the dollar offer only. They cannot open an agreement, another driver's pay, or the customer's price.

Miles and drive time are stored on the request when it is created or the addresses change. That uses the Distance Matrix and Geocoding APIs when the `GOOGLE_MAPS_ROUTES_API_KEY` secret is set. If the key is missing or the call fails, the app uses a straight-line estimate and labels it approximate. The key stays on the server.

Admins also invoice a completed request through QuickBooks Online, review every driver's log, and track driver payroll (per trip or per kilogram). Payroll marks trips paid inside the app. It does not send money.

## Roles

| Role | How they get in | What they do |
| --- | --- | --- |
| Customer | Sign up in the app, or an admin creates the account and emails a password reset | File and track trip requests |
| Driver | Sign up in the app | Go on duty to accept open AWBs, accept or decline a direct assignment, start, mark picked up, and complete, or log a trip by hand. Earnings lists completed trips. |
| Admin | An existing admin promotes them in **Manage Users** | Dispatch, logs, payroll, users, each driver's pay agreement, QuickBooks |

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
- **Trip requests.** `tripRequests`. The request status moves `submitted` → `assigned` → `in_progress` → `completed` → `invoiced`, or `cancelled`. Each AWB line has its own status: `submitted` (on the board), `assigned` (waiting for the driver), `accepted`, `in_progress` (started), `picked_up`, `completed`. Customers can edit route, schedule, notes, cargo (including dimensions, hazmat, and the Skid type), and files until a driver starts the request. They cannot change who is assigned or a line's status. `users.onDuty` is the driver's job-board switch.
- **Website leads.** `leads`. The public `websiteIntake` function creates a pending lead. Dispatch approves it into a trip request only when a customer account already uses that email.
- **Trip logs.** `trips`. Proof files live in Storage at `proofs/{driverId}/...`. Customers see those files only through the `getTripRequestProofs` Cloud Function, and only for logs linked from their own request.
- **Duplicate ULD numbers.** `checkDuplicateUld` and `submitTripLog` look up `tripUldKeys` (server-only). They do not scan every trip and they do not return the other driver's name. After deploying functions, run `backfillTripUldKeys` once so trips logged before the index existed are included. See the pull request notes if you are upgrading.
- **Live location.** While a driver has a started or picked-up line, the app writes a single current point to `tripRequests.driverLocations.{driverId}`. On a phone it keeps updating in the background (that needs a new store build, not an OTA update). On the web it updates while the app is open. It is not a route. Dispatch sees a warning when that point is missing or more than three minutes old.
- **Driver pay.** `driverPayAgreements/{driverId}` and `config/driverPayDefault` are admin-only, and only Cloud Functions write them. Each change is appended to `driverPayAgreementLogs` with the date and the admin. `awbPay/{requestId}_{awbIndex}` is the snapshotted offer. A driver can read only the rows where `driverId` is their own uid. Customers cannot read pay. `awbPayOverrides` and `driverPayAudit` are admin-only.

## 6. Cloud Functions

`functions/index.js` sends mail through Gmail (daily trip summary at 11:59 PM `America/New_York`, plus mail when a request is created, a driver is assigned or declines, a trip starts, freight is picked up, a trip is completed, or a trip is deleted), Expo push notifications on native, QuickBooks invoicing, user administration, website intake, and the trip-log / proof / ULD-index callables. Functions run on Node.js 22.

### Website intake (Wix)

`websiteIntake` is an HTTPS function. It creates a **pending lead**, not a trip request. It rejects every call unless `INTAKE_SHARED_SECRET` is set (or `RECAPTCHA_SECRET` is set and the body includes a token that verifies). It allows 8 requests per hour per IP.

Create the secret before the first deploy, or that deploy fails:

```bash
firebase functions:secrets:set INTAKE_SHARED_SECRET
```

Call it from **Wix Velo backend code** (a backend web module or `http-functions.js`), never from the public page, so the secret is not in the browser:

```javascript
import { fetch } from 'wix-fetch';

export async function post_freightLead(request) {
  const body = await request.body.json();
  const response = await fetch('https://us-central1-ack-freight.cloudfunctions.net/websiteIntake', {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'x-ack-intake-secret': 'THE_SECRET',
    },
    body: JSON.stringify({
      contactName: body.contactName,
      email: body.email,
      from: body.from,
      to: body.to,
      tripDate: body.tripDate,       // optional, YYYY-MM-DD
      pickupTime: body.pickupTime,   // optional, HH:mm
      notes: body.notes,
      phone: body.phone,
      awbNumber: body.awbNumber,
      qtyPieces: body.qtyPieces,
      type: body.type,               // Loose, Skid, or a ULD type
      kilograms: body.kilograms,
      lengthIn: body.lengthIn,
      widthIn: body.widthIn,
      heightIn: body.heightIn,
      hazmat: body.hazmat,
      unNumber: body.unNumber,
      hazmatClass: body.hazmatClass,
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Intake failed');
  }
  return payload;
}
```

Required fields are `contactName`, `email`, `from`, and `to`. A successful call returns `{ id, status: "pending" }`. Dispatch approves or dismisses the lead in the app. Approval fails until a customer user exists with that email. Optional reCAPTCHA: set the function environment variable `RECAPTCHA_SECRET` and send `recaptchaToken` in the JSON body.

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

Store binaries are built with [EAS Build](https://docs.expo.dev/build/introduction/) (`npx eas-cli build`). `eas.json` has a preview profile (internal Android APK) and a production profile. That step needs an Apple Developer account and a Google Play Console account. Set `GOOGLE_MAPS_ANDROID_API_KEY` in the build environment before building Android. Background location (the job-board release) is a native permission change, so it needs a new store build. An OTA update cannot add it.

OTA updates (`eas update`) ship JavaScript changes to installs that already include `expo-updates`. Do not publish an update until the matching Cloud Functions and security rules are deployed.
