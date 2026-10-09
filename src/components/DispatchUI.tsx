import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { TripRequest } from "../types";
import type { BoardTrip, DispatchAlert } from "../utils/dispatchBoard";
import { allAssignedConfirmed, stageInfo, TripStage } from "../utils/tripStatus";

export function StagePill({ stage, soft }: { stage: TripStage; soft?: boolean }) {
  const s = stageInfo(stage);
  return (
    <View style={[styles.pill, { backgroundColor: soft ? s.tint : s.color }]}>
      <Text style={[styles.pillText, { color: soft ? s.color : "#fff" }]}>{s.label}</Text>
    </View>
  );
}

export function Tag({ text, tone }: { text: string; tone?: "uld" | "warn" | "bad" | "ok" }) {
  const t = tone ? TAG_TONES[tone] : TAG_TONES.plain;
  return (
    <View style={[styles.tag, { backgroundColor: t.bg, borderColor: t.border }]}>
      <Text style={[styles.tagText, { color: t.fg }]}>{text}</Text>
    </View>
  );
}

const TAG_TONES = {
  plain: { bg: "#f8fafc", border: "#e3e7ef", fg: "#334155" },
  uld: { bg: "#eef2ff", border: "#c7d2fe", fg: "#3730a3" },
  warn: { bg: "#fffbeb", border: "#fde68a", fg: "#92400e" },
  bad: { bg: "#fef2f2", border: "#fecaca", fg: "#b91c1c" },
  ok: { bg: "#f0fdf4", border: "#bbf7d0", fg: "#15803d" },
};

export function to12h(hhmm: string | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? "");
  if (!m) return hhmm ?? "";
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
}

/** "2 PMC · 1 Loose" style cargo summary from the AWB lines. */
export function cargoSummary(request: TripRequest): { units: string; kg: number } {
  const byType = new Map<string, number>();
  let kg = 0;
  for (const l of request.awbLines ?? []) {
    byType.set(l.type, (byType.get(l.type) ?? 0) + (Number(l.qtyPieces) || 0));
    kg += Number(l.kilograms) || 0;
  }
  return {
    units: [...byType.entries()].map(([t, n]) => `${n} ${t}`).join(" · "),
    kg,
  };
}

export function TripBoardCard({
  trip,
  onPress,
  alert,
}: {
  trip: BoardTrip;
  onPress: () => void;
  alert?: boolean;
}) {
  const { request, stage, carriedOver, unassigned } = trip;
  const s = stageInfo(stage);
  const cargo = cargoSummary(request);
  const drivers = request.assignedDriverNames ?? [];
  const hazmat = (request.awbLines ?? []).some((l) => l.hazmat);
  const confirmed = stage === "assigned" && allAssignedConfirmed(request);
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.card, { borderLeftColor: s.color }, alert && styles.cardAlert]}
      accessibilityRole="button"
    >
      <View style={styles.cardTop}>
        <Tag text={to12h(request.pickupTime)} tone="warn" />
        {carriedOver && <Tag text={`From ${request.tripDate.slice(5)}`} tone="bad" />}
      </View>
      <Text style={styles.cardCustomer} numberOfLines={2}>
        {request.customerName}
      </Text>
      <Text style={styles.cardRoute} numberOfLines={2}>
        {request.from} → {request.to}
      </Text>
      <View style={styles.tags}>
        {!!cargo.units && <Tag text={cargo.units} tone="uld" />}
        {cargo.kg > 0 && <Tag text={`${cargo.kg.toLocaleString("en-US")} kg`} />}
        <Tag text={`${request.awbLines?.length ?? 0} AWB`} />
        {hazmat && <Tag text="DG" tone="bad" />}
      </View>
      {drivers.length > 0 && (
        <Text style={styles.cardDriver} numberOfLines={2}>
          👷 {drivers.join(", ")}
          {stage === "assigned" ? (confirmed ? "  ✓ confirmed" : "  · not confirmed") : ""}
        </Text>
      )}
      {unassigned > 0 && (
        <Text style={styles.cardUnassigned}>
          + {unassigned} AWB{unassigned === 1 ? "" : "s"} need a driver
        </Text>
      )}
      {stage === "delivered" && <Text style={styles.cardInvoice}>To invoice</Text>}
      {stage === "invoiced" && (
        <View style={{ marginTop: 6, flexDirection: "row" }}>
          <StagePill stage="invoiced" />
        </View>
      )}
    </TouchableOpacity>
  );
}

