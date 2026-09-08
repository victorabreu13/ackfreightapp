import React from "react";
import {
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Trip } from "../types";

export default function TripDetailScreen({ route }: any) {
  const trip: Trip = route.params.trip;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <View style={styles.headerRow}>
        <Text style={styles.date}>{trip.date}</Text>
        <Text style={styles.time}>
          {trip.timeStart} – {trip.timeFinish}
        </Text>
      </View>

      <Text style={styles.driver}>{trip.driverName}</Text>
      <Text style={styles.driverEmail}>{trip.driverEmail}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Route</Text>
        <Text style={styles.sectionValue}>
          {trip.from} → {trip.to}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>AWB / Document #</Text>
        <Text style={styles.sectionValue}>{trip.awbNumber}</Text>
      </View>

      {!!trip.unitTypes?.length && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>QTY: {trip.qty}</Text>
          <Text style={styles.sectionValue}>{trip.unitTypes.join(", ")}</Text>
        </View>
      )}

      {!!trip.notes && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Notes</Text>
          <Text style={styles.sectionValue}>{trip.notes}</Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>
          Proof of freight ({trip.proofFiles.length})
        </Text>
        {trip.proofFiles.length === 0 && (
          <Text style={styles.noProof}>No files attached.</Text>
        )}
        {trip.proofFiles.map((file, i) =>
          file.kind === "image" ? (
            <TouchableOpacity key={i} onPress={() => Linking.openURL(file.url)}>
              <Image source={{ uri: file.url }} style={styles.image} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              key={i}
              style={styles.docRow}
              onPress={() => Linking.openURL(file.url)}
            >
              <Text style={styles.docName} numberOfLines={1}>
                📄 {file.name}
              </Text>
              <Text style={styles.docOpen}>Open</Text>
            </TouchableOpacity>
          )
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f6fa" },
  headerRow: { flexDirection: "row", justifyContent: "space-between" },
  date: { fontSize: 20, fontWeight: "800", color: "#111" },
  time: { fontSize: 16, color: "#555" },
  driver: { fontSize: 16, fontWeight: "700", color: "#1d4ed8", marginTop: 10 },
  driverEmail: { fontSize: 13, color: "#888", marginBottom: 8 },
  section: { marginTop: 18 },
  sectionLabel: { fontSize: 12, fontWeight: "700", color: "#888", textTransform: "uppercase" },
  sectionValue: { fontSize: 16, color: "#111", marginTop: 4 },
  noProof: { color: "#888", marginTop: 6 },
  image: { width: "100%", height: 220, borderRadius: 10, marginTop: 10 },
  docRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginTop: 10,
  },
  docName: { flex: 1, color: "#333", marginRight: 8 },
  docOpen: { color: "#1d4ed8", fontWeight: "700" },
});
