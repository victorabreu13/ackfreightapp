import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { updateMyLiveLocation } from "./tripRequests";

export const LIVE_LOCATION_TASK = "ack-freight-live-location";
const STORAGE_KEY = "ack-live-location-request-ids";

type LocationPoint = { coords: { latitude: number; longitude: number } };

async function publishPoint(point: LocationPoint) {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const ids: string[] = raw ? JSON.parse(raw) : [];
  await Promise.all(
    ids.map((id) =>
      updateMyLiveLocation(id, point.coords.latitude, point.coords.longitude).catch((err) => {
        console.error("Background location update failed:", err);
      })
    )
  );
}

if (Platform.OS !== "web") {
  // Required at import time so the OS can wake this task. App.tsx imports this module.
  const TaskManager = require("expo-task-manager") as typeof import("expo-task-manager");
  if (!TaskManager.isTaskDefined(LIVE_LOCATION_TASK)) {
    TaskManager.defineTask(LIVE_LOCATION_TASK, async ({ data, error }) => {
      if (error || !data) return;
      const locations = (data as { locations?: LocationPoint[] }).locations;
      const latest = locations?.[locations.length - 1];
      if (!latest) return;
      await publishPoint(latest);
    });
  }
}

export async function setLiveLocationRequestIds(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}
