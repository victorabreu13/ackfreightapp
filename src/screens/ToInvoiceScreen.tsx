import React, { useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AdminShell from "../components/AdminShell";
import { cargoSummary, dispatchStyles } from "../components/DispatchUI";
import { useDispatchData } from "../hooks/useDispatchData";
import { formatQuote } from "../utils/quote";
import { pendingInvoiceRequests } from "../utils/dispatchBoard";
import { confirmMarkInvoiced } from "../utils/invoiceActions";

// Delivered trips that haven't been invoiced yet. "Mark invoiced" on a row
// marks it here (with a confirm); QuickBooks invoicing stays on the trip screen.
export default function ToInvoiceScreen({ navigation }: any) {
  const { requests } = useDispatchData();
  const rows = useMemo(() => pendingInvoiceRequests(requests), [requests]);
  const [busyId, setBusyId] = useState<string | null>(null);

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
          <View style={styles.action} />
        </View>
        {rows.length === 0 && <Text style={dispatchStyles.empty}>Nothing waiting to be invoiced.</Text>}
        {rows.map((r) => {
          const cargo = cargoSummary(r);
          return (
            <View key={r.id} style={styles.row}>
              <TouchableOpacity
                style={styles.open}
                onPress={() => navigation.navigate("DispatchDetail", { request: r })}
                accessibilityRole="button"
                accessibilityLabel={`Open trip ${r.customerName} ${r.tripDate}`}
              >
                <Text style={styles.c}>{r.tripDate}</Text>
                <Text style={[styles.c2, { fontWeight: "800" }]} numberOfLines={1}>{r.customerName}</Text>
                <Text style={styles.c3} numberOfLines={1}>{r.from} → {r.to}</Text>
                <Text style={styles.c2} numberOfLines={1}>{cargo.units}{cargo.kg ? ` · ${cargo.kg.toLocaleString("en-US")} kg` : ""}</Text>
                <Text style={styles.c}>{formatQuote(r)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.action, styles.markBtn]}
                disabled={busyId !== null}
                onPress={() =>
                  confirmMarkInvoiced(r, { onStart: () => setBusyId(r.id), onDone: () => setBusyId(null) })
                }
                accessibilityRole="button"
                accessibilityLabel={`Mark ${r.customerName} ${r.tripDate} as invoiced`}
              >
                {busyId === r.id ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.markText}>✓ Mark invoiced</Text>
                )}
              </TouchableOpacity>
            </View>
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
  open: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  action: { width: 130 },
  markBtn: { backgroundColor: "#0f766e", borderRadius: 8, paddingVertical: 7, alignItems: "center" },
  markText: { color: "#fff", fontWeight: "800", fontSize: 12.5 },
});
