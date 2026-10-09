import { getApp, getApps, initializeApp } from "firebase/app";
// getReactNativePersistence exists at runtime for this SDK version but isn't
// in its type declarations yet — safe to silence, not a real type error.
// @ts-expect-error
import { connectAuthEmulator, getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { connectStorageEmulator, getStorage } from "firebase/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Native (iOS/Android) needs an explicit AsyncStorage-backed persistence layer;
// web falls back to the SDK's default browser persistence.
export const auth =
  Platform.OS === "web"
    ? getAuth(app)
    : initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });

export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Local development only: point the app at the Firebase emulators instead of
// the live project. Off unless EXPO_PUBLIC_USE_FIREBASE_EMULATORS=1 is set at
// build/start time (it is not in the production .env), and the emulator
// project should be a "demo-" project id so nothing can reach real data.
if (process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === "1") {
  const host = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST || "127.0.0.1";
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
  connectFunctionsEmulator(functions, host, 5001);
  connectStorageEmulator(storage, host, 9199);
}

export default app;
