import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { doc, updateDoc } from "firebase/firestore";
import { Platform } from "react-native";
import { auth, db } from "../firebase/config";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
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
