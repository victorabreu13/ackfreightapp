import * as Location from "expo-location";
import { Linking, Platform } from "react-native";
import { confirmAction } from "./alert";

// Drivers must grant "Always" (iOS) / "Allow all the time" (Android) so live
// tracking keeps working with the phone locked. Both OSes make the user pick it
// in two steps, so ask foreground first and then background. The OS can't be
// forced, so a "no" blocks starting the trip instead.
export async function ensureAlwaysLocationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return true;
  const current = await Location.getBackgroundPermissionsAsync();
  if (current.status === "granted") return true;
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== "granted") return false;
  const background = await Location.requestBackgroundPermissionsAsync();
  return background.status === "granted";
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
