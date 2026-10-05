import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Linking, Platform } from "react-native";
import { auth } from "../firebase/config";
import { confirmAction } from "../utils/alert";
import { updateMyLiveLocation } from "./tripRequests";

// Live tracking has to keep working when the driver locks the phone or
// switches apps, so it runs as an OS-level background location task instead of
// a timer inside the trip screen. The task reads which requests are being
// tracked from storage (the task can run when no screen is mounted) and drops
// a request once the server says the driver no longer has a line in progress.
const TASK_NAME = "ack-freight-live-location";
const STORAGE_KEY = "activeLiveLocationRequestIds";

async function readActiveIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

async function writeActiveIds(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

async function stopIfStarted(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(TASK_NAME)) {
    await Location.stopLocationUpdatesAsync(TASK_NAME);
  }
}

if (Platform.OS !== "web") {
  TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
    if (error) {
      console.error("Background location task error:", error);
      return;
    }
    const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
    const latest = locations?.[locations.length - 1];
    if (!latest) return;

    // When the app was relaunched by the OS for this task, the saved sign-in
    // may still be restoring.
    await auth.authStateReady();
    if (!auth.currentUser) return;

    const ids = await readActiveIds();
    const stillActive: string[] = [];
    for (const requestId of ids) {
      try {
        await updateMyLiveLocation(requestId, latest.coords.latitude, latest.coords.longitude);
        stillActive.push(requestId);
      } catch (err) {
        const code = (err as { code?: string })?.code;
        // No in-progress line anymore (completed, reassigned) or the request
        // is gone — stop tracking it. Other errors (offline) retry next tick.
        if (code !== "functions/failed-precondition" && code !== "functions/not-found") {
          stillActive.push(requestId);
        }
      }
    }
    await writeActiveIds(stillActive);
    if (stillActive.length === 0) await stopIfStarted();
  });
}

export type AlwaysLocationResult = "granted" | "denied";

// Drivers must grant "Always" (iOS) / "Allow all the time" (Android). Both
// platforms make the user pick that in two steps, so ask foreground first and
// then background. The OS can't be forced, so a "no" blocks starting the trip.
export async function ensureAlwaysLocationPermission(): Promise<AlwaysLocationResult> {
  if (Platform.OS === "web") return "granted";
  const current = await Location.getBackgroundPermissionsAsync();
  if (current.status === "granted") return "granted";

  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") return "denied";
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.status === "granted" ? "granted" : "denied";
}

export function promptToAllowAlwaysLocation(): void {
  confirmAction(
    {
      title: "Set location to “Always”",
      message:
        Platform.OS === "ios"
          ? "To start a trip, open Settings → ACK Freight → Location and choose “Always”, so dispatch and the customer can track the trip even when your phone is locked."
          : "To start a trip, open Settings → Permissions → Location and choose “Allow all the time”, so dispatch and the customer can track the trip even when your phone is locked.",
      confirmLabel: "Open Settings",
      cancelLabel: "Not now",
    },
    () => Linking.openSettings()
  );
}

export async function startBackgroundLocationSharing(requestId: string): Promise<void> {
  if (Platform.OS === "web") return;
  const ids = await readActiveIds();
  if (!ids.includes(requestId)) await writeActiveIds([...ids, requestId]);

  if (await Location.hasStartedLocationUpdatesAsync(TASK_NAME)) return;
  await Location.startLocationUpdatesAsync(TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 25000,
    distanceInterval: 0,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "ACK Freight trip in progress",
      notificationBody: "Sharing your location with dispatch and the customer.",
    },
  });
}
