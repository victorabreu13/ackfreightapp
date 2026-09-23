import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import TripRequestReadOnly from "../components/TripRequestReadOnly";
import { subscribeToDrivers } from "../services/users";
import {
  assignDriversToTripRequest,
  setTripRequestStatus,
} from "../services/tripRequests";
import { TripRequest, TripRequestStatus, UserProfile } from "../types";
import { confirmAction, notify } from "../utils/alert";

const STATUS_LABELS: Record<TripRequestStatus, string> = {
  submitted: "Submitted",
  assigned: "Assigned",
  in_progress: "In Progress",
  completed: "Completed",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};

export default function DispatchDetailScreen({ route, navigation }: any) {
  const initialRequest: TripRequest = route.params.request;
  const [request, setRequest] = useState(initialRequest);
  const [drivers, setDrivers] = useState<UserProfile[]>([]);
  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>(
    initialRequest.assignedDriverIds
  );
  const [assigning, setAssigning] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToDrivers(
      (data) => setDrivers(data),
      (err) => {
        console.error("subscribeToDrivers error:", err);
        notify("Couldn't load drivers", err.message);
      }
    );
    return unsubscribe;
  }, []);

  const toggleDriver = (uid: string) => {
    setSelectedDriverIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleAssign = async () => {
    if (selectedDriverIds.length === 0) {
      notify("Select a driver", "Choose at least one driver to assign.");
      return;
    }
    setAssigning(true);
    try {
      const names = drivers
        .filter((d) => selectedDriverIds.includes(d.uid))
        .map((d) => d.name);
      await assignDriversToTripRequest(request.id, selectedDriverIds, names);
      setRequest((prev) => ({
        ...prev,
        assignedDriverIds: selectedDriverIds,
        assignedDriverNames: names,
        status: "assigned",
      }));
      notify("Assigned", "Driver(s) assigned and the customer's status updated.");
    } catch (e: any) {
      notify("Couldn't assign", e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setAssigning(false);
    }
  };

  const changeStatus = (status: TripRequestStatus, confirmTitle: string) => {
    confirmAction(
      { title: confirmTitle, confirmLabel: "Confirm", destructive: status === "cancelled" },
      async () => {
        setChangingStatus(true);
        try {
          await setTripRequestStatus(request.id, status);
          setRequest((prev) => ({ ...prev, status }));
        } catch (e: any) {
          notify("Couldn't update status", e?.message ?? "Something went wrong. Please try again.");
        } finally {
          setChangingStatus(false);
        }
      }
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
      <Text style={styles.meta}>Contact email: {request.customerEmail}</Text>
      <Text style={styles.meta}>
        Submitted: {new Date(request.submittedAt).toISOString().slice(0, 10)}
      </Text>

      <TripRequestReadOnly request={request} />

      {(request.status === "submitted" || request.status === "assigned") && (
        <>
          <Text style={styles.sectionTitle}>Assign Driver(s)</Text>
          {drivers.length === 0 ? (
            <Text style={styles.empty}>No drivers found.</Text>
          ) : (
            drivers.map((d) => {
              const selected = selectedDriverIds.includes(d.uid);
              return (
                <TouchableOpacity
                  key={d.uid}
                  style={[styles.driverRow, selected && styles.driverRowSelected]}
                  onPress={() => toggleDriver(d.uid)}
                >
                  <Text style={[styles.driverName, selected && styles.driverNameSelected]}>
                    {selected ? "☑" : "☐"} {d.name}
                  </Text>
                  <Text style={styles.driverEmail}>{d.email}</Text>
                </TouchableOpacity>
              );
            })
          )}
          <TouchableOpacity
            style={styles.assignButton}
            onPress={handleAssign}
            disabled={assigning}
          >
            {assigning ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.assignButtonText}>
                {request.assignedDriverIds.length > 0 ? "Update Assignment" : "Assign Driver(s)"}
              </Text>
            )}
          </TouchableOpacity>
        </>
      )}

      <Text style={styles.sectionTitle}>Status</Text>
      {(request.status === "assigned" || request.status === "in_progress") && (
        <Text style={styles.statusHint}>
          The driver marks this In Progress and Completed from their app.
        </Text>
      )}
      <View style={styles.statusActions}>
        {request.status === "completed" && (
          <TouchableOpacity
            style={styles.statusButton}
            onPress={() => changeStatus("invoiced", "Mark this trip as invoiced?")}
            disabled={changingStatus}
          >
            <Text style={styles.statusButtonText}>Mark Invoiced</Text>
          </TouchableOpacity>
        )}
        {(request.status === "submitted" || request.status === "assigned") && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => changeStatus("cancelled", "Cancel this trip request?")}
            disabled={changingStatus}
          >
            <Text style={styles.cancelButtonText}>Cancel Request</Text>
          </TouchableOpacity>
        )}
      </View>
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
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#111", marginTop: 26, marginBottom: 10 },
  empty: { color: "#888", fontSize: 13 },
  driverRow: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  driverRowSelected: { backgroundColor: "#e8edff", borderColor: "#1d4ed8" },
  driverName: { fontSize: 15, fontWeight: "700", color: "#111" },
  driverNameSelected: { color: "#1d4ed8" },
  driverEmail: { fontSize: 12, color: "#888", marginTop: 2 },
  assignButton: {
    backgroundColor: "#1d4ed8",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  assignButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  statusHint: { fontSize: 13, color: "#888", marginBottom: 10 },
  statusActions: { gap: 10, marginBottom: 30 },
  statusButton: {
    backgroundColor: "#e8edff",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  statusButtonText: { color: "#1d4ed8", fontWeight: "700", fontSize: 15 },
  cancelButton: {
    backgroundColor: "#fdecea",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelButtonText: { color: "#c0392b", fontWeight: "700", fontSize: 15 },
});
