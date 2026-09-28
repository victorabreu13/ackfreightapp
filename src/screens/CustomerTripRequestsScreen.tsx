import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { subscribeToCustomerTripRequests } from "../services/tripRequests";
import { TripRequest, TripRequestStatus } from "../types";

const STATUS_LABELS: Record<TripRequest["status"], string> = {
  submitted: "Submitted",
  assigned: "Assigned",
  in_progress: "In Progress",
  completed: "Completed",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<TripRequest["status"], string> = {
  submitted: "#1d4ed8",
  assigned: "#b45309",
  in_progress: "#0891b2",
  completed: "#15803d",
  invoiced: "#6d28d9",
  cancelled: "#c0392b",
};

const FILTERS: { key: TripRequestStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "submitted", label: "Submitted" },
  { key: "assigned", label: "Assigned" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
  { key: "invoiced", label: "Invoiced" },
  { key: "cancelled", label: "Cancelled" },
];

export default function CustomerTripRequestsScreen({ navigation }: any) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<TripRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TripRequestStatus | "all">("all");

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToCustomerTripRequests(
      user.uid,
      (data) => {
        setRequests(data);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error("subscribeToCustomerTripRequests error:", err);
        setError(err.message);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [user]);

  const filtered = useMemo(
    () => (filter === "all" ? requests : requests.filter((r) => r.status === filter)),
    [requests, filter]
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>‹ Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Trip Requests</Text>
      <Text style={styles.subtitle}>Your submitted and assigned trips</Text>

      {requests.length > 0 && (
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
      )}

      {error ? (
        <Text style={styles.error}>Error loading requests: {error}</Text>
      ) : loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : requests.length === 0 ? (
        <Text style={styles.empty}>
          No trip requests yet. Create one from the home screen.
        </Text>
      ) : filtered.length === 0 ? (
        <Text style={styles.empty}>No trip requests with this status.</Text>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingVertical: 8 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() =>
                navigation.navigate("TripRequestDetail", { request: item })
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
                  <Text style={styles.statusBadgeText}>
                    {STATUS_LABELS[item.status]}
                  </Text>
                </View>
              </View>
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
  container: { flex: 1, backgroundColor: "#f5f6fa", paddingTop: 60, paddingHorizontal: 20 },
  backButton: { marginBottom: 14, alignSelf: "flex-start" },
  backButtonText: { color: "#1d4ed8", fontWeight: "700", fontSize: 16 },
  title: { fontSize: 22, fontWeight: "800", color: "#111" },
  subtitle: { fontSize: 13, color: "#666", marginBottom: 10 },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
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
  empty: { textAlign: "center", color: "#888", marginTop: 40, paddingHorizontal: 20 },
  error: { textAlign: "center", color: "#c0392b", marginTop: 40, paddingHorizontal: 20 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    marginVertical: 6,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardDate: { fontSize: 15, fontWeight: "700", color: "#111" },
  statusBadge: {
    borderRadius: 12,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  statusBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  cardRoute: { fontSize: 14, color: "#333", marginTop: 6 },
  cardMeta: { fontSize: 12, color: "#888", marginTop: 4 },
});
