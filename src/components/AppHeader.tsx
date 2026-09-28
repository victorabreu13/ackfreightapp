import React from "react";
import { Image, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function AppHeader() {
  return (
    <View style={styles.container}>
      <View style={styles.brand}>
        <Image source={require("../../assets/icon.png")} style={styles.logo} />
        <Text style={styles.wordmark}>
          <Text style={styles.wordmarkBold}>ACK</Text> Freight
        </Text>
      </View>
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
