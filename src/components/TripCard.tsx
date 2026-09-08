import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Trip } from "../types";

interface Props {
  trip: Trip;
  showDriver?: boolean;
  onPress: () => void;
}

export default function TripCard({ trip, showDriver, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.row}>
        <Text style={styles.date}>{trip.date}</Text>
        <Text style={styles.time}>
          {trip.timeStart} – {trip.timeFinish}
        </Text>
      </View>
      {showDriver && <Text style={styles.driver}>{trip.driverName}</Text>}
      <Text style={styles.route}>
        {trip.from} → {trip.to}
      </Text>
      <Text style={styles.awb}>AWB / Doc #: {trip.awbNumber}</Text>
      {!!trip.unitTypes?.length && (
        <Text style={styles.qty}>
          QTY {trip.qty}: {trip.unitTypes.join(", ")}
        </Text>
      )}
      <Text style={styles.proofCount}>
        {trip.proofFiles.length} proof file
        {trip.proofFiles.length === 1 ? "" : "s"} attached
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 6,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  date: { fontWeight: "700", fontSize: 15, color: "#111" },
  time: { fontSize: 14, color: "#555" },
  driver: { fontSize: 14, color: "#1d4ed8", fontWeight: "600", marginBottom: 2 },
  route: { fontSize: 14, color: "#333", fontWeight: "600", marginBottom: 2 },
  awb: { fontSize: 14, color: "#333" },
  qty: { fontSize: 13, color: "#555", marginTop: 2 },
  proofCount: { fontSize: 12, color: "#888", marginTop: 4 },
});
