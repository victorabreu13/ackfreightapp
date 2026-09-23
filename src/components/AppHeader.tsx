import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

export default function AppHeader() {
  return (
    <View style={styles.container}>
      <Image source={require("../../assets/icon.png")} style={styles.logo} />
      <Text style={styles.wordmark}>
        <Text style={styles.wordmarkBold}>ACK</Text> Freight
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0A1A3A",
    paddingVertical: 10,
    paddingHorizontal: 20,
    gap: 10,
  },
  logo: { width: 32, height: 32, borderRadius: 8 },
  wordmark: { color: "#fff", fontSize: 16, fontWeight: "600", letterSpacing: 0.5 },
  wordmarkBold: { fontWeight: "800" },
});
