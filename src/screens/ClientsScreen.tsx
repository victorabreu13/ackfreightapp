import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AdminShell from "../components/AdminShell";
import { dispatchStyles } from "../components/DispatchUI";
import { useDispatchData } from "../hooks/useDispatchData";
import { subscribeToCustomers } from "../services/users";
import { UserProfile } from "../types";
import { toLocalDateString } from "../utils/date";
import { isOpenStage } from "../utils/dispatchBoard";
import { tripStage } from "../utils/tripStatus";

// Read-only client overview built from existing customer accounts and trips.
// Grouped by name (case-insensitive), the same way the Trips client filter
// groups them, since one company can have several logins.
export default function ClientsScreen({ navigation }: any) {
  const { requests } = useDispatchData();
  const [customers, setCustomers] = useState<UserProfile[]>([]);

  useEffect(() => subscribeToCustomers(setCustomers, (e) => console.error("customers:", e)), []);

  const rows = useMemo(() => {
    const month = toLocalDateString(new Date()).slice(0, 7);
    const map = new Map<string, { name: string; logins: number; open: number; month: number; toInvoice: number; last: string }>();
    const keyOf = (n: string) => n.trim().toLowerCase();
    for (const c of customers) {
      if (!c.name?.trim()) continue;
      const k = keyOf(c.name);
      const row = map.get(k) ?? { name: c.name.trim(), logins: 0, open: 0, month: 0, toInvoice: 0, last: "" };
      row.logins += 1;
      map.set(k, row);
    }
    for (const r of requests) {
      if (!r.customerName?.trim()) continue;
      const k = keyOf(r.customerName);
      const row = map.get(k) ?? { name: r.customerName.trim(), logins: 0, open: 0, month: 0, toInvoice: 0, last: "" };
      const s = tripStage(r);
      if (isOpenStage(s)) row.open += 1;
      if (s === "delivered") row.toInvoice += 1;
      if (r.tripDate?.startsWith(month) && s !== "cancelled") row.month += 1;
      if (r.tripDate > row.last) row.last = r.tripDate;
      map.set(k, row);
    }
    return [...map.values()].sort((a, b) => b.open - a.open || b.month - a.month || a.name.localeCompare(b.name));
  }, [customers, requests]);

  return (
    <AdminShell navigation={navigation} active="Clients" title="Clients" subtitle={`${rows.length} clients`}>
      <View style={dispatchStyles.section}>
        <View style={[styles.row, styles.head]}>
          <Text style={[styles.c1, styles.h]}>Client</Text>
          <Text style={[styles.c, styles.h]}>Open</Text>
          <Text style={[styles.c, styles.h]}>This month</Text>
          <Text style={[styles.c, styles.h]}>To invoice</Text>
          <Text style={[styles.c, styles.h]}>Last trip</Text>
        </View>
        {rows.length === 0 && <Text style={dispatchStyles.empty}>No clients yet.</Text>}
        {rows.map((r) => (
          <TouchableOpacity
            key={r.name}
            style={styles.row}
            onPress={() => navigation.navigate("Dispatch", { customer: r.name, stage: "all" })}
          >
            <Text style={styles.c1} numberOfLines={1}>
              {r.name}
              {r.logins > 1 ? <Text style={styles.sub}>  · {r.logins} logins</Text> : null}
            </Text>
            <Text style={[styles.c, r.open > 0 && { color: "#2563eb", fontWeight: "800" }]}>{r.open}</Text>
            <Text style={styles.c}>{r.month}</Text>
            <Text style={[styles.c, r.toInvoice > 0 && { color: "#0f766e", fontWeight: "800" }]}>{r.toInvoice}</Text>
            <Text style={styles.c}>{r.last || "—"}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#f1f5f9", gap: 8 },
  head: { borderBottomColor: "#e3e7ef" },
  h: { fontSize: 11, fontWeight: "800", color: "#64748b", textTransform: "uppercase" },
  c1: { flex: 3, fontWeight: "700", color: "#0f172a" },
  c: { flex: 1, color: "#334155", fontWeight: "600" },
  sub: { color: "#94a3b8", fontWeight: "600", fontSize: 12 },
});
