import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../context/AuthContext";

const TILES = [
  {
    key: "NewTripRequest",
    icon: "➕",
    label: "New Trip Request",
    description: "Submit a new trip for us to dispatch",
  },
  {
    key: "CustomerTripRequests",
    icon: "🚚",
    label: "Trip Requests",
    description: "Track the status of your submitted trips",
  },
] as const;

export default function CustomerHomeScreen({ navigation }: any) {
  const { profile, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hi, {profile?.name}</Text>
          <Text style={styles.subGreeting}>ACK Freight Customer Portal</Text>
        </View>
        <TouchableOpacity onPress={signOut}>
          <Text style={styles.signOut}>Log out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tileGrid}>
        {TILES.map((tile) => (
          <TouchableOpacity
            key={tile.key}
            style={styles.tile}
            onPress={() => navigation.navigate(tile.key)}
          >
            <Text style={styles.tileIcon}>{tile.icon}</Text>
            <Text style={styles.tileLabel}>{tile.label}</Text>
            <Text style={styles.tileDescription}>{tile.description}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f6fa" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 20,
  },
  greeting: { fontSize: 24, fontWeight: "800", color: "#111" },
  subGreeting: { fontSize: 14, color: "#666" },
  signOut: { color: "#c0392b", fontSize: 15, fontWeight: "600" },
  tileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 20,
    paddingHorizontal: 24,
  },
  tile: {
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 36,
    paddingHorizontal: 20,
    alignItems: "center",
    width: 220,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  tileIcon: { fontSize: 44, marginBottom: 14 },
  tileLabel: { fontSize: 18, fontWeight: "800", color: "#111", marginBottom: 6 },
  tileDescription: { fontSize: 13, color: "#888", textAlign: "center" },
});
