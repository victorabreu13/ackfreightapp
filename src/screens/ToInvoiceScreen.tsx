import React, { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AdminShell from "../components/AdminShell";
import { cargoSummary, dispatchStyles } from "../components/DispatchUI";
import { useDispatchData } from "../hooks/useDispatchData";
import { formatQuote } from "../utils/quote";
import { tripStage } from "../utils/tripStatus";

// Delivered trips that haven't been invoiced yet. Invoicing itself still
// happens on the trip screen (QuickBooks or "Mark invoiced"), unchanged.
export default function ToInvoiceScreen({ navigation }: any) {
  const { requests } = useDispatchData();
  const rows = useMemo(
    () =>
      requests
        .filter((r) => tripStage(r) === "delivered")
        .sort((a, b) => (a.tripDate < b.tripDate ? -1 : 1)),
    [requests]
  );

  return (
    <AdminShell
      navigation={navigation}
      active="ToInvoice"
      title="To Invoice"
      subtitle={`${rows.length} delivered trip${rows.length === 1 ? "" : "s"} not invoiced yet`}
    >
      <View style={dispatchStyles.section}>
        <View style={[styles.row, styles.head]}>
          <Text style={[styles.c, styles.h]}>Date</Text>
          <Text style={[styles.c2, styles.h]}>Client</Text>
          <Text style={[styles.c3, styles.h]}>Route</Text>
          <Text style={[styles.c2, styles.h]}>Cargo</Text>
          <Text style={[styles.c, styles.h]}>Quote</Text>
        </View>
        {rows.length === 0 && <Text style={dispatchStyles.empty}>Nothing waiting to be invoiced.</Text>}
        {rows.map((r) => {
          const cargo = cargoSummary(r);
          return (
            <TouchableOpacity key={r.id} style={styles.row} onPress={() => navigation.navigate("DispatchDetail", { request: r })}>
              <Text style={styles.c}>{r.tripDate}</Text>
              <Text style={[styles.c2, { fontWeight: "800" }]} numberOfLines={1}>{r.customerName}</Text>
              <Text style={styles.c3} numberOfLines={1}>{r.from} → {r.to}</Text>
              <Text style={styles.c2} numberOfLines={1}>{cargo.units}{cargo.kg ? ` · ${cargo.kg.toLocaleString("en-US")} kg` : ""}</Text>
              <Text style={styles.c}>{formatQuote(r)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#f1f5f9", gap: 8 },
  head: { borderBottomColor: "#e3e7ef" },
  h: { fontSize: 11, fontWeight: "800", color: "#64748b", textTransform: "uppercase" },
  c: { flex: 1, color: "#334155", fontWeight: "600" },
  c2: { flex: 2, color: "#334155", fontWeight: "600" },
  c3: { flex: 3, color: "#334155", fontWeight: "600" },
});
