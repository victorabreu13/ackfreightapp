import React, { useEffect, useMemo, useState } from "react";
import { Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import FleetMap from "./FleetMap";
import type { FleetMapPin, FleetMapTrail } from "./fleetMapTypes";
import { getTripTrails, TripTrail } from "../services/locationTrails";
import { AwbLine, LocationStamp, TripRequest } from "../types";

// Admin: where a trip actually went. The route the driver drove, plus a pin
// where each AWB was started, picked up and completed, kept after the trip is
// over so a wrong-address delivery can be checked later.
const STAGES = [
  { field: "startedLocation", label: "Started", color: "#16a34a" },
  { field: "pickedUpLocation", label: "Picked up", color: "#2563eb" },
  { field: "completedLocation", label: "Completed", color: "#dc2626" },
] as const;

const TRAIL_COLORS = ["#2563eb", "#7c3aed", "#0f766e", "#b45309"];

function mapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function when(ms: number): string {
  return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

interface Event {
  key: string;
  label: string;
  color: string;
  stamp: LocationStamp;
  awbs: string[];
  driver: string;
}

export default function TripRouteSection({ request }: { request: TripRequest }) {
  const [trails, setTrails] = useState<TripTrail[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getTripTrails(request.id)
      .then((t) => !cancelled && setTrails(t))
      .catch((err) => {
        console.error("getTripTrails failed:", err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // Reload when an AWB changes stage, so a fresh completion shows up.
  }, [request.id, request.updatedAt]);

  // One event per stage and place; AWBs stamped at the same spot share a pin.
  const events = useMemo<Event[]>(() => {
    const byKey = new Map<string, Event>();
    for (const line of request.awbLines as AwbLine[]) {
      for (const stage of STAGES) {
        const stamp = line[stage.field];
        if (!stamp) continue;
        const key = `${stage.field}-${stamp.lat.toFixed(5)}-${stamp.lng.toFixed(5)}-${stamp.at}`;
        const existing = byKey.get(key);
        if (existing) existing.awbs.push(line.awbNumber);
        else
          byKey.set(key, {
            key,
            label: stage.label,
            color: stage.color,
            stamp,
            awbs: [line.awbNumber],
            driver: line.assignedDriverName ?? "",
          });
      }
    }
    return [...byKey.values()].sort((a, b) => a.stamp.at - b.stamp.at);
  }, [request.awbLines]);

  const mapTrails: FleetMapTrail[] = (trails ?? [])
    .filter((t) => t.points.length > 0)
    .map((t, i) => ({
      id: t.driverId,
      color: TRAIL_COLORS[i % TRAIL_COLORS.length],
      points: t.points.map((p) => ({ lat: p.lat, lng: p.lng })),
    }));

  const lastPoints = (trails ?? [])
    .filter((t) => t.points.length > 0)
    .map((t) => ({ driver: t.driverName, point: t.points[t.points.length - 1] }));

  const pins: FleetMapPin[] = [
    ...events.map((e) => ({
      id: e.key,
      lat: e.stamp.lat,
      lng: e.stamp.lng,
      label: e.label,
      color: e.color,
      detail: `${e.label} · AWB ${e.awbs.join(", ")} · ${when(e.stamp.at)}`,
    })),
    ...lastPoints.map((l, i) => ({
      id: `last-${i}`,
      lat: l.point.lat,
      lng: l.point.lng,
      label: "Last point",
      color: "#64748b",
      detail: `Last recorded point · ${l.driver} · ${when(l.point.t)}`,
    })),
  ];

  const started = request.awbLines.some((l) => l.status !== "submitted" && l.status !== "assigned" && l.status !== "accepted");
  if (trails === null && !failed) return null;
  if (pins.length === 0 && mapTrails.length === 0) {
    return started ? (
      <View style={styles.wrap}>
        <Text style={styles.title}>Trip route</Text>
        <Text style={styles.muted}>
          No location history was recorded for this trip (it started before route tracking was on, or the driver's
          location was off).
        </Text>
      </View>
    ) : null;
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Trip route</Text>
      <Text style={styles.muted}>
        The line is the route the driver drove. Pins mark where each AWB was started, picked up and completed, and the
        last point recorded.
      </Text>
      <FleetMap drivers={[]} routes={[]} trails={mapTrails} pins={pins} height={340} />
      {events.map((e) => (
        <View key={e.key} style={styles.event}>
          <View style={[styles.dot, { backgroundColor: e.color }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.eventTitle}>
              {e.label} · {when(e.stamp.at)}
            </Text>
            <Text style={styles.eventSub}>
              AWB {e.awbs.join(", ")}
              {e.driver ? ` · ${e.driver}` : ""} ·{" "}
              {e.stamp.source === "device"
                ? `phone GPS${typeof e.stamp.accuracy === "number" ? ` (±${e.stamp.accuracy} m)` : ""}`
                : "driver's last live ping"}
            </Text>
          </View>
          <TouchableOpacity onPress={() => Linking.openURL(mapsLink(e.stamp.lat, e.stamp.lng))}>
            <Text style={styles.link}>Open in Maps</Text>
          </TouchableOpacity>
        </View>
      ))}
      {lastPoints.map((l, i) => (
        <View key={`last-${i}`} style={styles.event}>
          <View style={[styles.dot, { backgroundColor: "#64748b" }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.eventTitle}>Last point · {when(l.point.t)}</Text>
            <Text style={styles.eventSub}>{l.driver}</Text>
          </View>
          <TouchableOpacity onPress={() => Linking.openURL(mapsLink(l.point.lat, l.point.lng))}>
            <Text style={styles.link}>Open in Maps</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    marginBottom: 12,
  },
  title: { fontSize: 16, fontWeight: "800", color: "#111", marginBottom: 4 },
  muted: { fontSize: 12.5, color: "#64748b", marginBottom: 10, lineHeight: 18 },
  event: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#f1f5f9" },
  dot: { width: 12, height: 12, borderRadius: 6 },
  eventTitle: { fontSize: 13.5, fontWeight: "700", color: "#0f172a" },
  eventSub: { fontSize: 12, color: "#64748b", marginTop: 1 },
  link: { fontSize: 12.5, fontWeight: "700", color: "#1d4ed8" },
});
