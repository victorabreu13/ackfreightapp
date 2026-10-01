import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { subscribeToActiveDrivers } from "../services/users";
import { subscribeToAllTripRequests } from "../services/tripRequests";
import { AwbLine, TripRequest, UserProfile } from "../types";
import { toLocalDateString } from "../utils/date";

function formatElapsed(startedAt: number, nowMs: number): string {
  const minutes = Math.max(0, Math.floor((nowMs - startedAt) / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

interface DriverAwbEntry {
  line: AwbLine;
  request: TripRequest;
}

interface DriverRow {
  driver: UserProfile;
  available: boolean;
  currentEntry: DriverAwbEntry | null;
  cargoTodayKg: number;
  awbsToday: number;
}

export default function DriversAvailableScreen({ navigation }: any) {
  const [drivers, setDrivers] = useState<UserProfile[]>([]);
  const [requests, setRequests] = useState<TripRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const unsubscribe = subscribeToActiveDrivers(
      (data) => {
        setDrivers(data);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToAllTripRequests(
      (data) => setRequests(data),
      () => {}
    );
    return unsubscribe;
  }, []);

  // Keeps elapsed-time-on-trip fresh without requiring a manual refresh —
  // this screen has no other field that changes every minute on its own.
  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  const rows = useMemo<DriverRow[]>(() => {
    const today = toLocalDateString(new Date());
    return drivers.map((driver) => {
      const entries: DriverAwbEntry[] = [];
      for (const request of requests) {
        if (request.status === "cancelled") continue;
        for (const line of request.awbLines) {
          if (line.assignedDriverId === driver.uid) {
            entries.push({ line, request });
          }
        }
      }

      const inProgress = entries.filter((e) => e.line.status === "in_progress");
      inProgress.sort((a, b) => (a.line.startedAt ?? 0) - (b.line.startedAt ?? 0));
      const currentEntry = inProgress[0] ?? null;

      const todayEntries = entries.filter((e) => e.request.tripDate === today);
      const cargoTodayKg = todayEntries.reduce((sum, e) => sum + e.line.kilograms, 0);

      return {
        driver,
        available: inProgress.length === 0,
        currentEntry,
        cargoTodayKg,
        awbsToday: todayEntries.length,
      };
    });
  }, [drivers, requests]);

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>‹ Back</Text>
      </TouchableOpacity>

      <View style={styles.header}>
        <Text style={styles.title}>Drivers Available</Text>
        <Text style={styles.subtitle}>Who's free right now, and what they're carrying today</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>No drivers found.</Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.driver.uid}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.driverName}>{item.driver.name}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    item.available ? styles.statusAvailable : styles.statusBusy,
                  ]}
                >
                  <Text style={styles.statusBadgeText}>
                    {item.available ? "Available" : "On a Trip"}
                  </Text>
                </View>
              </View>

              <Text style={styles.cardMeta}>
                Cargo assigned today: {item.cargoTodayKg} kg
                {item.awbsToday > 0
                  ? ` (${item.awbsToday} AWB${item.awbsToday === 1 ? "" : "s"})`
                  : ""}
              </Text>

              {item.currentEntry && (
                <Text style={styles.cardMeta}>
                  Current trip: {item.currentEntry.request.from} → {item.currentEntry.request.to}
                  {" · "}
                  {item.currentEntry.line.startedAt
                    ? `${formatElapsed(item.currentEntry.line.startedAt, nowMs)} in progress`
                    : "in progress"}
                </Text>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f6fa" },
  backButton: { marginTop: 24, marginLeft: 20, alignSelf: "flex-start" },
  backButtonText: { color: "#1d4ed8", fontWeight: "700", fontSize: 16 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: "800", color: "#111" },
  subtitle: { fontSize: 13, color: "#666", marginTop: 4 },
  empty: { textAlign: "center", color: "#888", marginTop: 40, paddingHorizontal: 40 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  driverName: { fontSize: 16, fontWeight: "800", color: "#111" },
  statusBadge: { borderRadius: 12, paddingVertical: 4, paddingHorizontal: 12 },
  statusAvailable: { backgroundColor: "#15803d" },
  statusBusy: { backgroundColor: "#b45309" },
  statusBadgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  cardMeta: { fontSize: 13, color: "#666", marginTop: 2 },
});
