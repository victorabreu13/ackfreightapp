import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { subscribeToDriverAwbPay } from "../services/driverPay";
import { AwbPay } from "../types";
import { toLocalDateString } from "../utils/date";
import { addDays, mondayOf, money, tripPayTotal } from "../utils/driverPayDisplay";

function tripDay(pay: AwbPay, fallback: string): string {
  if (pay.tripDate && /^\d{4}-\d{2}-\d{2}$/.test(pay.tripDate)) return pay.tripDate;
  if (typeof pay.lockedAt === "number") return toLocalDateString(new Date(pay.lockedAt));
  return fallback;
}

function TripRow({ pay }: { pay: AwbPay }) {
  const total = tripPayTotal(pay);
  return (
    <View style={styles.card}>
      <Text style={styles.amount}>{money(total)}</Text>
      <Text style={styles.route}>
        {pay.from} → {pay.to}
      </Text>
      <Text style={styles.meta}>
        {pay.awbNumber || "AWB"} · {pay.tripDate || "No date"}
        {pay.pickupTime ? ` · ${pay.pickupTime}` : ""}
      </Text>
      {typeof pay.amount === "number" && <Text style={styles.meta}>Trip pay {money(pay.amount)}</Text>}
      {pay.waitAmount > 0 && <Text style={styles.meta}>Wait {money(pay.waitAmount)}</Text>}
      {pay.adjustment && (
        <Text style={styles.meta}>
          Adjustment {money(pay.adjustment.amount)} · {pay.adjustment.reason}
        </Text>
      )}
    </View>
  );
}

function Section({ title, rows }: { title: string; rows: AwbPay[] }) {
  const total = rows.reduce((sum, row) => sum + tripPayTotal(row), 0);
  return (
    <View style={{ marginTop: 18 }}>
      <Text style={styles.section}>
        {title} · {money(total)}
      </Text>
      {rows.length === 0 ? (
        <Text style={styles.empty}>None</Text>
      ) : (
        rows.map((row) => <TripRow key={`${row.requestId}-${row.awbIndex}`} pay={row} />)
      )}
    </View>
  );
}

export default function DriverEarningsScreen({ navigation }: any) {
  const { user } = useAuth();
  const [rows, setRows] = useState<AwbPay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    return subscribeToDriverAwbPay(
      user.uid,
      (next) => {
        setRows(next.filter((row) => row.locked === true));
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [user]);

  const grouped = useMemo(() => {
    const today = toLocalDateString(new Date());
    const weekStart = mondayOf(today);
    const weekEnd = addDays(weekStart, 6);
    const todayRows: AwbPay[] = [];
    const weekRows: AwbPay[] = [];
    const past = new Map<string, AwbPay[]>();
    rows.forEach((row) => {
      const day = tripDay(row, today);
      if (day === today) todayRows.push(row);
      if (day >= weekStart && day <= weekEnd) weekRows.push(row);
      else if (day < weekStart) {
        const key = mondayOf(day);
        const list = past.get(key) || [];
        list.push(row);
        past.set(key, list);
      }
    });
    const pastWeeks = [...past.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    return { todayRows, weekRows, pastWeeks };
  }, [rows]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>‹ Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Earnings</Text>
      <Text style={styles.hint}>Completed trips. The offer amount stays locked. Adjustments are added on top.</Text>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>No completed trips yet.</Text>
      ) : (
        <>
          <Section title="Today" rows={grouped.todayRows} />
          <Section title="This week" rows={grouped.weekRows} />
          {grouped.pastWeeks.map(([start, list]) => (
            <Section key={start} title={`Week of ${start}`} rows={list} />
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f6fa" },
  backButton: { marginTop: 12, alignSelf: "flex-start" },
  backButtonText: { color: "#1d4ed8", fontWeight: "700", fontSize: 16 },
  title: { fontSize: 22, fontWeight: "800", color: "#111", marginTop: 12 },
  hint: { fontSize: 13, color: "#666", marginTop: 6 },
  section: { fontSize: 16, fontWeight: "800", color: "#111", marginBottom: 8 },
  empty: { color: "#888", marginTop: 8 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10 },
  amount: { fontSize: 28, fontWeight: "800", color: "#111" },
  route: { fontSize: 15, fontWeight: "700", color: "#111", marginTop: 4 },
  meta: { fontSize: 13, color: "#555", marginTop: 3 },
});
