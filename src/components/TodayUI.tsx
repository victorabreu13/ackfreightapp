import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { BoardTrip, DispatchAlert } from "../utils/dispatchBoard";
import { allAssignedConfirmed } from "../utils/tripStatus";
import { cargoSummary, to12h } from "./DispatchUI";

// Calmer building blocks for the Today page: neutral surfaces, thin borders,
// and color only where it means something (late, needs a driver, to invoice).
const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#e5e7eb";
const DANGER = "#b91c1c";
const OK = "#15803d";
const ACCENT = "#1d4ed8";

export function Kpi({
  value,
  label,
  danger,
  onPress,
  selected,
}: {
  value: string | number;
  label: string;
  danger?: boolean;
  onPress: () => void;
  selected?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. Show these trips`}
      accessibilityState={{ expanded: !!selected }}
      style={(state: any) => [
        styles.kpi,
        (state.hovered || state.focused || selected) && styles.kpiHover,
        state.pressed && { transform: [{ scale: 0.98 }] },
      ]}
    >
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, danger && { color: DANGER }]}>{value}</Text>
    </Pressable>
  );
}

const ALERT_GROUPS: {
  kind: DispatchAlert["kind"];
  icon: string;
  one: string;
  many: string;
}[] = [
  { kind: "no_driver_soon", icon: "👤", one: "trip has no driver", many: "trips have no driver" },
  { kind: "pickup_late", icon: "⏱", one: "trip hasn't started", many: "trips haven't started" },
  { kind: "not_confirmed", icon: "❔", one: "driver hasn't confirmed", many: "drivers haven't confirmed" },
  { kind: "gps_lost", icon: "📡", one: "driver lost GPS", many: "drivers lost GPS" },
  { kind: "new_leads", icon: "📥", one: "new request", many: "new requests" },
];

/** One panel for every alert, grouped by kind; tap a group to see its items. */
export function AttentionPanel({
  alerts,
  onPress,
}: {
  alerts: DispatchAlert[];
  onPress: (a: DispatchAlert) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (alerts.length === 0) {
    return (
      <View style={styles.panel}>
        <Text style={styles.allClear}>✓ Nothing needs attention right now</Text>
      </View>
    );
  }
  const groups = ALERT_GROUPS.map((g) => ({ ...g, items: alerts.filter((a) => a.kind === g.kind) })).filter(
    (g) => g.items.length > 0
  );
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>
        {alerts.length} {alerts.length === 1 ? "thing needs" : "things need"} attention
      </Text>
      {groups.map((g) => {
        const expanded = open === g.kind;
        return (
          <View key={g.kind} style={styles.groupWrap}>
            <TouchableOpacity
              style={styles.groupRow}
              onPress={() => setOpen(expanded ? null : g.kind)}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
            >
              <Text style={styles.groupIcon}>{g.icon}</Text>
              <Text style={styles.groupText}>
                {g.items.length} {g.items.length === 1 ? g.one : g.many}
              </Text>
              <Text style={styles.groupAct}>{expanded ? "Hide" : "Show"}</Text>
            </TouchableOpacity>
            {expanded &&
              g.items.map((a) => (
                <TouchableOpacity key={a.id} style={styles.itemRow} onPress={() => onPress(a)}>
                  <Text style={styles.itemText} numberOfLines={2}>
                    {a.message}
                  </Text>
                  <Text style={styles.groupAct}>Open</Text>
                </TouchableOpacity>
              ))}
          </View>
        );
      })}
    </View>
  );
}

function Chip({ text }: { text: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{text}</Text>
    </View>
  );
}

export function TripTile({
  trip,
  needsAttention,
  onPress,
}: {
  trip: BoardTrip;
  needsAttention?: boolean;
  onPress: () => void;
}) {
  const { request, stage, carriedOver, unassigned } = trip;
  const cargo = cargoSummary(request);
  const drivers = request.assignedDriverNames ?? [];
  const hazmat = (request.awbLines ?? []).some((l) => l.hazmat);
  const confirmed = stage === "assigned" && allAssignedConfirmed(request);
  const tag = needsAttention
    ? { text: "Needs attention", color: DANGER }
    : carriedOver
    ? { text: `From ${request.tripDate.slice(5)}`, color: DANGER }
    : stage === "delivered"
    ? { text: "To invoice", color: OK }
    : stage === "invoiced"
    ? { text: "Invoiced", color: MUTED }
    : null;
  const cargoText = [cargo.units, cargo.kg > 0 ? `${cargo.kg.toLocaleString("en-US")} kg` : ""]
    .filter(Boolean)
    .join(" · ");
  return (
    <TouchableOpacity onPress={onPress} style={styles.tile} accessibilityRole="button">
      <View style={styles.tileTop}>
        <Text style={styles.tileTime}>{to12h(request.pickupTime)}</Text>
        {tag && <Text style={[styles.tileTag, { color: tag.color }]}>{tag.text}</Text>}
      </View>
      <Text style={styles.tileCustomer} numberOfLines={1}>
        {request.customerName}
      </Text>
      <Text style={styles.tileRoute} numberOfLines={2}>
        {request.from} → {request.to}
      </Text>
      <View style={styles.chips}>
        {!!cargoText && <Chip text={cargoText} />}
        <Chip text={`${request.awbLines?.length ?? 0} AWB`} />
        {hazmat && <Chip text="Dangerous goods" />}
      </View>
      {drivers.length > 0 && (
        <Text style={styles.tileDriver} numberOfLines={2}>
          {drivers.join(", ")}
          {stage === "assigned" && !confirmed ? "  ·  not confirmed" : ""}
        </Text>
      )}
      {unassigned > 0 && (
        <Text style={styles.tileUnassigned}>
          {unassigned} AWB{unassigned === 1 ? "" : "s"} need{unassigned === 1 ? "s" : ""} a driver
        </Text>
      )}
    </TouchableOpacity>
  );
}

/** Slim link row under the board: the Pending-invoice and Drivers views. */
export function QuickLinks({ items }: { items: { label: string; onPress: () => void }[] }) {
  return (
    <View style={styles.quickLinks}>
      {items.map((i) => (
        <TouchableOpacity key={i.label} onPress={i.onPress}>
          <Text style={styles.quickLink}>{i.label} ›</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function MapTile({
  summary,
  onPress,
}: {
  summary: string;
  onPress: () => void;
}) {
  return (
    <View style={[styles.panel, styles.mapTile]}>
      <Text style={styles.mapIcon}>🗺️</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.mapTitle}>Live map</Text>
        <Text style={styles.mapSub}>{summary}</Text>
      </View>
      <TouchableOpacity style={styles.mapBtn} onPress={onPress}>
        <Text style={styles.mapBtnText}>Open map →</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  kpi: {
    flex: 1,
    minWidth: 130,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    cursor: "pointer" as any,
  },
  kpiHover: { borderColor: "#94a3b8" },
  kpiLabel: { fontSize: 12, color: MUTED, fontWeight: "600" },
  kpiValue: { fontSize: 26, fontWeight: "700", color: INK, marginTop: 2 },

  panel: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  panelTitle: { fontSize: 14, fontWeight: "700", color: INK, marginBottom: 4 },
  allClear: { fontSize: 13, color: OK, fontWeight: "600" },
  groupWrap: { borderTopWidth: 1, borderTopColor: LINE },
  groupRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  groupIcon: { fontSize: 15, width: 20, textAlign: "center" },
  groupText: { flex: 1, fontSize: 13.5, color: INK, fontWeight: "500" },
  groupAct: { fontSize: 12.5, color: ACCENT, fontWeight: "700" },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 7,
    paddingLeft: 30,
  },
  itemText: { flex: 1, fontSize: 12.5, color: MUTED },

  tile: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  tileTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  tileTime: { fontSize: 12, color: MUTED, fontWeight: "600" },
  tileTag: { fontSize: 12, fontWeight: "700" },
  tileCustomer: { fontSize: 14.5, fontWeight: "700", color: INK, marginTop: 3 },
  tileRoute: { fontSize: 12.5, color: MUTED, marginTop: 2, lineHeight: 17 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  chip: { backgroundColor: "#f3f4f6", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  chipText: { fontSize: 11.5, color: "#475569", fontWeight: "600" },
  tileDriver: { marginTop: 8, fontSize: 12.5, color: INK, fontWeight: "600" },
  tileUnassigned: { marginTop: 6, fontSize: 12, fontWeight: "700", color: DANGER },

  quickLinks: { flexDirection: "row", gap: 18, marginBottom: 14, flexWrap: "wrap" },
  quickLink: { fontSize: 13, color: ACCENT, fontWeight: "600" },

  mapTile: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 },
  mapIcon: { fontSize: 24 },
  mapTitle: { fontSize: 14, fontWeight: "700", color: INK },
  mapSub: { fontSize: 12.5, color: MUTED, marginTop: 1 },
  mapBtn: { borderWidth: 1, borderColor: LINE, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  mapBtnText: { fontSize: 13, fontWeight: "700", color: INK },
});
