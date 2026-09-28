import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { collection, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { Platform } from "react-native";
import { auth, db } from "../firebase/config";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Push is native-only for now (see the Phase 3 plan) — admins on the website
// still get email immediately, just not a browser push.
export async function registerForPushNotifications(): Promise<void> {
  if (Platform.OS === "web") return;
  if (!auth.currentUser) return;

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

    await updateDoc(doc(db, "users", auth.currentUser.uid), { pushToken: token });
  } catch (err) {
    console.error("Failed to register for push notifications:", err);
  }
}

// The app icon badge tracks how many assigned trips this driver hasn't
// started yet — it goes back down the moment they start one. The
// assignment push itself also carries the right count (so the badge is
// correct even if the app was closed when it arrived); this recomputes
// it from source of truth whenever we have a live/fresh view of the
// driver's trip requests.
export async function syncBadgeCount(driverId: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const q = query(
      collection(db, "tripRequests"),
      where("assignedDriverIds", "array-contains", driverId)
    );
    const snap = await getDocs(q);
    // Count by this driver's own AWB lines, not the trip's overall rollup
    // status — another driver's lines on the same request can already be
    // in_progress/completed while this driver's own lines are still waiting.
    const count = snap.docs.filter((d) =>
      (d.data().awbLines || []).some(
        (l: { assignedDriverId: string; status: string }) =>
          l.assignedDriverId === driverId && l.status === "assigned"
      )
    ).length;
    await Notifications.setBadgeCountAsync(count);
  } catch (err) {
    console.error("Failed to sync badge count:", err);
  }
}
