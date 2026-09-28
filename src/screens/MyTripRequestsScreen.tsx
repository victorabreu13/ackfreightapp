import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { syncBadgeCount } from "../services/notifications";
import { subscribeToDriverTripRequests } from "../services/tripRequests";
import { computeTripRequestRollup, TripRequest, TripRequestStatus } from "../types";

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

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>‹ Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Trip Requests</Text>
      <Text style={styles.subtitle}>Trips assigned to you</Text>

      {error ? (
        <Text style={styles.error}>Error loading trip requests: {error}</Text>
      ) : loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : requests.length === 0 ? (
        <Text style={styles.empty}>No trip requests assigned to you yet.</Text>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingVertical: 8 }}
          renderItem={({ item }) => {
            // Show this driver's own progress, not the trip's overall rollup
            // — another driver's lines on the same request can be at a
            // completely different stage.
            const myLines = item.awbLines.filter((l) => l.assignedDriverId === user?.uid);
            const myStatus = computeTripRequestRollup(myLines).status;
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() =>
                  navigation.navigate("DriverTripRequestDetail", { request: item })
                }
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardDate}>{item.tripDate}</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: STATUS_COLORS[myStatus] },
                    ]}
                  >
                    <Text style={styles.statusBadgeText}>{STATUS_LABELS[myStatus]}</Text>
                  </View>
                </View>
                <Text style={styles.cardCustomer}>{item.customerName}</Text>
                <Text style={styles.cardRoute}>
                  {item.from} → {item.to}
                </Text>
                <Text style={styles.cardMeta}>
                  {myLines.length} AWB{myLines.length === 1 ? "" : "s"} assigned to you
                </Text>
              </TouchableOpacity>
            );
          }}
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
