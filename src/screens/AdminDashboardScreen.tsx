import React, { useEffect } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { registerForPushNotifications } from "../services/notifications";

const WEB_TILES = [
  {
    key: "Dispatch",
    icon: "🚚",
    label: "Dispatch",
    description: "Review and assign customer trip requests",
  },
  {
    key: "DriversLog",
    icon: "📋",
    label: "Drivers Log",
    description: "See every trip logged by your drivers",
  },
  {
    key: "DriversRecord",
    icon: "📊",
    label: "Drivers Record",
    description: "Trip counts per driver, for payroll",
  },
  {
    key: "DriverPayroll",
    icon: "💵",
    label: "Driver Payroll",
    description: "What each driver is owed, and mark trips paid",
  },
  {
    key: "DeletedTrips",
    icon: "🗑️",
    label: "Deleted Trips",
    description: "Restore a trip that was deleted by mistake",
  },
  {
    key: "DriversAvailable",
    icon: "🟢",
    label: "Drivers Available",
    description: "Who's free right now, and what they're carrying today",
  },
  {
    key: "ManageUsers",
    icon: "👤",
    label: "Manage Users",
    description: "Fix a wrong role from signup, or change one as needed",
  },
] as const;

// The native app keeps a lighter menu for now — Drivers Record, Driver
// Payroll, Deleted Trips (heavier on filters/tables, or rarely needed on the
// go), and Drivers Available (new, trying it on web first) stay web-only.
const NATIVE_TILES = WEB_TILES.filter(
  (t) =>
    t.key !== "DriversRecord" &&
    t.key !== "DriverPayroll" &&
    t.key !== "DeletedTrips" &&
    t.key !== "DriversAvailable"
);

const TILES = Platform.OS === "web" ? WEB_TILES : NATIVE_TILES;

export default function AdminDashboardScreen({ navigation }: any) {
  const { signOut } = useAuth();

  useEffect(() => {
    registerForPushNotifications();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>ACK Freight Admin</Text>
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
  title: { fontSize: 24, fontWeight: "800", color: "#111" },
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
