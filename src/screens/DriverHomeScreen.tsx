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
import { subscribeToDriverTrips } from "../services/trips";
import { Trip } from "../types";
import TripCard from "../components/TripCard";

export default function DriverHomeScreen({ navigation }: any) {
  const { user, profile, signOut } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToDriverTrips(
      user.uid,
      (data) => {
        setTrips(data);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error("subscribeToDriverTrips error:", err);
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
          <Text style={styles.greeting}>Hi, {profile?.name?.split(" ")[0]}</Text>
          <Text style={styles.subGreeting}>Your trip log</Text>
        </View>
        <TouchableOpacity onPress={signOut}>
          <Text style={styles.signOut}>Log out</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.newTripButton}
        onPress={() => navigation.navigate("NewTrip")}
      >
        <Text style={styles.newTripButtonText}>+ Log New Trip</Text>
      </TouchableOpacity>

      {error ? (
        <Text style={styles.error}>Error loading trips: {error}</Text>
      ) : loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : trips.length === 0 ? (
        <Text style={styles.empty}>
          No trips logged yet. Tap "Log New Trip" to add your first one.
        </Text>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingVertical: 8 }}
          renderItem={({ item }) => (
            <TripCard
              trip={item}
              onPress={() => navigation.navigate("TripDetail", { trip: item })}
            />
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
  newTripButton: {
    backgroundColor: "#1d4ed8",
    marginHorizontal: 16,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 4,
  },
  newTripButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
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
});
