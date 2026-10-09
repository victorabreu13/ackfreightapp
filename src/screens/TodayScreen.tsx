import React, { useMemo, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import { ActivityIndicator, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import AdminShell, { WIDE_BREAKPOINT } from "../components/AdminShell";
import CounterDrawer, { DrawerContent } from "../components/CounterDrawer";
import { AlertsStrip, Btn, Counter, dispatchStyles, TripBoardCard } from "../components/DispatchUI";
import FleetMap from "../components/FleetMap";
import { useDispatchData } from "../hooks/useDispatchData";
import {
  alertsByTarget,
  computeAlerts,
  CounterKey,
  DispatchAlert,
  dayCounters,
  onDutyDrivers,
  tripsForCounter,
  tripsForDay,
} from "../utils/dispatchBoard";
import { toLocalDateString } from "../utils/date";
import { fleetMapDrivers, fleetMapRoutes } from "../utils/fleetMapData";
import { BOARD_STAGES, stageInfo, TRIP_STAGES } from "../utils/tripStatus";

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
  const mapDrivers = useMemo(() => fleetMapDrivers(driverStates, nowMs), [driverStates, nowMs]);
  const mapRoutes = useMemo(() => fleetMapRoutes(trips.map((t) => t.request)), [trips]);

  const openRequest = (id?: string) => {
    const request = requests.find((r) => r.id === id);
    if (request) navigation.navigate("DispatchDetail", { request });
  };
  const onAlert = (a: DispatchAlert) => {
    if (a.kind === "new_leads") navigation.navigate("NewRequests");
    else if (a.requestId) openRequest(a.requestId);
    else navigation.navigate("Drivers");
  };

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
      : { kind: "trips", trips: tripsForCounter(trips, openCounter) }
    : null;

  const columns = BOARD_STAGES.map((stage) => ({
    stage,
    items: trips.filter((t) => t.stage === stage || (stage === "delivered" && t.stage === "invoiced")),
  }));

  const board = (
    <ScrollView horizontal={!wide} contentContainerStyle={wide ? styles.boardWide : styles.boardNarrow}>
      {columns.map(({ stage, items }) => {
        const s = stageInfo(stage);
        return (
          <View key={stage} style={[styles.col, wide ? { flex: 1 } : { width: 250 }]}>
            <View style={styles.colHead}>
              <View style={[styles.dot, { backgroundColor: s.color }]} />
              <Text style={styles.colTitle} numberOfLines={2}>
                {s.label}
              </Text>
              <Text style={styles.colCount}>{items.length}</Text>
            </View>
            {items.length === 0 && <Text style={styles.colEmpty}>—</Text>}
            {items.map((t) => (
              <TripBoardCard
                key={t.request.id}
                trip={t}
                alert={alertedRequestIds.has(t.request.id)}
                onPress={() => navigation.navigate("DispatchDetail", { request: t.request })}
              />
            ))}
          </View>
        );
      })}
    </ScrollView>
  );

  const map = (
    <View style={wide ? styles.mapWide : styles.mapNarrow}>
      <View style={styles.mapHead}>
        <Text style={dispatchStyles.sectionTitle}>Live Map</Text>
        <Btn label="Full screen ⤢" onPress={() => navigation.navigate("LiveMap")} />
      </View>
      <FleetMap
        drivers={mapDrivers}
        routes={mapRoutes}
        height={wide ? 460 : 300}
        onPressDriver={() => navigation.navigate("LiveMap")}
      />
      <View style={styles.legend}>
        {(["to_pickup", "in_transit"] as const).map((k) => (
          <Text key={k} style={styles.legendItem}>
            <Text style={{ color: TRIP_STAGES[k].color }}>●</Text> {TRIP_STAGES[k].short}
          </Text>
        ))}
        <Text style={styles.legendItem}>
          <Text style={{ color: "#16a34a" }}>●</Text> Free
        </Text>
        <Text style={styles.legendItem}>
          <Text style={{ color: "#64748b" }}>●</Text> GPS lost
        </Text>
      </View>
      {mapDrivers.length === 0 && (
        <Text style={dispatchStyles.empty}>No driver has shared a location yet.</Text>
      )}
    </View>
  );

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
            {(Object.keys(COUNTERS) as CounterKey[]).map((k) => (
              <Counter
                key={k}
                value={COUNTERS[k].value}
                label={COUNTERS[k].label}
                color={COUNTERS[k].color}
                selected={openCounter === k}
                hint={k === "drivers" ? "Show the drivers" : "Show these trips"}
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
            />
          )}
          {day === today && <AlertsStrip alerts={alerts} onPress={onAlert} />}
          {wide ? (
            <View style={styles.split}>
              <View style={{ flex: 1, minWidth: 0 }}>{board}</View>
              {map}
            </View>
          ) : (
            <>
              {board}
              {map}
            </>
          )}
        </>
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  counters: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 },
  split: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  boardWide: { flexDirection: "row", gap: 7, flexGrow: 1 },
  boardNarrow: { flexDirection: "row", gap: 7, paddingBottom: 6 },
  col: { backgroundColor: "#eef1f6", borderRadius: 10, padding: 6, minHeight: 420 },
  colHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8, paddingHorizontal: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  colTitle: { flex: 1, fontSize: 11.5, fontWeight: "800", color: "#334155", textTransform: "uppercase" },
  colCount: { backgroundColor: "#fff", borderRadius: 10, paddingHorizontal: 7, fontWeight: "800", color: "#475569", fontSize: 12 },
  colEmpty: { color: "#94a3b8", textAlign: "center", paddingVertical: 8 },
  mapWide: { width: 380 },
  mapNarrow: { marginTop: 12 },
  mapHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 6 },
  legendItem: { fontSize: 11.5, fontWeight: "700", color: "#475569" },
  error: { color: "#b91c1c", fontWeight: "700", marginBottom: 8 },
});
