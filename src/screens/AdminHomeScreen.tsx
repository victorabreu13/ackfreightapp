import React, { useEffect } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { registerForPushNotifications } from "../services/notifications";

// Phone-only admin home: just the four things admins do on the go. The fuller
// Today board / side menu stays on the website.
const BUTTONS = [
  { route: "Dispatch", icon: "🚚", label: "Trips", hint: "Review, assign and complete trips" },
  { route: "DispatchNewRequest", icon: "➕", label: "New Trip", hint: "Create a trip request for a customer" },
  { route: "LiveMap", icon: "🗺️", label: "Live Map", hint: "See where every driver is" },
  { route: "ManageUsers", icon: "👤", label: "Users", hint: "Roles, logins and driver accounts" },
] as const;

export default function AdminHomeScreen({ navigation }: any) {
  const { signOut } = useAuth();

  useEffect(() => {
    registerForPushNotifications();
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>ACK Freight Admin</Text>
        <TouchableOpacity onPress={signOut}>
          <Text style={styles.signOut}>Log out</Text>
        </TouchableOpacity>
      </View>

      {BUTTONS.map((b) => (
        <TouchableOpacity key={b.route} style={styles.button} onPress={() => navigation.navigate(b.route)}>
          <Text style={styles.icon}>{b.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{b.label}</Text>
            <Text style={styles.hint}>{b.hint}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f6fa" },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 60,
    paddingBottom: 20,
  },
  title: { fontSize: 24, fontWeight: "800", color: "#111" },
  signOut: { color: "#c0392b", fontSize: 15, fontWeight: "600" },
  button: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 20,
    paddingHorizontal: 18,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  icon: { fontSize: 34, marginRight: 16 },
  label: { fontSize: 20, fontWeight: "800", color: "#111" },
  hint: { fontSize: 13, color: "#888", marginTop: 2 },
  chevron: { fontSize: 28, color: "#bbb", marginLeft: 8 },
});
