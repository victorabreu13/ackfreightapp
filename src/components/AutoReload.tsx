import { useEffect } from "react";
import { Platform } from "react-native";
import { BUILD_VERSION } from "../buildVersion";

const CHECK_INTERVAL_MS = 60000;

async function checkForNewVersion() {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    if (data.version && data.version !== BUILD_VERSION) {
      window.location.reload();
    }
  } catch {
    // Network hiccup — just try again next interval.
  }
}

// Firebase Hosting caches the served files for up to an hour, so a browser
// tab left open can keep running a stale build long after a new one is
// deployed. This polls a small, never-cached version.json (see firebase.json
// headers) and force-reloads the page the moment it sees a newer deploy.
export default function AutoReload() {
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const interval = setInterval(checkForNewVersion, CHECK_INTERVAL_MS);
    window.addEventListener("focus", checkForNewVersion);
    document.addEventListener("visibilitychange", checkForNewVersion);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", checkForNewVersion);
      document.removeEventListener("visibilitychange", checkForNewVersion);
    };
  }, []);

  return null;
}
