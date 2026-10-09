import React from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { TripRequest } from "../types";
import type { BoardTrip, DispatchAlert, DriverState } from "../utils/dispatchBoard";
import { formatQuote } from "../utils/quote";
import { allAssignedConfirmed, stageInfo } from "../utils/tripStatus";
import { WIDE_BREAKPOINT } from "./AdminShell";
import { ALERT_COLORS, ALERT_ICONS, cargoSummary, StagePill, Tag, to12h } from "./DispatchUI";

// Drawer opened from a Today counter card: the exact rows behind the number.
// Side panel on desktop, full-screen sheet on phones. Tapping a row opens the
// existing trip detail.

export type DrawerContent =
  | { kind: "trips"; trips: BoardTrip[] }
  | { kind: "drivers"; drivers: DriverState[] }
  | { kind: "invoice"; requests: TripRequest[] };

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  description: string;
  color: string;
  content: DrawerContent;
  alertsByRequest: Map<string, DispatchAlert[]>;
  alertsByDriver: Map<string, DispatchAlert[]>;
  nowMs: number;
  onOpenTrip: (request: TripRequest) => void;
  /** Optional link at the bottom of the list (e.g. "Open To Invoice →"). */
  footerLink?: { label: string; onPress: () => void };
}

export default function CounterDrawer(props: Props) {
  const { visible, onClose, title, description, color, content } = props;
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  const count =
    content.kind === "trips"
      ? content.trips.length
      : content.kind === "drivers"
      ? content.drivers.length
      : content.requests.length;
  // Same numbers as the card: trips = rows; drivers = "free / on duty" rows.
  const countText =
    content.kind !== "drivers"
      ? String(count)
      : `${content.drivers.filter((d) => !d.busy).length} free / ${count} on duty`;

  return (
    <Modal visible={visible} transparent animationType={wide ? "fade" : "slide"} onRequestClose={onClose}>
      <View style={[styles.overlay, wide && styles.overlayWide]}>
        {wide && (
          <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close list" />
        )}
        <View
          style={[styles.panel, wide ? styles.panelWide : styles.panelPhone]}
          accessibilityViewIsModal
          accessibilityLabel={`${title} list`}
        >
          <View style={[styles.head, { borderTopColor: color }, !wide && Platform.OS !== "web" && { paddingTop: 50 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                {title} <Text style={[styles.count, { color }]}>· {countText}</Text>
              </Text>
              <Text style={styles.desc}>{description}</Text>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={(s: any) => [styles.close, (s.hovered || s.focused || s.pressed) && styles.closeOn]}
            >
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.list}>
            {count === 0 && <Text style={styles.empty}>Nothing here right now.</Text>}
            {content.kind === "trips" &&
              content.trips.map((t) => (
                <TripRow
                  key={t.request.id}
                  trip={t}
                  alerts={props.alertsByRequest.get(t.request.id) ?? []}
                  onPress={() => props.onOpenTrip(t.request)}
                />
              ))}
            {content.kind === "drivers" &&
              content.drivers.map((d) => (
                <DriverRow
                  key={d.driver.uid}
                  state={d}
                  nowMs={props.nowMs}
                  alerts={props.alertsByDriver.get(d.driver.uid) ?? []}
                  onPress={d.current ? () => props.onOpenTrip(d.current!.request) : undefined}
                />
              ))}
            {content.kind === "invoice" &&
              content.requests.map((r) => (
                <InvoiceRow key={r.id} request={r} onPress={() => props.onOpenTrip(r)} />
              ))}
            {props.footerLink && (
              <Pressable
                onPress={props.footerLink.onPress}
                accessibilityRole="link"
                style={(s: any) => [styles.footerLink, (s.hovered || s.focused) && styles.rowHover]}
              >
                <Text style={styles.footerLinkText}>{props.footerLink.label}</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function RowShell({ onPress, color, children, label }: { onPress?: () => void; color: string; children: React.ReactNode; label: string }) {
  if (!onPress) return <View style={[styles.row, { borderLeftColor: color }]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={(s: any) => [
        styles.row,
        styles.rowButton,
        { borderLeftColor: color },
        (s.hovered || s.focused) && styles.rowHover,
        s.pressed && styles.rowPressed,
      ]}
    >
      <View style={{ flex: 1 }}>{children}</View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function AlertLines({ alerts }: { alerts: DispatchAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <View style={{ marginTop: 6, gap: 3 }}>
      {alerts.map((a) => (
        <Text key={a.id} style={[styles.alert, { color: a.severity === "red" ? "#b91c1c" : a.severity === "amber" ? "#92400e" : "#1d4ed8", borderLeftColor: ALERT_COLORS[a.severity] }]}>
          {ALERT_ICONS[a.kind]} {a.message}
        </Text>
      ))}
    </View>
  );
}

function TripRow({ trip, alerts, onPress }: { trip: BoardTrip; alerts: DispatchAlert[]; onPress: () => void }) {
  const { request, stage, carriedOver, unassigned } = trip;
  const cargo = cargoSummary(request);
  const lines = request.awbLines ?? [];
  const drivers = request.assignedDriverNames ?? [];
  const confirmed = stage === "assigned" && allAssignedConfirmed(request);
  return (
    <RowShell
      onPress={onPress}
      color={alerts.some((a) => a.severity === "red") ? "#dc2626" : stageInfo(stage).color}
      label={`${to12h(request.pickupTime)} ${request.customerName}, ${stageInfo(stage).label}. Open trip`}
    >
      <View style={styles.rowTop}>
        <Text style={styles.time}>{to12h(request.pickupTime) || "—"}</Text>
        {carriedOver && <Tag text={`From ${request.tripDate.slice(5)}`} tone="bad" />}
        <View style={{ flex: 1 }} />
        <StagePill stage={stage} soft />
      </View>
      <Text style={styles.client} numberOfLines={1}>
        {request.customerName || "Customer"}
      </Text>
      <Text style={styles.route} numberOfLines={2}>
        {request.from || "?"} → {request.to || "?"}
      </Text>
      <View style={styles.tags}>
        {!!cargo.units && <Tag text={cargo.units} tone="uld" />}
        {cargo.kg > 0 && <Tag text={`${cargo.kg.toLocaleString("en-US")} kg`} />}
        <Tag text={`${lines.length} AWB`} />
        {lines.some((l) => l.hazmat) && <Tag text="DG" tone="bad" />}
      </View>
      {lines.length > 0 && (
        <Text style={styles.awbs} numberOfLines={2}>
          {lines.map((l) => l.awbNumber || "(no AWB #)").join(" · ")}
        </Text>
      )}
      <Text style={styles.driver} numberOfLines={2}>
        👷 {drivers.length ? drivers.join(", ") : "No driver yet"}
        {stage === "assigned" && drivers.length ? (confirmed ? "  ✓ confirmed" : "  · not confirmed") : ""}
      </Text>
      {unassigned > 0 && stage !== "requested" && (
        <Text style={styles.need}>+ {unassigned} AWB{unassigned === 1 ? "" : "s"} need a driver</Text>
      )}
      <AlertLines alerts={alerts} />
    </RowShell>
  );
}

function InvoiceRow({ request, onPress }: { request: TripRequest; onPress: () => void }) {
  const cargo = cargoSummary(request);
  const lines = request.awbLines ?? [];
  const drivers = request.assignedDriverNames ?? [];
  return (
    <RowShell onPress={onPress} color={stageInfo("delivered").color} label={`${request.customerName}, ${request.tripDate}, to invoice. Open trip`}>
      <View style={styles.rowTop}>
        <Text style={styles.time}>{request.tripDate}</Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.amount}>{formatQuote(request)}</Text>
      </View>
      <Text style={styles.client} numberOfLines={1}>
        {request.customerName || "Customer"}
      </Text>
      <Text style={styles.route} numberOfLines={2}>
        {request.from || "?"} → {request.to || "?"}
      </Text>
      <View style={styles.tags}>
        {!!cargo.units && <Tag text={cargo.units} tone="uld" />}
        {cargo.kg > 0 && <Tag text={`${cargo.kg.toLocaleString("en-US")} kg`} />}
        <Tag text={`${lines.length} AWB`} />
      </View>
      {lines.length > 0 && (
        <Text style={styles.awbs} numberOfLines={2}>
          {lines.map((l) => l.awbNumber || "(no AWB #)").join(" · ")}
        </Text>
      )}
      {drivers.length > 0 && (
        <Text style={styles.driver} numberOfLines={1}>
          👷 {drivers.join(", ")}
        </Text>
      )}
    </RowShell>
  );
}

function ago(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}h ${min % 60}m ago` : `${Math.floor(h / 24)}d ago`;
}

function DriverRow({ state, nowMs, alerts, onPress }: { state: DriverState; nowMs: number; alerts: DispatchAlert[]; onPress?: () => void }) {
  const { driver, busy, current, location, locationStale } = state;
  const color = busy ? stageInfo(current!.stage).color : "#16a34a";
  return (
    <RowShell onPress={onPress} color={color} label={`${driver.name}, ${busy ? "on a trip" : "free"}${onPress ? ". Open trip" : ""}`}>
      <View style={styles.rowTop}>
        <Text style={styles.client}>{driver.name || "Driver"}</Text>
        <View style={{ flex: 1 }} />
        {busy ? (
          <StagePill stage={current!.stage} soft />
        ) : (
          <View style={[styles.free]}>
            <Text style={styles.freeText}>Free</Text>
          </View>
        )}
      </View>
      {current ? (
        <>
          <Text style={styles.route} numberOfLines={1}>
            {current.request.customerName} · pickup {to12h(current.request.pickupTime)}
          </Text>
          <Text style={styles.route} numberOfLines={2}>
            {current.request.from || "?"} → {current.request.to || "?"}
          </Text>
        </>
      ) : (
        <Text style={styles.route}>On duty · no trip in progress</Text>
      )}
      <Text style={[styles.gps, busy && locationStale && styles.gpsBad]}>
        📍 {location ? `Last GPS ${ago(nowMs - location.updatedAt)}` : "No GPS point yet"}
      </Text>
      <AlertLines alerts={alerts} />
    </RowShell>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "#f4f6fa" },
  overlayWide: { flexDirection: "row", backgroundColor: "rgba(15,23,42,0.35)" },
  backdrop: { flex: 1, cursor: "default" as any },
  panel: { backgroundColor: "#f4f6fa" },
  panelWide: { width: 500, maxWidth: "92%", height: "100%", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 24 },
  panelPhone: { flex: 1 },
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 16,
    paddingTop: 18,
    backgroundColor: "#fff",
    borderTopWidth: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e3e7ef",
  },
  title: { fontSize: 19, fontWeight: "800", color: "#0f172a" },
  count: { fontWeight: "800" },
  desc: { fontSize: 12.5, color: "#64748b", marginTop: 3, fontWeight: "500", lineHeight: 17 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#f1f5f9" },
  closeOn: { backgroundColor: "#e2e8f0" },
  closeText: { fontSize: 16, fontWeight: "800", color: "#334155" },
  list: { padding: 12, gap: 8, paddingBottom: 40 },
  empty: { color: "#94a3b8", fontWeight: "600", textAlign: "center", paddingVertical: 30 },
  row: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e3e7ef",
    borderLeftWidth: 4,
    borderRadius: 10,
    padding: 11,
  },
  rowButton: { flexDirection: "row", alignItems: "center", gap: 8, cursor: "pointer" as any },
  rowHover: { borderColor: "#94a3b8", backgroundColor: "#f8fafc" },
  rowPressed: { backgroundColor: "#eef2f7" },
  chevron: { fontSize: 22, color: "#94a3b8", fontWeight: "700" },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 },
  time: { fontWeight: "800", fontSize: 13, color: "#92400e" },
  client: { fontWeight: "800", fontSize: 14, color: "#0f172a" },
  route: { color: "#334155", fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 },
  awbs: { fontSize: 11.5, color: "#64748b", marginTop: 4, fontWeight: "600" },
  driver: { marginTop: 5, fontSize: 12.5, fontWeight: "600", color: "#334155" },
  need: { marginTop: 4, fontSize: 11.5, fontWeight: "800", color: "#b91c1c" },
  alert: { fontSize: 12, fontWeight: "700", borderLeftWidth: 3, paddingLeft: 6 },
  free: { backgroundColor: "#f0fdf4", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 },
  freeText: { color: "#15803d", fontWeight: "800", fontSize: 11 },
  amount: { fontWeight: "800", fontSize: 13, color: "#0f766e" },
  footerLink: { padding: 12, borderRadius: 10, alignItems: "center", borderWidth: 1, borderColor: "#e3e7ef", backgroundColor: "#fff" },
  footerLinkText: { color: "#1d4ed8", fontWeight: "800", fontSize: 13 },
  gps: { marginTop: 5, fontSize: 12, color: "#475569", fontWeight: "600" },
  gpsBad: { color: "#b91c1c" },
});
