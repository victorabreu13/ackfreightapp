import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import DateField from "../components/DateField";
import { setTripPaid, subscribeToAllTrips } from "../services/trips";
import { setDriverPayRate, subscribeToDrivers } from "../services/users";
import { DriverPayType, Trip, UserProfile } from "../types";
import { notify } from "../utils/alert";

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseDateStr(s: string) {
  return new Date(`${s}T00:00:00Z`);
}

function addDays(d: Date, days: number) {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function startOfWeek(d: Date) {
  const day = d.getUTCDay(); // 0 = Sunday
  const diffFromMonday = (day + 6) % 7;
  return addDays(d, -diffFromMonday);
}

function startOfMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function endOfMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

function dayOfMonth(d: Date, day: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), day));
}

function formatWithYear(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

type Preset =
  | "allTime"
  | "thisWeek"
  | "lastWeek"
  | "thisMonth"
  | "lastMonth"
  | "firstHalf"
  | "secondHalf"
  | "custom";

const PRESETS: { key: Preset; label: string }[] = [
  { key: "allTime", label: "All Time" },
  { key: "thisWeek", label: "This Week" },
  { key: "lastWeek", label: "Last Week" },
  { key: "thisMonth", label: "This Month" },
  { key: "lastMonth", label: "Last Month" },
  { key: "firstHalf", label: "1st – 15th" },
  { key: "secondHalf", label: "16th – End" },
  { key: "custom", label: "Date Range" },
];

type TripStatusFilter = "all" | "unpaid" | "paid";

const TRIP_STATUS_FILTERS: { key: TripStatusFilter; label: string }[] = [
  { key: "unpaid", label: "Unpaid" },
  { key: "paid", label: "Paid" },
  { key: "all", label: "All" },
];

const PAY_TYPE_LABELS: Record<DriverPayType, string> = {
  perTrip: "per trip",
  perKilogram: "per kilogram",
};

function amountFor(trips: Trip[], payType: DriverPayType | undefined, payRate: number | undefined) {
  if (!payType || !payRate) return 0;
  if (payType === "perTrip") return trips.length * payRate;
  return trips.reduce((sum, t) => sum + (t.kilograms || 0), 0) * payRate;
}

export default function DriverPayrollScreen({ navigation }: any) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<UserProfile[]>([]);
  const [tripsLoaded, setTripsLoaded] = useState(false);
  const [driversLoaded, setDriversLoaded] = useState(false);
  const [preset, setPreset] = useState<Preset>("allTime");
  const [customStart, setCustomStart] = useState(new Date());
  const [customEnd, setCustomEnd] = useState(new Date());

  const [expandedDriverId, setExpandedDriverId] = useState<string | null>(null);
  const [tripStatusFilter, setTripStatusFilter] = useState<TripStatusFilter>("unpaid");
  const [editingRateId, setEditingRateId] = useState<string | null>(null);
  const [editPayType, setEditPayType] = useState<DriverPayType>("perTrip");
  const [editPayRate, setEditPayRate] = useState("");
  const [savingRate, setSavingRate] = useState(false);
  const [togglingTripId, setTogglingTripId] = useState<string | null>(null);
  const [bulkPaying, setBulkPaying] = useState<string | null>(null);

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

    if (preset === "allTime") {
      return { periodStart: null as Date | null, periodEnd: null as Date | null };
    }
    if (preset === "lastWeek") {
      const start = addDays(thisWeekStart, -7);
      return { periodStart: start, periodEnd: addDays(start, 6) };
    }
    if (preset === "thisMonth") {
      return { periodStart: startOfMonth(today), periodEnd: endOfMonth(today) };
    }
    if (preset === "lastMonth") {
      const lastMonthDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      return { periodStart: startOfMonth(lastMonthDate), periodEnd: endOfMonth(lastMonthDate) };
    }
    if (preset === "firstHalf") {
      return { periodStart: startOfMonth(today), periodEnd: dayOfMonth(today, 15) };
    }
    if (preset === "secondHalf") {
      return { periodStart: dayOfMonth(today, 16), periodEnd: endOfMonth(today) };
    }
    if (preset === "custom") {
      const start = parseDateStr(toDateStr(customStart));
      const end = parseDateStr(toDateStr(customEnd));
      return start <= end
        ? { periodStart: start, periodEnd: end }
        : { periodStart: end, periodEnd: start };
    }
    return { periodStart: thisWeekStart, periodEnd: addDays(thisWeekStart, 6) };
  }, [preset, customStart, customEnd]);

  const periodStartStr = periodStart ? toDateStr(periodStart) : null;
  const periodEndStr = periodEnd ? toDateStr(periodEnd) : null;

  const tripsInPeriod = useMemo(() => {
    if (!periodStartStr || !periodEndStr) return trips;
    return trips.filter((t) => t.date >= periodStartStr && t.date <= periodEndStr);
  }, [trips, periodStartStr, periodEndStr]);

  const loading = !tripsLoaded || !driversLoaded;

  const startEditingRate = (driver: UserProfile) => {
    setEditingRateId(driver.uid);
    setEditPayType(driver.payType ?? "perTrip");
    setEditPayRate(driver.payRate ? String(driver.payRate) : "");
  };

  const saveRate = async (driverId: string) => {
    const rate = parseFloat(editPayRate);
    if (!rate || rate <= 0) {
      notify("Enter a rate", "Enter a rate greater than 0.");
      return;
    }
    setSavingRate(true);
    try {
      await setDriverPayRate(driverId, editPayType, rate);
      setEditingRateId(null);
    } catch (e: any) {
      notify("Couldn't save rate", e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setSavingRate(false);
    }
  };

  const toggleTripPaid = async (trip: Trip) => {
    setTogglingTripId(trip.id);
    try {
      await setTripPaid(trip.id, !trip.paid);
    } catch (e: any) {
      notify("Couldn't update", e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setTogglingTripId(null);
    }
  };

  const markAllPaid = async (driverId: string, targetTrips: Trip[], paid: boolean) => {
    setBulkPaying(driverId);
    try {
      for (const t of targetTrips) {
        await setTripPaid(t.id, paid);
      }
    } catch (e: any) {
      notify("Couldn't update trips", e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setBulkPaying(null);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>‹ Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Driver Payroll</Text>
      <Text style={styles.subtitle}>What each driver is owed, and what's already been paid</Text>

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
        {periodStart && periodEnd
          ? `${formatWithYear(periodStart)} – ${formatWithYear(periodEnd)}`
          : "All trips ever logged"}
      </Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : drivers.length === 0 ? (
        <Text style={styles.empty}>No drivers found.</Text>
      ) : (
        drivers.map((driver) => {
          const driverTrips = tripsInPeriod.filter((t) => t.driverId === driver.uid);
          const unpaidTrips = driverTrips.filter((t) => !t.paid);
          const paidTrips = driverTrips.filter((t) => t.paid);
          const unpaidAmount = amountFor(unpaidTrips, driver.payType, driver.payRate);
          const paidAmount = amountFor(paidTrips, driver.payType, driver.payRate);
          const totalKg = driverTrips.reduce((sum, t) => sum + (t.kilograms || 0), 0);
          const isExpanded = expandedDriverId === driver.uid;
          const isEditingRate = editingRateId === driver.uid;

          return (
            <View key={driver.uid} style={styles.driverCard}>
              <TouchableOpacity
                style={styles.driverHeader}
                onPress={() => setExpandedDriverId(isExpanded ? null : driver.uid)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.driverName}>{driver.name}</Text>
                  <Text style={styles.driverEmail}>{driver.email}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.unpaidAmount}>{money(unpaidAmount)} owed</Text>
                  {paidAmount > 0 && (
                    <Text style={styles.paidAmount}>{money(paidAmount)} paid</Text>
                  )}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.viewTripsButton}
                onPress={() => setExpandedDriverId(isExpanded ? null : driver.uid)}
              >
                <Text style={styles.viewTripsButtonText}>
                  {isExpanded ? "▾ Hide trips" : "▸ View trips"}
                </Text>
              </TouchableOpacity>

              {isEditingRate ? (
                <View style={styles.rateEditor}>
                  <View style={styles.payTypeRow}>
                    <TouchableOpacity
                      style={[
                        styles.payTypeButton,
                        editPayType === "perTrip" && styles.payTypeButtonActive,
                      ]}
                      onPress={() => setEditPayType("perTrip")}
                    >
                      <Text
                        style={[
                          styles.payTypeButtonText,
                          editPayType === "perTrip" && styles.payTypeButtonTextActive,
                        ]}
                      >
                        Per Trip
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.payTypeButton,
                        editPayType === "perKilogram" && styles.payTypeButtonActive,
                      ]}
                      onPress={() => setEditPayType("perKilogram")}
                    >
                      <Text
                        style={[
                          styles.payTypeButtonText,
                          editPayType === "perKilogram" && styles.payTypeButtonTextActive,
                        ]}
                      >
                        Per Kilogram
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.rateInputRow}>
                    <Text style={styles.dollarSign}>$</Text>
                    <TextInput
                      style={styles.rateInput}
                      keyboardType="numeric"
                      placeholder="0.00"
                      value={editPayRate}
                      onChangeText={setEditPayRate}
                    />
                    <TouchableOpacity
                      style={styles.saveRateButton}
                      onPress={() => saveRate(driver.uid)}
                      disabled={savingRate}
                    >
                      {savingRate ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.saveRateButtonText}>Save</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setEditingRateId(null)}>
                      <Text style={styles.cancelRateText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity onPress={() => startEditingRate(driver)}>
                  <Text style={styles.rateText}>
                    {driver.payType && driver.payRate
                      ? `${money(driver.payRate)} ${PAY_TYPE_LABELS[driver.payType]} · Edit`
                      : "No pay rate set · Tap to set one"}
                  </Text>
                </TouchableOpacity>
              )}

              <Text style={styles.tripMeta}>
                {driverTrips.length} trip{driverTrips.length === 1 ? "" : "s"}
                {driver.payType === "perKilogram" ? ` · ${totalKg} kg total` : ""}
              </Text>

              {isExpanded && (
                <View style={styles.tripList}>
                  {driverTrips.length === 0 ? (
                    <Text style={styles.noTrips}>No trips in this period.</Text>
                  ) : (
                    <>
                      <View style={styles.statusFilterRow}>
                        {TRIP_STATUS_FILTERS.map((f) => (
                          <TouchableOpacity
                            key={f.key}
                            style={[
                              styles.statusFilterButton,
                              tripStatusFilter === f.key && styles.statusFilterButtonActive,
                            ]}
                            onPress={() => setTripStatusFilter(f.key)}
                          >
                            <Text
                              style={[
                                styles.statusFilterButtonText,
                                tripStatusFilter === f.key && styles.statusFilterButtonTextActive,
                              ]}
                            >
                              {f.label} (
                              {f.key === "unpaid"
                                ? unpaidTrips.length
                                : f.key === "paid"
                                ? paidTrips.length
                                : driverTrips.length}
                              )
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {(() => {
                        const visibleTrips =
                          tripStatusFilter === "all"
                            ? driverTrips
                            : tripStatusFilter === "unpaid"
                            ? unpaidTrips
                            : paidTrips;
                        const visibleUnpaid = visibleTrips.filter((t) => !t.paid);
                        const visiblePaid = visibleTrips.filter((t) => t.paid);

                        if (visibleTrips.length === 0) {
                          return <Text style={styles.noTrips}>No {tripStatusFilter} trips in this period.</Text>;
                        }

                        return (
                          <>
                            <TouchableOpacity
                              style={styles.selectAllRow}
                              onPress={() =>
                                markAllPaid(
                                  driver.uid,
                                  visibleUnpaid.length > 0 ? visibleUnpaid : visiblePaid,
                                  visibleUnpaid.length > 0
                                )
                              }
                              disabled={bulkPaying === driver.uid}
                            >
                              {bulkPaying === driver.uid ? (
                                <ActivityIndicator size="small" color="#1d4ed8" />
                              ) : (
                                <Text style={styles.checkbox}>{visibleUnpaid.length === 0 ? "☑" : "☐"}</Text>
                              )}
                              <Text style={styles.selectAllText}>
                                {visibleUnpaid.length === 0
                                  ? `All ${visibleTrips.length} shown paid · tap to unmark`
                                  : `Select all (mark ${visibleUnpaid.length} shown as paid)`}
                              </Text>
                            </TouchableOpacity>

                            {visibleTrips.map((trip) => (
                              <TouchableOpacity
                                key={trip.id}
                                style={styles.tripRow}
                                onPress={() => toggleTripPaid(trip)}
                                disabled={togglingTripId === trip.id}
                              >
                                {togglingTripId === trip.id ? (
                                  <ActivityIndicator size="small" color="#1d4ed8" style={styles.checkbox} />
                                ) : (
                                  <Text style={styles.checkbox}>{trip.paid ? "☑" : "☐"}</Text>
                                )}
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.tripDate}>
                                    {trip.date} · {trip.from} → {trip.to}
                                  </Text>
                                  <Text style={styles.tripDetail}>
                                    AWB {trip.awbNumber || "—"} · {trip.kilograms || 0} kg
                                    {trip.paid ? " · Paid" : ""}
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            ))}
                          </>
                        );
                      })()}
                    </>
                  )}
                </View>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f6fa" },
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
  rangeLabel: { fontSize: 12, color: "#888", marginBottom: 16 },
  empty: { textAlign: "center", color: "#888", marginTop: 40 },
  driverCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  driverHeader: { flexDirection: "row", alignItems: "flex-start" },
  driverName: { fontSize: 16, fontWeight: "800", color: "#111" },
  driverEmail: { fontSize: 12, color: "#888", marginTop: 2 },
  viewTripsButton: { marginTop: 8, alignSelf: "flex-start" },
  viewTripsButtonText: { color: "#1d4ed8", fontWeight: "700", fontSize: 13 },
  unpaidAmount: { fontSize: 17, fontWeight: "800", color: "#c0392b" },
  paidAmount: { fontSize: 12, color: "#15803d", marginTop: 2 },
  rateText: { fontSize: 13, color: "#1d4ed8", fontWeight: "600", marginTop: 10 },
  rateEditor: { marginTop: 12 },
  payTypeRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  payTypeButton: {
    flex: 1,
    backgroundColor: "#f5f6fa",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 8,
    alignItems: "center",
  },
  payTypeButtonActive: { backgroundColor: "#1d4ed8", borderColor: "#1d4ed8" },
  payTypeButtonText: { color: "#333", fontWeight: "600", fontSize: 13 },
  payTypeButtonTextActive: { color: "#fff" },
  rateInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dollarSign: { fontSize: 15, color: "#111", fontWeight: "700" },
  rateInput: {
    flex: 1,
    backgroundColor: "#f5f6fa",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 14,
  },
  saveRateButton: {
    backgroundColor: "#1d4ed8",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  saveRateButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  cancelRateText: { color: "#888", fontWeight: "600", fontSize: 13 },
  tripMeta: { fontSize: 12, color: "#888", marginTop: 10 },
  tripList: { marginTop: 12, borderTopWidth: 1, borderTopColor: "#eee", paddingTop: 10 },
  statusFilterRow: { flexDirection: "row", gap: 6, marginBottom: 10 },
  statusFilterButton: {
    backgroundColor: "#f5f6fa",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  statusFilterButtonActive: { backgroundColor: "#1d4ed8", borderColor: "#1d4ed8" },
  statusFilterButtonText: { color: "#333", fontWeight: "600", fontSize: 12 },
  statusFilterButtonTextActive: { color: "#fff" },
  noTrips: { fontSize: 13, color: "#888" },
  selectAllRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e8edff",
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  selectAllText: { color: "#1d4ed8", fontWeight: "700", fontSize: 13, marginLeft: 10, flex: 1 },
  checkbox: { fontSize: 20, color: "#1d4ed8", width: 22, textAlign: "center" },
  tripRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f6fa",
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
  },
  tripDate: { fontSize: 13, fontWeight: "700", color: "#111", marginLeft: 10 },
  tripDetail: { fontSize: 12, color: "#888", marginTop: 2, marginLeft: 10 },
});
