import React, { useState } from "react";
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import TripRequestForm, {
  TripRequestFormValues,
} from "../components/TripRequestForm";
import { cancelTripRequest, updateTripRequest } from "../services/tripRequests";
import { TripRequest } from "../types";
import { confirmAction, notify } from "../utils/alert";

const STATUS_LABELS: Record<TripRequest["status"], string> = {
  submitted: "Submitted",
  assigned: "Assigned",
  completed: "Completed",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};

const LOCKED_STATUSES: TripRequest["status"][] = [
  "completed",
  "invoiced",
  "cancelled",
];

export default function TripRequestDetailScreen({ route, navigation }: any) {
  const initialRequest: TripRequest = route.params.request;
  const [request, setRequest] = useState(initialRequest);
  const locked = LOCKED_STATUSES.includes(request.status);

  const handleSubmit = async (values: TripRequestFormValues) => {
    await updateTripRequest(request.id, values);
    setRequest((prev) => ({ ...prev, ...values }));
    notify("Saved", "Your changes have been saved.");
  };

  const doCancel = async () => {
    try {
      await cancelTripRequest(request.id);
      setRequest((prev) => ({ ...prev, status: "cancelled" }));
    } catch (e: any) {
      notify("Couldn't cancel", e?.message ?? "Something went wrong. Please try again.");
    }
  };

  const confirmCancel = () => {
    confirmAction(
      {
        title: "Cancel this trip request?",
        message: "This can't be undone.",
        confirmLabel: "Cancel Request",
        destructive: true,
      },
      doCancel
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>‹ Back</Text>
      </TouchableOpacity>

      <View style={styles.headerRow}>
        <Text style={styles.title}>Trip Request</Text>
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>{STATUS_LABELS[request.status]}</Text>
        </View>
      </View>
      <Text style={styles.meta}>Customer: {request.customerName}</Text>
      <Text style={styles.meta}>
        Submitted: {new Date(request.submittedAt).toISOString().slice(0, 10)}
      </Text>
      <Text style={styles.meta}>
        Assigned Driver:{" "}
        {request.assignedDriverNames.length > 0
          ? request.assignedDriverNames.join(", ")
          : "Not assigned yet"}
      </Text>

      {locked ? (
        <ReadOnlyView request={request} />
      ) : (
        <TripRequestForm
          customerId={request.customerId}
          requestId={request.id}
          initial={{
            tripDate: request.tripDate,
            from: request.from,
            to: request.to,
            personRequesting: request.personRequesting,
            awbLines: request.awbLines,
            importFeeFiles: request.importFeeFiles,
          }}
          submitLabel="Save Changes"
          onSubmit={handleSubmit}
          footer={
            <TouchableOpacity style={styles.cancelButton} onPress={confirmCancel}>
              <Text style={styles.cancelButtonText}>Cancel Request</Text>
            </TouchableOpacity>
          }
        />
      )}
    </ScrollView>
  );
}

function ReadOnlyView({ request }: { request: TripRequest }) {
  return (
    <View style={{ marginTop: 10 }}>
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Route</Text>
        <Text style={styles.sectionValue}>
          {request.from} → {request.to} · {request.tripDate}
        </Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Person requesting</Text>
        <Text style={styles.sectionValue}>{request.personRequesting}</Text>
      </View>

      <Text style={styles.sectionTitle}>AWBs</Text>
      {request.awbLines.map((line, i) => (
        <View key={i} style={styles.awbCard}>
          <Text style={styles.awbTitle}>
            {line.awbNumber} · {line.type} · {line.qtyPieces} pcs · {line.kilograms} kg
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
  container: { flex: 1, backgroundColor: "#f5f6fa" },
  backButton: { marginBottom: 14, alignSelf: "flex-start" },
  backButtonText: { color: "#1d4ed8", fontWeight: "700", fontSize: 16 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "800", color: "#111" },
  statusBadge: {
    backgroundColor: "#1d4ed8",
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  statusBadgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  meta: { fontSize: 13, color: "#666", marginTop: 4 },
  section: { marginTop: 18 },
  sectionLabel: { fontSize: 12, fontWeight: "700", color: "#888", textTransform: "uppercase" },
  sectionValue: { fontSize: 16, color: "#111", marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#111", marginTop: 26, marginBottom: 10 },
  awbCard: { backgroundColor: "#f0f2fa", borderRadius: 12, padding: 14, marginBottom: 12 },
  awbTitle: { fontSize: 14, fontWeight: "700", color: "#111", marginBottom: 6 },
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
  cancelButton: {
    backgroundColor: "#fdecea",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  cancelButtonText: { color: "#c0392b", fontWeight: "700", fontSize: 15 },
});
