import React, { useMemo, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import { ActivityIndicator, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import AdminShell, { WIDE_BREAKPOINT } from "../components/AdminShell";
import CounterDrawer, { DrawerContent } from "../components/CounterDrawer";
import { Btn } from "../components/DispatchUI";
import { AttentionPanel, Kpi, MapTile, QuickLinks, TripTile } from "../components/TodayUI";
import { useDispatchData } from "../hooks/useDispatchData";
import {
  alertsByTarget,
  computeAlerts,
  CounterKey,
  DispatchAlert,
  dayCounters,
  onDutyDrivers,
  pendingInvoiceRequests,
  tripsForCounter,
  tripsForDay,
} from "../utils/dispatchBoard";
import { toLocalDateString } from "../utils/date";
import { TRIP_STAGES, TripStage } from "../utils/tripStatus";
import { confirmMarkInvoiced } from "../utils/invoiceActions";

function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return toLocalDateString(new Date(y, m - 1, d + delta));
}

function prettyDay(day: string, today: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  if (day === today) return `Today · ${label}`;
  if (day === shiftDay(today, -1)) return `Yesterday · ${label}`;
  if (day === shiftDay(today, 1)) return `Tomorrow · ${label}`;
  return label;
}

// Dispatcher landing screen: counters, alerts, one board column per trip
// stage, and the fleet map — everything read from existing data.
export default function TodayScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  const { requests, driverStates, leads, loading, error, nowMs } = useDispatchData({ leads: true });
  const today = toLocalDateString(new Date(nowMs));
  const [day, setDay] = useState(today);

  const trips = useMemo(() => tripsForDay(requests, day, today), [requests, day, today]);
  const counters = useMemo(() => dayCounters(trips, driverStates), [trips, driverStates]);
  const alerts = useMemo(
    () => (day === today ? computeAlerts(trips.map((t) => t.request), driverStates, nowMs, leads.length) : []),
    [trips, driverStates, nowMs, leads.length, day, today]
  );
  const alertedRequestIds = useMemo(
    () => new Set(alerts.filter((a) => a.severity === "red" && a.requestId).map((a) => a.requestId!)),
    [alerts]
  );
  const targets = useMemo(() => alertsByTarget(alerts), [alerts]);
  const isFocused = useIsFocused();
  // Which counter's list is open. Kept while a trip is opened from the list,
  // so going Back returns to the same list.
  const [openCounter, setOpenCounter] = useState<CounterKey | null>(null);

  const openRequest = (id?: string) => {
    const request = requests.find((r) => r.id === id);
    if (request) navigation.navigate("DispatchDetail", { request });
  };
  const onAlert = (a: DispatchAlert) => {
    if (a.kind === "new_leads") navigation.navigate("NewRequests");
    else if (a.requestId) openRequest(a.requestId);
    else navigation.navigate("Drivers");
  };

  const pendingInvoice = useMemo(() => pendingInvoiceRequests(requests), [requests]);
  const isToday = day === today;
  const dayText = isToday ? "today" : prettyDay(day, today);
  const carryNote = isToday ? ", plus unfinished trips carried over from earlier days" : "";
  const COUNTERS: Record<CounterKey, { label: string; color: string; value: string | number; description: string }> = {
    total: {
      label: "Trips",
      color: "#0f172a",
      value: counters.total,
      description: `Every trip on the board for ${dayText}${carryNote} (cancelled trips excluded), by pickup time.`,
    },
    requested: {
      label: "Need a driver",
      color: TRIP_STAGES.requested.color,
      value: counters.requested,
      description: `Trips in "Requested": no AWB has a driver yet.`,
    },
    assigned: {
      label: "Assigned",
      color: TRIP_STAGES.assigned.color,
      value: counters.assigned,
      description: `Trips in "Assigned": driver set, not started yet.`,
    },
    onTheRoad: {
      label: "On the road",
      color: TRIP_STAGES.in_transit.color,
      value: counters.onTheRoad,
      description: `Trips in "To Pickup" or "Loaded / In Transit": a driver has started.`,
    },
    delivered: {
      label: "Delivered",
      color: TRIP_STAGES.delivered.color,
      value: counters.delivered,
      description: `Trips with every AWB completed (including invoiced ones).`,
    },
    pendingInvoice: {
      label: "Pending invoice",
      color: TRIP_STAGES.invoiced.color,
      value: pendingInvoice.length,
      description: "Delivered trips not invoiced yet, any date (oldest first) — the same list as the To Invoice page.",
    },
    drivers: {
      label: "Drivers free / on duty",
      color: "#16a34a",
      value: `${counters.driversFree} / ${counters.driversOnDuty}`,
      description: `Active drivers marked on duty — free first, then those on a trip, with their last GPS point.`,
    },
  };
  const drawerContent: DrawerContent | null = openCounter
    ? openCounter === "drivers"
      ? { kind: "drivers", drivers: onDutyDrivers(driverStates) }
      : openCounter === "pendingInvoice"
      ? { kind: "invoice", requests: pendingInvoice }
      : { kind: "trips", trips: tripsForCounter(trips, openCounter) }
    : null;

  // Four calm columns. "To pickup" and "Loaded / in transit" read as one stage
  // ("On the road") and Invoiced trips stay in Delivered.
  const COLUMNS: { label: string; stages: TripStage[] }[] = [
    { label: "Requested", stages: ["requested"] },
    { label: "Assigned", stages: ["assigned"] },
    { label: "On the road", stages: ["to_pickup", "in_transit"] },
    { label: "Delivered", stages: ["delivered", "invoiced"] },
  ];
  const columns = COLUMNS.map((c) => ({
    label: c.label,
    items: trips.filter((t) => c.stages.includes(t.stage)),
  }));

  const board = (
    <ScrollView horizontal={!wide} contentContainerStyle={wide ? styles.boardWide : styles.boardNarrow}>
      {columns.map(({ label, items }) => (
        <View key={label} style={[styles.col, wide ? { flex: 1 } : { width: 260 }]}>
          <View style={styles.colHead}>
            <Text style={styles.colTitle}>{label}</Text>
            <Text style={styles.colCount}>{items.length}</Text>
          </View>
          {items.length === 0 && <Text style={styles.colEmpty}>No trips</Text>}
          {items.map((t) => (
            <TripTile
              key={t.request.id}
              trip={t}
              needsAttention={alertedRequestIds.has(t.request.id)}
              onPress={() => navigation.navigate("DispatchDetail", { request: t.request })}
            />
          ))}
        </View>
      ))}
    </ScrollView>
  );

  const onTheRoadDrivers = Math.max(0, counters.driversOnDuty - counters.driversFree);
  const mapSummary =
    counters.driversOnDuty === 0
      ? "No drivers on duty"
      : `${onTheRoadDrivers} on the road · ${counters.driversFree} free`;

  return (
    <AdminShell
      navigation={navigation}
      active="Today"
      title="Today"
      subtitle={prettyDay(day, today)}
      badges={{ NewRequests: leads.length || undefined, Today: alerts.filter((a) => a.severity === "red").length || undefined }}
      right={
        <>
          <Btn label="◀" onPress={() => setDay(shiftDay(day, -1))} />
          {day !== today && <Btn label="Today" onPress={() => setDay(today)} />}
          <Btn label="▶" onPress={() => setDay(shiftDay(day, 1))} />
          <Btn label="+ New trip" primary onPress={() => navigation.navigate("DispatchNewRequest")} />
        </>
      }
    >
      {loading ? (
        <ActivityIndicator size="large" style={{ marginTop: 40 }} />
      ) : (
        <>
          {!!error && <Text style={styles.error}>Couldn't load trips: {error}</Text>}
          <View style={styles.counters}>
            {(["total", "requested", "onTheRoad", "delivered"] as CounterKey[]).map((k) => (
              <Kpi
                key={k}
                value={COUNTERS[k].value}
                label={COUNTERS[k].label}
                danger={k === "requested" && counters.requested > 0}
                selected={openCounter === k}
                onPress={() => setOpenCounter(k)}
              />
            ))}
          </View>
          {openCounter && drawerContent && (
            <CounterDrawer
              visible={isFocused}
              onClose={() => setOpenCounter(null)}
              title={COUNTERS[openCounter].label}
              description={COUNTERS[openCounter].description}
              color={COUNTERS[openCounter].color}
              content={drawerContent}
              alertsByRequest={targets.byRequest}
              alertsByDriver={targets.byDriver}
              nowMs={nowMs}
              onOpenTrip={(request) => navigation.navigate("DispatchDetail", { request })}
              onMarkInvoiced={openCounter === "pendingInvoice" ? (request) => confirmMarkInvoiced(request) : undefined}
              footerLink={
                openCounter === "pendingInvoice"
                  ? {
                      label: "Open To Invoice →",
                      onPress: () => {
                        setOpenCounter(null);
                        navigation.navigate("ToInvoice");
                      },
                    }
                  : undefined
              }
            />
          )}
          {day === today && <AttentionPanel alerts={alerts} onPress={onAlert} />}
          {board}
          <QuickLinks
            items={[
              { label: `${pendingInvoice.length} pending invoice`, onPress: () => setOpenCounter("pendingInvoice") },
              { label: `${counters.driversFree} of ${counters.driversOnDuty} drivers free`, onPress: () => setOpenCounter("drivers") },
            ]}
          />
          <MapTile summary={mapSummary} onPress={() => navigation.navigate("LiveMap")} />
        </>
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  counters: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 14 },
  boardWide: { flexDirection: "row", gap: 12, flexGrow: 1 },
  boardNarrow: { flexDirection: "row", gap: 12, paddingBottom: 6 },
  col: { minHeight: 200 },
  colHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, paddingHorizontal: 2 },
  colTitle: { fontSize: 12.5, fontWeight: "700", color: "#475569" },
  colCount: { fontSize: 12.5, fontWeight: "700", color: "#94a3b8" },
  colEmpty: { color: "#94a3b8", fontSize: 12.5, paddingVertical: 8, paddingHorizontal: 2 },
  error: { color: "#b91c1c", fontWeight: "700", marginBottom: 8 },
});
