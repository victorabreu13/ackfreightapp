import React from "react";
import { StyleSheet, Text, View } from "react-native";
import LiveMap from "./LiveMap";
import { TripRequest } from "../types";

function timeAgo(ms: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

// Shows one map card per driver currently sharing their location on this
// request — nothing renders at all once a driver's lines are no longer
// in progress, since the server clears their entry at that point.
export default function LiveTrackingSection({ request }: { request: TripRequest }) {
  const driverLocations = request.driverLocations || {};
  const driverIds = Object.keys(driverLocations);
  if (driverIds.length === 0) return null;

  const nameFor = (driverId: string) => {
    const line = request.awbLines.find((l) => l.assignedDriverId === driverId);
    return line?.assignedDriverName || "Driver";
  };

  return (
    <View>
      <Text style={styles.sectionTitle}>Live Tracking</Text>
      {driverIds.map((driverId) => {
        const loc = driverLocations[driverId];
        const stale = Date.now() - loc.updatedAt > 3 * 60 * 1000;
        return (
          <View key={driverId} style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.driverName}>{nameFor(driverId)}</Text>
              <Text style={[styles.updated, stale && styles.stale]}>
                {stale ? "Last seen " : "Updated "}
                {timeAgo(loc.updatedAt)}
              </Text>
            </View>
            <LiveMap lat={loc.lat} lng={loc.lng} label={nameFor(driverId)} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#111", marginTop: 26, marginBottom: 10 },
  card: { backgroundColor: "#f0f2fa", borderRadius: 12, padding: 12, marginBottom: 12 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  driverName: { fontSize: 14, fontWeight: "700", color: "#111" },
  updated: { fontSize: 12, color: "#15803d" },
  stale: { color: "#b45309" },
});
