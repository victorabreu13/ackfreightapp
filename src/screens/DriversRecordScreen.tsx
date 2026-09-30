import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { subscribeToAllTrips } from "../services/trips";
import { subscribeToDrivers } from "../services/users";
import { Trip, UserProfile } from "../types";
import DateField from "../components/DateField";
import { notify } from "../utils/alert";
import { toLocalDateString as toDateStr } from "../utils/date";

// All local-calendar-day arithmetic below (not UTC) — trip.date strings are
// local calendar days (see utils/date.ts), so period boundaries need to be
// computed the same way or they'll drift a day off near midnight.
function parseDateStr(s: string) {
  return new Date(`${s}T00:00:00`);
}

function addDays(d: Date, days: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function startOfWeek(d: Date) {
  const day = d.getDay(); // 0 = Sunday
  const diffFromMonday = (day + 6) % 7;
  return addDays(d, -diffFromMonday);
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function formatWithYear(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type Preset = "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "custom";

const PRESETS: { key: Preset; label: string }[] = [
  { key: "thisWeek", label: "This Week" },
  { key: "lastWeek", label: "Last Week" },
  { key: "thisMonth", label: "This Month" },
  { key: "lastMonth", label: "Last Month" },
  { key: "custom", label: "Date Range" },
];

interface DriverStats {
  driverId: string;
  driverName: string;
  driverEmail: string;
  count: number;
}

export default function DriversRecordScreen({ navigation }: any) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<UserProfile[]>([]);
  const [tripsLoaded, setTripsLoaded] = useState(false);
  const [driversLoaded, setDriversLoaded] = useState(false);
  const [preset, setPreset] = useState<Preset>("thisWeek");
  const [customStart, setCustomStart] = useState(new Date());
  const [customEnd, setCustomEnd] = useState(new Date());

  useEffect(() => {
    const unsubTrips = subscribeToAllTrips(
      (data) => {
        setTrips(data);
        setTripsLoaded(true);
      },
      () => setTripsLoaded(true)
    );
    const unsubDrivers = subscribeToDrivers(
      (data) => {
        setDrivers(data);
        setDriversLoaded(true);
      },
      (err) => {
        console.error("subscribeToDrivers error:", err);
        notify("Couldn't load drivers", err.message);
        setDriversLoaded(true);
      }
    );
    return () => {
      unsubTrips();
      unsubDrivers();
    };
  }, []);

  const { periodStart, periodEnd } = useMemo(() => {
    const today = parseDateStr(toDateStr(new Date()));
    const thisWeekStart = startOfWeek(today);

    if (preset === "lastWeek") {
      const start = addDays(thisWeekStart, -7);
      return { periodStart: start, periodEnd: addDays(start, 6) };
    }
    if (preset === "thisMonth") {
      return { periodStart: startOfMonth(today), periodEnd: endOfMonth(today) };
    }
    if (preset === "lastMonth") {
      const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      return { periodStart: startOfMonth(lastMonthDate), periodEnd: endOfMonth(lastMonthDate) };
    }
    if (preset === "custom") {
      const start = parseDateStr(toDateStr(customStart));
      const end = parseDateStr(toDateStr(customEnd));
      return start <= end
        ? { periodStart: start, periodEnd: end }
        : { periodStart: end, periodEnd: start };
    }
    // thisWeek (default)
    return { periodStart: thisWeekStart, periodEnd: addDays(thisWeekStart, 6) };
  }, [preset, customStart, customEnd]);

  const periodStartStr = toDateStr(periodStart);
  const periodEndStr = toDateStr(periodEnd);

  const stats = useMemo(() => {
    const byDriver = new Map<string, DriverStats>();

    const ensure = (id: string, name: string, email: string) => {
      let entry = byDriver.get(id);
      if (!entry) {
        entry = { driverId: id, driverName: name || email, driverEmail: email, count: 0 };
        byDriver.set(id, entry);
      }
      return entry;
    };

    for (const driver of drivers) {
      ensure(driver.uid, driver.name, driver.email);
    }

    for (const trip of trips) {
      if (trip.date < periodStartStr || trip.date > periodEndStr) continue;
      const entry = ensure(trip.driverId, trip.driverName, trip.driverEmail);
      entry.count += 1;
    }

    return Array.from(byDriver.values()).sort((a, b) =>
      a.driverName.localeCompare(b.driverName)
    );
  }, [trips, drivers, periodStartStr, periodEndStr]);

  const total = useMemo(() => stats.reduce((sum, s) => sum + s.count, 0), [stats]);

  const loading = !tripsLoaded || !driversLoaded;

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>‹ Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Drivers Record</Text>
      <Text style={styles.subtitle}>Trip counts per driver, for payroll</Text>

      <View style={styles.presetRow}>
        {PRESETS.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[styles.presetButton, preset === p.key && styles.presetButtonActive]}
            onPress={() => setPreset(p.key)}
          >
            <Text
              style={[
                styles.presetButtonText,
                preset === p.key && styles.presetButtonTextActive,
              ]}
            >
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {preset === "custom" && (
        <View style={styles.customRow}>
          <View style={styles.dateField}>
            <Text style={styles.dateButtonLabel}>From</Text>
            <DateField value={customStart} mode="date" onChange={setCustomStart} />
          </View>
          <View style={styles.dateField}>
            <Text style={styles.dateButtonLabel}>To</Text>
            <DateField value={customEnd} mode="date" onChange={setCustomEnd} />
          </View>
        </View>
      )}

      <Text style={styles.rangeLabel}>
        {formatWithYear(periodStart)} – {formatWithYear(periodEnd)}
      </Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : (
        <>
          <View style={[styles.row, styles.tableHeaderRow]}>
            <Text style={[styles.driverCellText, styles.headerText]}>Driver</Text>
            <Text style={[styles.cellText, styles.headerText]}>Trips</Text>
          </View>
          <FlatList
            data={stats}
            keyExtractor={(item) => item.driverId}
            ListEmptyComponent={<Text style={styles.empty}>No drivers found.</Text>}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <View style={styles.driverCell}>
                  <Text style={styles.driverName}>{item.driverName}</Text>
                  <Text style={styles.driverEmail}>{item.driverEmail}</Text>
                </View>
                <Text style={styles.cellText}>{item.count}</Text>
              </View>
            )}
            ListFooterComponent={
              stats.length > 0 ? (
                <View style={[styles.row, styles.totalsRow]}>
                  <Text style={[styles.driverCellText, styles.totalsText]}>Total</Text>
                  <Text style={[styles.cellText, styles.totalsText]}>{total}</Text>
                </View>
              ) : null
            }
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f6fa", paddingHorizontal: 20, paddingTop: 60 },
  backButton: { marginBottom: 14, alignSelf: "flex-start" },
  backButtonText: { color: "#1d4ed8", fontWeight: "700", fontSize: 16 },
  title: { fontSize: 22, fontWeight: "800", color: "#111" },
  subtitle: { fontSize: 13, color: "#666", marginBottom: 16 },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  presetButton: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  presetButtonActive: { backgroundColor: "#1d4ed8", borderColor: "#1d4ed8" },
  presetButtonText: { color: "#333", fontWeight: "600", fontSize: 13 },
  presetButtonTextActive: { color: "#fff" },
  customRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  dateField: { flex: 1 },
  dateButtonLabel: {
    fontSize: 11,
    color: "#888",
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  rangeLabel: { fontSize: 12, color: "#888", marginBottom: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  tableHeaderRow: { backgroundColor: "transparent", paddingVertical: 4, marginBottom: 4 },
  headerText: { fontSize: 11, fontWeight: "700", color: "#888", textTransform: "uppercase" },
  driverCell: { flex: 3 },
  driverCellText: { flex: 3, fontSize: 13, color: "#111" },
  driverName: { fontSize: 15, fontWeight: "700", color: "#111" },
  driverEmail: { fontSize: 12, color: "#888" },
  cellText: { flex: 1, fontSize: 17, fontWeight: "700", color: "#111", textAlign: "right" },
  totalsRow: { backgroundColor: "#e8edff", marginTop: 2 },
  totalsText: { color: "#1d4ed8" },
  empty: { textAlign: "center", color: "#888", marginTop: 40 },
});
