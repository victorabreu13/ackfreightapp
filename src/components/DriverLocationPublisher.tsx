import * as Location from "expo-location";
import React, { useEffect, useState } from "react";
import { Platform } from "react-native";
import { useAuth } from "../context/AuthContext";
import { LIVE_LOCATION_TASK, setLiveLocationRequestIds } from "../services/liveLocationTask";
import { subscribeToDriverTripRequests, updateMyLiveLocation } from "../services/tripRequests";

const PING_MS = 25000;

function activeRequestIds(
  requests: { id: string; awbLines: { assignedDriverId: string | null; status: string }[] }[],
  driverId: string
) {
  return requests
    .filter((request) =>
      request.awbLines.some(
        (line) =>
          line.assignedDriverId === driverId &&
          (line.status === "in_progress" || line.status === "picked_up")
      )
    )
    .map((request) => request.id);
}

// Shares the driver's current point while they have a started or picked-up
// line. Native uses a background task (a new store build is required for the
// permission prompts). Web keeps a foreground timer.
export default function DriverLocationPublisher() {
  const { user } = useAuth();
  const [requestIds, setRequestIds] = useState<string[]>([]);

  useEffect(() => {
    return () => {
      if (Platform.OS === "web") return;
      Location.hasStartedLocationUpdatesAsync(LIVE_LOCATION_TASK)
        .then((started) => {
          if (started) return Location.stopLocationUpdatesAsync(LIVE_LOCATION_TASK);
        })
        .catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    return subscribeToDriverTripRequests(
      user.uid,
      (requests) => setRequestIds(activeRequestIds(requests, user.uid)),
      (err) => console.error("live location subscription failed:", err)
    );
  }, [user]);

  useEffect(() => {
    if (Platform.OS === "web" || !user || requestIds.length === 0) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const shareInForeground = async () => {
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        await Promise.all(
          requestIds.map((id) => updateMyLiveLocation(id, pos.coords.latitude, pos.coords.longitude))
        );
      } catch (err) {
        console.error("Foreground location update failed:", err);
      }
    };

    (async () => {
      await setLiveLocationRequestIds(requestIds);
      // iOS requires When In Use before Always. While Using still shares a
      // point on the timer below; only Always starts the background task.
      const foreground = await Location.requestForegroundPermissionsAsync();
      if (cancelled || foreground.status !== "granted") return;
      let backgroundGranted = false;
      try {
        const background = await Location.requestBackgroundPermissionsAsync();
        backgroundGranted = background.status === "granted";
      } catch (err) {
        console.error("Background location permission failed:", err);
      }
      let backgroundRunning = false;
      if (!cancelled && backgroundGranted) {
        try {
          const started = await Location.hasStartedLocationUpdatesAsync(LIVE_LOCATION_TASK);
          if (!started) {
            await Location.startLocationUpdatesAsync(LIVE_LOCATION_TASK, {
              accuracy: Location.Accuracy.Balanced,
              activityType: Location.ActivityType.AutomotiveNavigation,
              timeInterval: PING_MS,
              distanceInterval: 25,
              pausesUpdatesAutomatically: false,
              showsBackgroundLocationIndicator: true,
              foregroundService: {
                notificationTitle: "ACK Freight",
                notificationBody: "Sharing your location while a trip is in progress.",
              },
            });
          }
          backgroundRunning = true;
        } catch (err) {
          console.error("Couldn't start background location:", err);
        }
      }
      // While Using, or a failed background start: a point every 25s while the app is open.
      if (!cancelled && !backgroundRunning) {
        await shareInForeground();
        timer = setInterval(shareInForeground, PING_MS);
      }
    })().catch((err) => console.error("Couldn't start location sharing:", err));

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [requestIds, user]);

  useEffect(() => {
    if (Platform.OS === "web" || requestIds.length > 0) return;
    Location.hasStartedLocationUpdatesAsync(LIVE_LOCATION_TASK)
      .then((started) => {
        if (started) return Location.stopLocationUpdatesAsync(LIVE_LOCATION_TASK);
      })
      .catch(() => {});
    setLiveLocationRequestIds([]).catch(() => {});
  }, [requestIds]);

  useEffect(() => {
    if (Platform.OS !== "web" || !user || requestIds.length === 0) return;
    let cancelled = false;

    const share = async () => {
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        await Promise.all(
          requestIds.map((id) => updateMyLiveLocation(id, pos.coords.latitude, pos.coords.longitude))
        );
      } catch (err) {
        console.error("Web location update failed:", err);
      }
    };

    share();
    const timer = setInterval(share, PING_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [requestIds, user]);

  return null;
}
