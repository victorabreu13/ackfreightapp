import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useAuth } from "../context/AuthContext";
import { navigationRef } from "../navigation/navigationRef";

const HANDLED_KEY = "lastHandledNotificationId";

// Tapping a message notification (app closed, in the background, or open) opens
// the chat, like WhatsApp. The tap can arrive before the user is signed in and the
// screens exist, so it waits until the Chat screen is available.
export default function NotificationRouter() {
  const { profile } = useAuth();
  const pending = useRef<{ driverId?: string; driverName?: string } | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const handle = async (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      // The "last response" is remembered by the phone: only act on each one once.
      if ((await AsyncStorage.getItem(HANDLED_KEY)) === id) return;
      await AsyncStorage.setItem(HANDLED_KEY, id);
      const data = response.notification.request.content.data as { type?: string; driverId?: string; driverName?: string };
      if (data?.type === "message") pending.current = { driverId: data.driverId, driverName: data.driverName };
    };
    Notifications.getLastNotificationResponseAsync().then(handle).catch(() => {});
    const subscription = Notifications.addNotificationResponseReceivedListener((r) => {
      handle(r).catch(() => {});
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const timer = setInterval(() => {
      const target = pending.current;
      if (!target || !profile || !navigationRef.isReady()) return;
      const routes = navigationRef.getRootState()?.routeNames ?? [];
      if (!routes.includes("Chat")) return;
      pending.current = null;
      if (profile.role === "admin") {
        (navigationRef as any).navigate("Chat", { driverId: target.driverId, driverName: target.driverName });
      } else {
        (navigationRef as any).navigate("Chat");
      }
    }, 400);
    return () => clearInterval(timer);
  }, [profile]);

  return null;
}
