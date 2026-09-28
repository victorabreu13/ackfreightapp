import React from "react";
import { Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import LiveTrackingSection from "./LiveTrackingSection";
import { TripRequest, TripRequestStatus } from "../types";

const LINE_STATUS_LABELS: Record<TripRequestStatus, string> = {
  submitted: "Unassigned",
  assigned: "Assigned",
  in_progress: "In Progress",
  completed: "Completed",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};

export default function TripRequestReadOnly({ request }: { request: TripRequest }) {
  return (
    <View style={{ marginTop: 10 }}>
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Route</Text>
        <Text style={styles.sectionValue}>
          {request.from} → {request.to} · {request.tripDate}
        </Text>
      </View>
      {!!request.pickupTime && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Pick up time</Text>
          <Text style={styles.sectionValue}>{request.pickupTime}</Text>
        </View>
      )}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Person requesting</Text>
        <Text style={styles.sectionValue}>{request.personRequesting}</Text>
      </View>

      <LiveTrackingSection request={request} />

      <Text style={styles.sectionTitle}>AWBs</Text>
      {request.awbLines.map((line, i) => (
        <View key={i} style={styles.awbCard}>
          <Text style={styles.awbTitle}>
            {line.awbNumber} · {line.type} · {line.qtyPieces} pcs · {line.kilograms} kg
          </Text>
          <Text style={styles.awbAssignment}>
            {line.assignedDriverName ? `Assigned to: ${line.assignedDriverName}` : "Unassigned"}
            {" · "}
            {LINE_STATUS_LABELS[line.status] ?? line.status}
          </Text>
          {[
            ["AWB document", line.awbFile],
            ["Letter of Authorization", line.loaFile],
            ["Delivery Order / Ticket", line.doFile],
          ].map(([label, file]: any) =>
            file ? (
              <TouchableOpacity
                key={label}
                style={styles.docRow}
                onPress={() => Linking.openURL(file.url)}
              >
                <Text style={styles.docName} numberOfLines={1}>
                  📄 {label}: {file.name}
                </Text>
                <Text style={styles.docOpen}>Open</Text>
              </TouchableOpacity>
            ) : null
          )}
        </View>
      ))}

      {request.importFeeFiles.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Import Fee / 1F</Text>
          {request.importFeeFiles.map((file, i) => (
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
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 18 },
  sectionLabel: { fontSize: 12, fontWeight: "700", color: "#888", textTransform: "uppercase" },
  sectionValue: { fontSize: 16, color: "#111", marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#111", marginTop: 26, marginBottom: 10 },
  awbCard: { backgroundColor: "#f0f2fa", borderRadius: 12, padding: 14, marginBottom: 12 },
  awbTitle: { fontSize: 14, fontWeight: "700", color: "#111", marginBottom: 2 },
  awbAssignment: { fontSize: 12, color: "#666", marginBottom: 6 },
  docRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  docName: { flex: 1, color: "#333", marginRight: 8 },
  docOpen: { color: "#1d4ed8", fontWeight: "700" },
});
