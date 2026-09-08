# ACK Freight Driver Log

A mobile app (iPhone + Android, built with Expo/React Native) for truck drivers to log every
ride they make, and for you (the admin) to see everyone's logs in one place.

**Driver side:** log in, tap "Log New Trip", fill in date, start time, finish time, and the
AWB / document number, attach photo(s) or a document as proof of the freight, and submit.

**Admin side:** log in with an admin account and see every driver's trips in one dashboard,
filterable by date, with the proof files attached to each trip.

## 1. Install Node.js

This project needs Node.js (which is not currently installed on this machine). Install the
LTS version from [nodejs.org](https://nodejs.org), or via winget:

```bash
winget install OpenJS.NodeJS.LTS
```

Restart your terminal afterwards, then confirm it worked:

```bash
node -v
npm -v
```

## 2. Create a Firebase project (free tier is enough)

1. Go to the [Firebase console](https://console.firebase.google.com) and create a new project.
2. **Authentication** → Sign-in method → enable **Email/Password**.
3. **Firestore Database** → Create database → start in production mode (the rules in
   `firestore.rules` in this repo lock it down correctly).
4. **Storage** → Get started (this is where proof-of-delivery photos/documents are stored).
5. In **Project settings → General → Your apps**, click the Web icon (`</>`) to register a web
   app (Expo apps use the Firebase Web SDK even on mobile). Copy the config values shown.
6. Deploy the security rules (`firestore.rules` and `storage.rules`) via the Firebase console's
   Rules tab for each product (copy-paste the file contents), or with the Firebase CLI:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase init firestore storage   # point it at this folder, use the existing rules files
   firebase deploy --only firestore:rules,storage:rules
   ```

## 3. Configure the app

Copy `.env.example` to `.env` and paste in the config values from step 2.5:

```bash
cp .env.example .env
```

`EXPO_PUBLIC_ADMIN_EMAILS` is pre-filled with your email (victor.abreu13@gmail.com) — anyone
who signs up in the app with an email in that comma-separated list automatically becomes an
admin and sees the Team Log dashboard instead of the driver screen. Add more admin emails there
if needed. Everyone else who signs up becomes a driver by default.

## 4. Install dependencies and run

```bash
npm install
npx expo install --fix
npx expo start
```

`expo install --fix` aligns every native package (camera, date picker, etc.) to the exact
versions your installed Expo SDK expects — always run it once after `npm install`.

This opens the Expo developer tools. To test on your phone with no app-store submission needed:

1. Install the **Expo Go** app from the App Store (iPhone) or Play Store (Android).
2. Scan the QR code shown in the terminal/browser with your phone (iPhone: use the Camera app;
   Android: use the Expo Go app's scanner).
3. The app opens live on your phone. Sign up as a driver on one phone/account, and sign up with
   your admin email on another to see the Team Log view.

## 5. How it works

- **Auth & roles**: Firebase Authentication (email/password). Each user gets a `users/{uid}`
  document in Firestore with a `role` of `admin` or `driver`.
- **Trips**: each submitted trip is a document in the `trips` collection with the date, start/
  finish time, AWB/document number, notes, and an array of proof file URLs. Trips are
  write-once (drivers can't edit or delete a submitted trip) — see `firestore.rules`.
- **Proof files**: uploaded to Firebase Storage under `proofs/{driverId}/...`, and the download
  URL is saved on the trip document. Drivers can only write to their own folder; admins can
  read every folder.
- **Admin dashboard**: subscribes to all trips in real time, with a date filter (defaults to
  today) and a driver count/trip count summary.

## 6. Daily email summary for admins (Cloud Function)

Every night at 11:59 PM (America/New_York — edit `TIME_ZONE` in `functions/index.js` if your
fleet is elsewhere), a Cloud Function runs automatically, gathers every trip logged that day,
and emails a summary table (grouped by driver) to everyone with the `admin` role. This runs on
Google's servers — it works even if no one has the app open.

One-time setup:

1. **Generate a Gmail App Password** (the account that will send the emails):
   - Turn on 2-Step Verification on that Google account if it isn't already: https://myaccount.google.com/security
   - Go to https://myaccount.google.com/apppasswords, create a new app password (name it
     "ACK Freight"), and copy the 16-character password shown.
2. **Install the Firebase CLI and link this project** (run these yourself in a terminal, in
   this project folder):
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use ack-freight
   ```
   `firebase login` opens your browser for you to sign in with the same Google account that
   owns the `ack-freight` Firebase project.
3. **Store the Gmail credentials as secrets** (run these yourself — they'll prompt you to type
   the value, which keeps it out of any file or chat history):
   ```bash
   firebase functions:secrets:set GMAIL_USER
   firebase functions:secrets:set GMAIL_APP_PASSWORD
   ```
   For `GMAIL_USER` enter the full Gmail address; for `GMAIL_APP_PASSWORD` enter the 16-character
   app password from step 1.
4. **Deploy the function**:
   ```bash
   cd functions
   npm install
   cd ..
   firebase deploy --only functions
   ```

To test it immediately instead of waiting until 11:59 PM, open the
[Cloud Scheduler console](https://console.cloud.google.com/cloudscheduler), find the job
`sendDailyTripSummary`, and click **Run now**.

## 7. Going further (when you're ready to publish to the App Store / Play Store)

This prototype runs great in Expo Go for testing with your drivers immediately. When you want a
real installable app icon on their home screens and store listings, use
[EAS Build](https://docs.expo.dev/build/introduction/) (`npx eas-cli build`) — no code changes
needed, it's the same project. That step costs nothing to try but does involve Apple
Developer ($99/yr) and Google Play ($25 one-time) developer accounts, which I can walk you
through when you get there.
