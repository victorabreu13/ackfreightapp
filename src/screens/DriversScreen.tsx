import React, { useMemo } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AdminShell from "../components/AdminShell";
import { Btn, dispatchStyles, StagePill } from "../components/DispatchUI";
import { useDispatchData } from "../hooks/useDispatchData";
import { toLocalDateString } from "../utils/date";

function ago(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  return min < 1 ? "just now" : min < 60 ? `${min} min ago` : `${Math.floor(min / 60)}h ${min % 60}m ago`;
}

// Links to the existing driver screens (unchanged), grouped in one place.
const LINKS: { route: string; label: string; webOnly?: boolean }[] = [
  { route: "DriversLog", label: "📋 Trip log" },
  { route: "DriversRecord", label: "📊 Trip counts", webOnly: true },
  { route: "DriverPayroll", label: "💵 Payroll", webOnly: true },
  { route: "DriversAvailable", label: "🟢 Availability", webOnly: true },
  { route: "ManageUsers", label: "🤝 Pay agreements (Manage Users)" },
];

export default function DriversScreen({ navigation }: any) {
  const { requests, driverStates, nowMs } = useDispatchData();
  const today = toLocalDateString(new Date(nowMs));

  const rows = useMemo(() => {
    return driverStates
      .map((s) => {
        let awbsToday = 0;
        let kgToday = 0;
        for (const r of requests) {
          if (r.status === "cancelled" || r.tripDate !== today) continue;
          for (const l of r.awbLines ?? []) {
            if (l.assignedDriverId === s.driver.uid) {
              awbsToday += 1;
              kgToday += Number(l.kilograms) || 0;
            }
          }
        }
        return { s, awbsToday, kgToday };
      })
      .sort(
        (a, b) =>
          Number(b.s.busy) - Number(a.s.busy) ||
          Number(!!b.s.driver.onDuty) - Number(!!a.s.driver.onDuty) ||
          a.s.driver.name.localeCompare(b.s.driver.name)
      );
  }, [driverStates, requests, today]);

  return (
    <AdminShell
      navigation={navigation}
      active="Drivers"
      title="Drivers"
      subtitle={`${rows.filter((r) => r.s.busy).length} on a trip · ${rows.filter((r) => !r.s.busy && r.s.driver.onDuty).length} free · ${rows.filter((r) => !r.s.driver.onDuty && !r.s.busy).length} off duty`}
    >
      <View style={styles.links}>
        {LINKS.filter((l) => !l.webOnly || Platform.OS === "web").map((l) => (
          <Btn key={l.route} label={l.label} onPress={() => navigation.navigate(l.route)} />
        ))}
      </View>
      <View style={dispatchStyles.section}>
        {rows.length === 0 && <Text style={dispatchStyles.empty}>No drivers yet.</Text>}
        {rows.map(({ s, awbsToday, kgToday }) => {
          const state = s.busy ? "On a trip" : s.driver.onDuty ? "Free" : "Off duty";
          const stateColor = s.busy ? "#2563eb" : s.driver.onDuty ? "#16a34a" : "#94a3b8";
          return (
            <TouchableOpacity
              key={s.driver.uid}
              style={styles.row}
              disabled={!s.current}
              onPress={() => s.current && navigation.navigate("DispatchDetail", { request: s.current.request })}
            >
              <View style={[styles.dot, { backgroundColor: stateColor }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>
                  {s.driver.name} <Text style={[styles.state, { color: stateColor }]}>· {state}</Text>
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {s.current
                    ? `${s.current.request.customerName}: ${s.current.request.from} → ${s.current.request.to}`
                    : `${awbsToday} AWB${awbsToday === 1 ? "" : "s"} today${kgToday ? ` · ${kgToday.toLocaleString("en-US")} kg` : ""}`}
                </Text>
              </View>
              {s.current && <StagePill stage={s.current.stage} soft />}
              <Text style={[styles.gps, s.busy && s.locationStale && styles.gpsBad]}>
                {s.location ? `GPS ${ago(nowMs - s.location.updatedAt)}` : s.busy ? "No GPS" : ""}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  links: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { fontWeight: "800", color: "#0f172a", fontSize: 14 },
  state: { fontWeight: "700", fontSize: 12.5 },
  meta: { color: "#64748b", fontSize: 12.5, marginTop: 2 },
  gps: { color: "#64748b", fontSize: 12, fontWeight: "600", minWidth: 90, textAlign: "right" },
  gpsBad: { color: "#b91c1c", fontWeight: "800" },
});
