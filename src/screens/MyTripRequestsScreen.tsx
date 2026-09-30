import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import DateField from "../components/DateField";
import { useAuth } from "../context/AuthContext";
import { syncBadgeCount } from "../services/notifications";
import { subscribeToDriverTripRequests } from "../services/tripRequests";
import { computeTripRequestRollup, TripRequest, TripRequestStatus } from "../types";
import { toLocalDateString } from "../utils/date";

const FILTERS: { key: TripRequestStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "assigned", label: "Assigned" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
];

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

export default function MyTripRequestsScreen({ navigation }: any) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<TripRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TripRequestStatus | "all">("all");
  const [filterDate, setFilterDate] = useState<Date | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToDriverTripRequests(
      user.uid,
      (data) => {
        setRequests(data.filter((r) => r.status !== "cancelled"));
        setError(null);
        setLoading(false);
        syncBadgeCount(user.uid);
      },
      (err) => {
        console.error("subscribeToDriverTripRequests error:", err);
        setError(err.message);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [user]);

  const entries = useMemo(() => {
    const targetDate = filterDate ? toLocalDateString(filterDate) : null;
    return requests
      .map((request) => {
        const myLines = request.awbLines.filter((l) => l.assignedDriverId === user?.uid);
        return { request, myLines, myStatus: computeTripRequestRollup(myLines).status };
      })
      .filter(({ myStatus, request }) => {
        if (statusFilter !== "all" && myStatus !== statusFilter) return false;
        if (targetDate && request.tripDate !== targetDate) return false;
        return true;
      });
  }, [requests, user, statusFilter, filterDate]);

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>‹ Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Trip Requests</Text>
      <Text style={styles.subtitle}>Trips assigned to you</Text>

      {requests.length > 0 && (
        <>
          <View style={styles.filterRow}>
            {FILTERS.map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterButton, statusFilter === f.key && styles.filterButtonActive]}
                onPress={() => setStatusFilter(f.key)}
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    statusFilter === f.key && styles.filterButtonTextActive,
                  ]}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.filterRow}>
            <View style={styles.filterDateField}>
              <DateField
                value={filterDate ?? new Date()}
                mode="date"
                onChange={setFilterDate}
                label={filterDate ? undefined : "All dates"}
              />
            </View>
            <TouchableOpacity
              style={styles.filterButtonSecondary}
              onPress={() => setFilterDate(new Date())}
            >
              <Text style={styles.filterButtonSecondaryText}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.filterButtonSecondary}
              onPress={() => setFilterDate(null)}
            >
              <Text style={styles.filterButtonSecondaryText}>All</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {error ? (
        <Text style={styles.error}>Error loading trip requests: {error}</Text>
      ) : loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : requests.length === 0 ? (
        <Text style={styles.empty}>No trip requests assigned to you yet.</Text>
      ) : entries.length === 0 ? (
        <Text style={styles.empty}>No trip requests match this filter.</Text>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={({ request }) => request.id}
          contentContainerStyle={{ paddingVertical: 8 }}
          renderItem={({ item: { request, myLines, myStatus } }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() =>
                navigation.navigate("DriverTripRequestDetail", { request })
              }
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardDate}>{request.tripDate}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: STATUS_COLORS[myStatus] },
                  ]}
                >
                  <Text style={styles.statusBadgeText}>{STATUS_LABELS[myStatus]}</Text>
                </View>
              </View>
              <Text style={styles.cardCustomer}>{request.customerName}</Text>
              <Text style={styles.cardRoute}>
                {request.from} → {request.to}
              </Text>
              <Text style={styles.cardMeta}>
                {myLines.length} AWB{myLines.length === 1 ? "" : "s"} assigned to you
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
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
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
  filterDateField: { flex: 1 },
  filterButtonSecondary: {
    backgroundColor: "#e8edff",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  filterButtonSecondaryText: { color: "#1d4ed8", fontWeight: "700" },
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
  statusBadge: { borderRadius: 12, paddingVertical: 3, paddingHorizontal: 10 },
  statusBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  cardCustomer: { fontSize: 14, fontWeight: "700", color: "#1d4ed8", marginTop: 6 },
  cardRoute: { fontSize: 14, color: "#333", marginTop: 2 },
  cardMeta: { fontSize: 12, color: "#888", marginTop: 4 },
});
