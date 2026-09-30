import * as Updates from "expo-updates";
import { useEffect } from "react";

// Native counterpart to AutoReload.tsx (web) — checks for an OTA update on
// every launch and, if one exists, downloads and applies it immediately
// instead of waiting for Expo's own next-natural-relaunch default. isEnabled
// is false in Expo Go and in local dev builds, so this is a no-op there.
export default function NativeAutoUpdate() {
  useEffect(() => {
    if (!Updates.isEnabled) return;
    (async () => {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch (err) {
        console.error("Failed to check for OTA update:", err);
      }
    })();
  }, []);

  return null;
}
