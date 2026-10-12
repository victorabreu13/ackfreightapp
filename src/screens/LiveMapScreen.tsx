import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import AdminShell, { WIDE_BREAKPOINT } from "../components/AdminShell";
import { dispatchStyles, StagePill } from "../components/DispatchUI";
import FleetMap from "../components/FleetMap";
import { useDispatchData } from "../hooks/useDispatchData";
import { isOpenStage } from "../utils/dispatchBoard";
import { fleetMapDrivers, fleetMapRoutes } from "../utils/fleetMapData";
import { tripStage } from "../utils/tripStatus";

function ago(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  return min < 1 ? "just now" : min < 60 ? `${min} min ago` : `${Math.floor(min / 60)}h ${min % 60}m ago`;
}

// Full-screen fleet map: the last point each driver's phone stored
// (tripRequests.driverLocations) — not a route history.
export default function LiveMapScreen({ navigation }: any) {
  const { width, height } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  const { requests, driverStates, nowMs } = useDispatchData();
  const [selected, setSelected] = useState<string | null>(null);

  const mapDrivers = useMemo(() => fleetMapDrivers(driverStates, nowMs), [driverStates, nowMs]);
  const openRequests = useMemo(() => requests.filter((r) => isOpenStage(tripStage(r))), [requests]);
  const routes = useMemo(() => fleetMapRoutes(openRequests), [openRequests]);

  const sorted = [...driverStates].sort((a, b) => Number(b.busy) - Number(a.busy) || a.driver.name.localeCompare(b.driver.name));

  const list = (
    <ScrollView style={wide ? styles.listWide : undefined}>
      {sorted.map((s) => (
        <TouchableOpacity
          key={s.driver.uid}
          style={[styles.row, selected === s.driver.uid && styles.rowOn]}
          onPress={() => {
            setSelected(s.driver.uid);
            if (s.current) navigation.navigate("DispatchDetail", { request: s.current.request });
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{s.driver.name}</Text>
            <Text style={styles.meta} numberOfLines={2}>
              {s.current
                ? `${s.current.request.customerName}: ${s.current.request.from} → ${s.current.request.to}`
                : s.driver.onDuty
                ? "On duty · free"
                : "Off duty"}
            </Text>
            <Text style={[styles.meta, s.busy && s.locationStale && { color: "#b91c1c", fontWeight: "800" }]}>
              {s.location ? `GPS ${ago(nowMs - s.location.updatedAt)}` : "No GPS point"}
            </Text>
          </View>
          {s.current ? <StagePill stage={s.current.stage} soft /> : null}
        </TouchableOpacity>
      ))}
      {sorted.length === 0 && <Text style={dispatchStyles.empty}>No drivers.</Text>}
    </ScrollView>
  );

  return (
    <AdminShell
      navigation={navigation}
      active="LiveMap"
      title="Live Map"
      subtitle={`${mapDrivers.length} driver${mapDrivers.length === 1 ? "" : "s"} with a location · ${openRequests.length} open trips`}
      scroll={!wide}
    >
      <View style={wide ? styles.split : undefined}>
        <View style={{ flex: 1 }}>
          <FleetMap drivers={mapDrivers} routes={routes} height={wide ? Math.max(420, height - 170) : 380} />
          <Text style={styles.note}>
            Each pin is the driver's last stored point (phones share it while a trip is started or loaded). Dashed
            lines join pickup and delivery when the address was geocoded; they are not the driven route.
          </Text>
        </View>
        {list}
      </View>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  split: { flexDirection: "row", gap: 12, flex: 1 },
  listWide: { width: 320, flexGrow: 0 },
  row: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e3e7ef",
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
  },
  rowOn: { borderColor: "#1d4ed8" },
  name: { fontWeight: "800", color: "#0f172a" },
  meta: { color: "#64748b", fontSize: 12, marginTop: 2 },
  note: { color: "#64748b", fontSize: 11.5, marginTop: 6, marginBottom: 10 },
});
