import React, { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import TripRequestForm, {
  TripRequestFormValues,
} from "../components/TripRequestForm";
import TripRequestReadOnly from "../components/TripRequestReadOnly";
import {
  cancelTripRequest,
  subscribeToTripRequest,
  updateTripRequest,
} from "../services/tripRequests";
import { TripRequest } from "../types";
import { confirmAction, notify } from "../utils/alert";
import { toLocalDateString } from "../utils/date";

const STATUS_LABELS: Record<TripRequest["status"], string> = {
  submitted: "Submitted",
  assigned: "Assigned",
  in_progress: "In Progress",
  completed: "Completed",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};

// Matches firestore.rules' tripRequestLocked() — once a driver actually
// starts the trip, the customer can no longer edit or cancel it.
const LOCKED_STATUSES: TripRequest["status"][] = [
  "in_progress",
  "completed",
  "invoiced",
  "cancelled",
];

export default function TripRequestDetailScreen({ route, navigation }: any) {
  const initialRequest: TripRequest = route.params.request;
  const [request, setRequest] = useState(initialRequest);
  const locked = LOCKED_STATUSES.includes(request.status);

  // Live-subscribed so status changes and driver location pings show up
  // without needing to back out and reopen this screen. TripRequestForm
  // only reads its `initial` prop once on mount, so this doesn't clobber
  // any unsaved edits the customer is mid-typing.
  useEffect(() => {
    const unsubscribe = subscribeToTripRequest(
      initialRequest.id,
      setRequest,
      (err) => console.error("subscribeToTripRequest error:", err)
    );
    return unsubscribe;
  }, [initialRequest.id]);

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
        Submitted: {toLocalDateString(new Date(request.submittedAt))}
      </Text>
      <Text style={styles.meta}>
        Assigned Driver:{" "}
        {request.assignedDriverNames.length > 0
          ? request.assignedDriverNames.join(", ")
          : "Not assigned yet"}
      </Text>

      {locked ? (
        <TripRequestReadOnly request={request} />
      ) : (
        <>
          <TripRequestForm
            customerId={request.customerId}
            requestId={request.id}
            initial={{
              tripDate: request.tripDate,
              from: request.from,
              pickupTime: request.pickupTime ?? "",
              to: request.to,
              personRequesting: request.personRequesting,
              notes: request.notes ?? "",
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
        </>
      )}
    </ScrollView>
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
  cancelButton: {
    backgroundColor: "#fdecea",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  cancelButtonText: { color: "#c0392b", fontWeight: "700", fontSize: 15 },
});
