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
import { subscribeToCustomerTripRequests } from "../services/tripRequests";
import { TripRequest } from "../types";

const STATUS_LABELS: Record<TripRequest["status"], string> = {
  submitted: "Submitted",
  assigned: "Assigned",
  completed: "Completed",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<TripRequest["status"], string> = {
  submitted: "#1d4ed8",
  assigned: "#b45309",
  completed: "#15803d",
  invoiced: "#6d28d9",
  cancelled: "#c0392b",
};

export default function CustomerHomeScreen({ navigation }: any) {
  const { user, profile, signOut } = useAuth();
  const [requests, setRequests] = useState<TripRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hi, {profile?.name}</Text>
          <Text style={styles.subGreeting}>Your trip requests</Text>
        </View>
        <TouchableOpacity onPress={signOut}>
          <Text style={styles.signOut}>Log out</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.newButton}
        onPress={() => navigation.navigate("NewTripRequest")}
      >
        <Text style={styles.newButtonText}>+ New Trip Request</Text>
      </TouchableOpacity>

      {error ? (
        <Text style={styles.error}>Error loading requests: {error}</Text>
      ) : loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : requests.length === 0 ? (
        <Text style={styles.empty}>
          No trip requests yet. Tap "New Trip Request" to submit one.
        </Text>
      ) : (
        <FlatList
          data={requests}
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
  container: { flex: 1, backgroundColor: "#f5f6fa" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 12,
  },
  greeting: { fontSize: 22, fontWeight: "800", color: "#111" },
  subGreeting: { fontSize: 14, color: "#666" },
  signOut: { color: "#c0392b", fontSize: 14, fontWeight: "600" },
  newButton: {
    backgroundColor: "#1d4ed8",
    marginHorizontal: 16,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 4,
  },
  newButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  empty: {
    textAlign: "center",
    color: "#888",
    marginTop: 40,
    paddingHorizontal: 40,
  },
  error: {
    textAlign: "center",
    color: "#c0392b",
    marginTop: 40,
    paddingHorizontal: 20,
  },
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
  statusBadge: {
    borderRadius: 12,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  statusBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  cardRoute: { fontSize: 14, color: "#333", marginTop: 6 },
  cardMeta: { fontSize: 12, color: "#888", marginTop: 4 },
});
