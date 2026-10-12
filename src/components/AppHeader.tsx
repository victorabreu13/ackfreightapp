import React from "react";
import { Image, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { navigationRef } from "../navigation/navigationRef";

const HOME_ROUTE_BY_ROLE: Record<string, string> = {
  admin: "Today",
  customer: "CustomerHome",
  driver: "DriverHome",
};

export default function AppHeader() {
  const { profile } = useAuth();

  const goHome = () => {
    if (!navigationRef.isReady() || !profile) return;
    const routeName = HOME_ROUTE_BY_ROLE[profile.role] ?? "DriverHome";
    navigationRef.navigate(routeName as never);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.brand} onPress={goHome}>
        <Image source={require("../../assets/icon.png")} style={styles.logo} />
        <Text style={styles.wordmark}>
          <Text style={styles.wordmarkBold}>ACK</Text> Freight
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => Linking.openURL("mailto:victor.abreu@ackfreight.com")}>
        <Text style={styles.support}>Support</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0A1A3A",
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 32, height: 32, borderRadius: 8 },
  wordmark: { color: "#fff", fontSize: 16, fontWeight: "600", letterSpacing: 0.5 },
  wordmarkBold: { fontWeight: "800" },
  support: { color: "#9db4e0", fontSize: 13, fontWeight: "600" },
});
