import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  disconnectQuickBooks,
  getQuickBooksConnectUrl,
  getQuickBooksStatus,
} from "../services/quickbooks";
import { subscribeToAllTripRequests } from "../services/tripRequests";
import { TripRequest, TripRequestStatus } from "../types";
import { confirmAction, notify } from "../utils/alert";

const STATUS_LABELS: Record<TripRequestStatus, string> = {
  submitted: "Submitted",
  assigned: "Assigned",
  in_progress: "In Progress",
  completed: "Completed",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<TripRequestStatus, string> = {
  submitted: "#1d4ed8",
  assigned: "#b45309",
  in_progress: "#0891b2",
  completed: "#15803d",
  invoiced: "#6d28d9",
  cancelled: "#c0392b",
};

const FILTERS: { key: TripRequestStatus | "all"; label: string }[] = [
  { key: "submitted", label: "Submitted" },
  { key: "assigned", label: "Assigned" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
  { key: "invoiced", label: "Invoiced" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
];

export default function DispatchScreen({ navigation }: any) {
  const [requests, setRequests] = useState<TripRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TripRequestStatus | "all">("submitted");
  const [qbStatus, setQbStatus] = useState<{
    connected: boolean;
    companyName?: string | null;
    environment?: string;
    realmId?: string;
  } | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToAllTripRequests(
      (data) => {
        setRequests(data);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    getQuickBooksStatus()
      .then(setQbStatus)
      .catch((err) => console.error("getQuickBooksStatus error:", err));
  }, []);

  const handleConnectQuickBooks = async () => {
    // Open the tab synchronously (within the click event) so browsers don't
    // treat it as a popup — the URL itself comes back from an async call,
    // so we point this already-open tab at it once we have it.
    const tab = window.open("", "_blank");
    try {
      const url = await getQuickBooksConnectUrl();
      if (tab) tab.location.href = url;
    } catch (e: any) {
      if (tab) tab.close();
      notify("Couldn't start QuickBooks connection", e?.message ?? "Something went wrong. Please try again.");
    }
  };

  const handleDisconnectQuickBooks = () => {
    confirmAction(
      {
        title: "Disconnect QuickBooks?",
        message: "You'll need to reconnect before sending any more invoices.",
        confirmLabel: "Disconnect",
        destructive: true,
      },
      async () => {
        try {
          await disconnectQuickBooks();
          setQbStatus({ connected: false });
        } catch (e: any) {
          notify("Couldn't disconnect", e?.message ?? "Something went wrong. Please try again.");
        }
      }
    );
  };

  const filtered = useMemo(
    () => (filter === "all" ? requests : requests.filter((r) => r.status === filter)),
    [requests, filter]
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>‹ Back</Text>
      </TouchableOpacity>

      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Dispatch</Text>
          <Text style={styles.subtitle}>
            {filtered.length} request{filtered.length === 1 ? "" : "s"}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.newButton}
          onPress={() => navigation.navigate("DispatchNewRequest")}
        >
          <Text style={styles.newButtonText}>+ New Request</Text>
        </TouchableOpacity>
      </View>

      {Platform.OS === "web" && qbStatus && (
        <View style={styles.qbRow}>
          {qbStatus.connected ? (
            <>
              <Text style={styles.qbConnectedText}>
                ✅ QuickBooks connected{qbStatus.companyName ? ` · ${qbStatus.companyName}` : ""}
                {qbStatus.environment === "sandbox" ? " (sandbox)" : ""}
                {qbStatus.realmId ? ` · realmId: ${qbStatus.realmId}` : ""}
              </Text>
              <TouchableOpacity onPress={handleDisconnectQuickBooks}>
                <Text style={styles.qbDisconnectText}>Disconnect</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity onPress={handleConnectQuickBooks}>
              <Text style={styles.qbConnectText}>🔗 Connect QuickBooks to send invoices</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterButton, filter === f.key && styles.filterButtonActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text
              style={[
                styles.filterButtonText,
                filter === f.key && styles.filterButtonTextActive,
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : filtered.length === 0 ? (
        <Text style={styles.empty}>No requests for this filter.</Text>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingVertical: 8 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() =>
                navigation.navigate("DispatchDetail", { request: item })
              }
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardDate}>{item.tripDate}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: STATUS_COLORS[item.status] },
                  ]}
                >
                  <Text style={styles.statusBadgeText}>{STATUS_LABELS[item.status]}</Text>
                </View>
              </View>
              <Text style={styles.cardCustomer}>{item.customerName}</Text>
              <Text style={styles.cardRoute}>
                {item.from} → {item.to}
              </Text>
              <Text style={styles.cardMeta}>
                {item.awbLines.length} AWB{item.awbLines.length === 1 ? "" : "s"}
                {item.assignedDriverNames.length > 0
                  ? ` · Driver: ${item.assignedDriverNames.join(", ")}`
                  : ""}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f6fa" },
  backButton: { marginTop: 24, marginLeft: 20, alignSelf: "flex-start" },
  backButtonText: { color: "#1d4ed8", fontWeight: "700", fontSize: 16 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  newButton: {
    backgroundColor: "#1d4ed8",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  newButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  title: { fontSize: 22, fontWeight: "800", color: "#111" },
  subtitle: { fontSize: 13, color: "#666" },
  qbRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  qbConnectText: { color: "#1d4ed8", fontWeight: "700", fontSize: 13 },
  qbConnectedText: { color: "#15803d", fontWeight: "600", fontSize: 13 },
  qbDisconnectText: { color: "#c0392b", fontWeight: "600", fontSize: 12 },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  filterButton: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  filterButtonActive: { backgroundColor: "#1d4ed8", borderColor: "#1d4ed8" },
  filterButtonText: { color: "#333", fontWeight: "600", fontSize: 13 },
  filterButtonTextActive: { color: "#fff" },
  empty: { textAlign: "center", color: "#888", marginTop: 40, paddingHorizontal: 40 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 6,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardDate: { fontSize: 15, fontWeight: "700", color: "#111" },
  statusBadge: { borderRadius: 12, paddingVertical: 3, paddingHorizontal: 10 },
  statusBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  cardCustomer: { fontSize: 14, fontWeight: "700", color: "#1d4ed8", marginTop: 6 },
  cardRoute: { fontSize: 14, color: "#333", marginTop: 2 },
  cardMeta: { fontSize: 12, color: "#888", marginTop: 4 },
});