export function AlertsStrip({
  alerts,
  onPress,
}: {
  alerts: DispatchAlert[];
  onPress: (a: DispatchAlert) => void;
}) {
  if (alerts.length === 0) {
    return (
      <View style={[styles.alert, { borderLeftColor: "#16a34a" }]}>
        <Text style={styles.alertText}>✓ No alerts right now</Text>
      </View>
    );
  }
  return (
    <View style={styles.alerts}>
      {alerts.map((a) => (
        <TouchableOpacity
          key={a.id}
          onPress={() => onPress(a)}
          style={[styles.alert, { borderLeftColor: ALERT_COLORS[a.severity] }]}
        >
          <Text style={styles.alertText}>
            {ALERT_ICONS[a.kind]} {a.message}
          </Text>
          <Text style={styles.alertAct}>Open →</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const ALERT_COLORS = { red: "#dc2626", amber: "#f59e0b", info: "#2563eb" };
const ALERT_ICONS: Record<DispatchAlert["kind"], string> = {
  no_driver_soon: "⏰",
  pickup_late: "⌛",
  not_confirmed: "❔",
  gps_lost: "📡",
  new_leads: "📥",
};

export function Counter({ value, label, color }: { value: string | number; label: string; color: string }) {
  return (
    <View style={[styles.counter, { borderLeftColor: color }]}>
      <Text style={styles.counterValue}>{value}</Text>
      <Text style={styles.counterLabel}>{label}</Text>
    </View>
  );
}

export function Btn({
  label,
  onPress,
  primary,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.btn, primary && styles.btnPrimary]}>
      <Text style={[styles.btnText, primary && { color: "#fff" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export const dispatchStyles = StyleSheet.create({
  section: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e3e7ef",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#0f172a", marginBottom: 8 },
  muted: { color: "#64748b", fontWeight: "500" },
  empty: { color: "#94a3b8", fontWeight: "600", paddingVertical: 10 },
});

const styles = StyleSheet.create({
  pill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2, alignSelf: "flex-start" },
  pillText: { fontSize: 11, fontWeight: "800" },
  tag: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  tagText: { fontSize: 11, fontWeight: "700" },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e3e7ef",
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: 9,
    marginBottom: 7,
  },
  cardAlert: { borderColor: "#fca5a5", borderLeftColor: "#dc2626" },
  cardTop: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4, marginBottom: 4 },
  cardCustomer: { fontWeight: "800", fontSize: 13, color: "#0f172a" },
  cardRoute: { color: "#334155", fontSize: 12, marginTop: 3, lineHeight: 16 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 },
  cardDriver: { marginTop: 6, fontSize: 12, fontWeight: "600", color: "#334155" },
  cardUnassigned: { marginTop: 5, fontSize: 11.5, fontWeight: "800", color: "#b91c1c" },
  cardInvoice: { marginTop: 6, fontSize: 11.5, fontWeight: "800", color: "#0f766e" },
  alerts: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  alert: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e3e7ef",
    borderLeftWidth: 4,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginBottom: 0,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  alertText: { fontWeight: "600", color: "#0f172a", fontSize: 12.5, flexShrink: 1 },
  alertAct: { color: "#1d4ed8", fontWeight: "800", fontSize: 12 },
  counter: {
    flex: 1,
    minWidth: 120,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e3e7ef",
    borderLeftWidth: 4,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  counterValue: { fontSize: 22, fontWeight: "800", color: "#0f172a" },
  counterLabel: { fontSize: 11.5, fontWeight: "700", color: "#64748b" },
  btn: {
    borderWidth: 1,
    borderColor: "#e3e7ef",
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  btnPrimary: { backgroundColor: "#1d4ed8", borderColor: "#1d4ed8" },
  btnText: { fontWeight: "700", fontSize: 13, color: "#0f172a" },
});
