import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AwbDriverPicker from "../components/AwbDriverPicker";
import TripRequestReadOnly from "../components/TripRequestReadOnly";
import { sendQuickBooksInvoice } from "../services/quickbooks";
import { getUserProfile, setCustomerBillRate, subscribeToDrivers } from "../services/users";
import {
  assignAwbDriver,
  setTripRequestStatus,
  subscribeToTripRequest,
  updateAwbKilograms,
} from "../services/tripRequests";
import {
  computeTripRequestRollup,
  DriverPayType,
  TripRequest,
  TripRequestStatus,
  UserProfile,
} from "../types";
import { confirmAction, notify } from "../utils/alert";
import { toLocalDateString } from "../utils/date";

const BILL_TYPE_LABELS: Record<DriverPayType, string> = {
  perTrip: "per trip",
  perKilogram: "per kilogram",
};

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
  const [assigningIndex, setAssigningIndex] = useState<number | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);
  const [editingKgIndex, setEditingKgIndex] = useState<number | null>(null);
  const [editKgValue, setEditKgValue] = useState("");
  const [savingKg, setSavingKg] = useState(false);

  // Live-subscribed so status changes and driver location pings show up
  // without backing out and reopening — the various optimistic setRequest
  // calls elsewhere in this screen just get reconciled to the same data
  // shortly after this fires.
  useEffect(() => {
    const unsubscribe = subscribeToTripRequest(
      initialRequest.id,
      setRequest,
      (err) => console.error("subscribeToTripRequest error:", err)
    );
    return unsubscribe;
  }, [initialRequest.id]);

  const [customer, setCustomer] = useState<UserProfile | null>(null);
  const [editingRate, setEditingRate] = useState(false);
  const [editBillType, setEditBillType] = useState<DriverPayType>("perTrip");
  const [editBillRate, setEditBillRate] = useState("");
  const [savingRate, setSavingRate] = useState(false);
  const [sendingInvoice, setSendingInvoice] = useState(false);

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

  useEffect(() => {
    getUserProfile(request.customerId)
      .then(setCustomer)
      .catch((err) => console.error("getUserProfile error:", err));
  }, [request.customerId]);

  const startEditingRate = () => {
    setEditBillType(customer?.billType ?? "perTrip");
    setEditBillRate(customer?.billRate ? String(customer.billRate) : "");
    setEditingRate(true);
  };

  const saveRate = async () => {
    const rate = parseFloat(editBillRate);
    if (!rate || rate <= 0) {
      notify("Enter a rate", "Enter a rate greater than 0.");
      return;
    }
    setSavingRate(true);
    try {
      await setCustomerBillRate(request.customerId, editBillType, rate);
      setCustomer((prev) => (prev ? { ...prev, billType: editBillType, billRate: rate } : prev));
      setEditingRate(false);
    } catch (e: any) {
      notify("Couldn't save rate", e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setSavingRate(false);
    }
  };

  const handleSendInvoice = async () => {
    setSendingInvoice(true);
    try {
      const result = await sendQuickBooksInvoice(request.id);
      setRequest((prev) => ({
        ...prev,
        status: "invoiced",
        quickbooksInvoiceId: result.invoiceId,
        invoicedAt: Date.now(),
      }));
      notify(
        result.emailSent ? "Invoice sent" : "Invoice created",
        result.emailSent
          ? `Invoice${result.invoiceNumber ? ` #${result.invoiceNumber}` : ""} for $${result.amount.toFixed(2)} was created and emailed via QuickBooks.`
          : `Invoice${result.invoiceNumber ? ` #${result.invoiceNumber}` : ""} for $${result.amount.toFixed(2)} was created in QuickBooks, but the automatic email failed — send it manually from QuickBooks.`
      );
    } catch (e: any) {
      notify("Couldn't send invoice", e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setSendingInvoice(false);
    }
  };

  const doAssign = async (awbIndex: number, driver: UserProfile | null) => {
    setAssigningIndex(awbIndex);
    try {
      await assignAwbDriver(request.id, awbIndex, driver?.uid ?? null, driver?.name ?? null);
      setRequest((prev) => {
        const awbLines = prev.awbLines.map((line, i) =>
          i === awbIndex
            ? {
                ...line,
                assignedDriverId: driver?.uid ?? null,
                assignedDriverName: driver?.name ?? null,
                // Reassigning always lands on {submitted, assigned} — even a
                // line that was mid-trip resets here so the new driver has
                // to tap Start themselves, rather than inheriting someone
                // else's in-progress state.
                status: driver ? ("assigned" as const) : ("submitted" as const),
              }
            : line
        );
        return { ...prev, awbLines, ...computeTripRequestRollup(awbLines) };
      });
    } catch (e: any) {
      notify("Couldn't assign", e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setAssigningIndex(null);
    }
  };

  const handleAssign = (awbIndex: number, driver: UserProfile | null) => {
    const line = request.awbLines[awbIndex];
    if (line.status === "in_progress") {
      confirmAction(
        {
          title: "Reassign an in-progress AWB?",
          message: `${line.assignedDriverName ?? "The current driver"} already started this AWB. Reassigning resets it back to "Assigned" for ${driver?.name ?? "the new driver"}, who will need to tap Start again.`,
          confirmLabel: "Reassign",
        },
        () => doAssign(awbIndex, driver)
      );
      return;
    }
    doAssign(awbIndex, driver);
  };

  const startEditingKg = (awbIndex: number) => {
    setEditingKgIndex(awbIndex);
    setEditKgValue(String(request.awbLines[awbIndex].kilograms));
  };

  const saveKg = async (awbIndex: number) => {
    const kilograms = parseFloat(editKgValue);
    if (!kilograms || kilograms <= 0) {
      notify("Enter a weight", "Enter a kilogram value greater than 0.");
      return;
    }
    setSavingKg(true);
    try {
      await updateAwbKilograms(request.id, awbIndex, kilograms);
      setRequest((prev) => ({
        ...prev,
        awbLines: prev.awbLines.map((line, i) => (i === awbIndex ? { ...line, kilograms } : line)),
      }));
      setEditingKgIndex(null);
    } catch (e: any) {
      notify("Couldn't save weight", e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setSavingKg(false);
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
        Submitted: {toLocalDateString(new Date(request.submittedAt))}
      </Text>

      <TripRequestReadOnly request={request} />

      <Text style={styles.sectionTitle}>Assign Drivers per AWB</Text>
      {drivers.length === 0 ? (
        <Text style={styles.empty}>No drivers found.</Text>
      ) : (
        request.awbLines.map((line, i) => {
          // Completed lines already have a Trip Log entry tied to that
          // driver, so those stay locked — in-progress ones can still be
          // reassigned (e.g. swapping in a replacement driver), with a
          // confirmation since it resets the line for the new driver.
          const locked = line.status === "completed";
          return (
            <View key={i} style={styles.awbAssignRow}>
              <Text style={styles.awbAssignLabel}>{line.awbNumber}</Text>
              {assigningIndex === i ? (
                <ActivityIndicator />
              ) : (
                <AwbDriverPicker
                  drivers={drivers}
                  assignedDriverName={line.assignedDriverName}
                  onSelect={(driver) => handleAssign(i, driver)}
                  disabled={locked}
                />
              )}
            </View>
          );
        })
      )}

      <Text style={styles.sectionTitle}>AWB Weights</Text>
      <Text style={styles.sectionHint}>
        Fix a customer's typo before invoicing — billing by kilogram uses this value.
      </Text>
      {request.awbLines.map((line, i) => (
        <View key={i} style={styles.awbAssignRow}>
          <Text style={styles.awbAssignLabel}>{line.awbNumber}</Text>
          {editingKgIndex === i ? (
            <View style={styles.kgEditRow}>
              <TextInput
                style={styles.kgInput}
                keyboardType="numeric"
                value={editKgValue}
                onChangeText={setEditKgValue}
                autoFocus
              />
              <Text style={styles.kgUnit}>kg</Text>
              <TouchableOpacity
                style={styles.saveRateButton}
                onPress={() => saveKg(i)}
                disabled={savingKg}
              >
                {savingKg ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveRateButtonText}>Save</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditingKgIndex(null)}>
                <Text style={styles.cancelRateText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => startEditingKg(i)}>
              <Text style={styles.kgValueText}>{line.kilograms} kg · Edit</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      <Text style={styles.sectionTitle}>Billing</Text>
      {editingRate ? (
        <View style={styles.rateEditor}>
          <View style={styles.payTypeRow}>
            <TouchableOpacity
              style={[styles.payTypeButton, editBillType === "perTrip" && styles.payTypeButtonActive]}
              onPress={() => setEditBillType("perTrip")}
            >
              <Text
                style={[
                  styles.payTypeButtonText,
                  editBillType === "perTrip" && styles.payTypeButtonTextActive,
                ]}
              >
                Per Trip
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.payTypeButton,
                editBillType === "perKilogram" && styles.payTypeButtonActive,
              ]}
              onPress={() => setEditBillType("perKilogram")}
            >
              <Text
                style={[
                  styles.payTypeButtonText,
                  editBillType === "perKilogram" && styles.payTypeButtonTextActive,
                ]}
              >
                Per Kilogram
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.rateInputRow}>
            <Text style={styles.dollarSign}>$</Text>
            <TextInput
              style={styles.rateInput}
              keyboardType="numeric"
              placeholder="0.00"
              value={editBillRate}
              onChangeText={setEditBillRate}
            />
            <TouchableOpacity style={styles.saveRateButton} onPress={saveRate} disabled={savingRate}>
              {savingRate ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveRateButtonText}>Save</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditingRate(false)}>
              <Text style={styles.cancelRateText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity onPress={startEditingRate}>
          <Text style={styles.rateText}>
            {customer?.billType && customer?.billRate
              ? `${customer.name} is billed $${customer.billRate.toFixed(2)} ${BILL_TYPE_LABELS[customer.billType]} · Edit`
              : "No billing rate set for this customer · Tap to set one"}
          </Text>
        </TouchableOpacity>
      )}

      <Text style={styles.sectionTitle}>Status</Text>
      {(request.status === "assigned" || request.status === "in_progress") && (
        <Text style={styles.statusHint}>
          The driver marks this In Progress and Completed from their app.
        </Text>
      )}
      <View style={styles.statusActions}>
        {request.status === "completed" && (
          <>
            <TouchableOpacity
              style={styles.qbInvoiceButton}
              onPress={handleSendInvoice}
              disabled={sendingInvoice}
            >
              {sendingInvoice ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.qbInvoiceButtonText}>Send Invoice via QuickBooks</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statusButton}
              onPress={() => changeStatus("invoiced", "Mark this trip as invoiced?")}
              disabled={changingStatus}
            >
              <Text style={styles.statusButtonText}>Mark Invoiced Manually</Text>
            </TouchableOpacity>
          </>
        )}
        {request.status === "invoiced" && request.quickbooksInvoiceId && (
          <Text style={styles.statusHint}>
            ✅ Invoiced via QuickBooks{request.invoicedAt ? ` on ${toLocalDateString(new Date(request.invoicedAt))}` : ""}.
          </Text>
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
  sectionHint: { fontSize: 12, color: "#888", marginTop: -6, marginBottom: 10 },
  empty: { color: "#888", fontSize: 13 },
  kgEditRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  kgInput: {
    width: 80,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontSize: 14,
  },
  kgUnit: { fontSize: 13, color: "#666" },
  kgValueText: { fontSize: 13, color: "#1d4ed8", fontWeight: "600" },
  awbAssignRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  awbAssignLabel: { fontSize: 14, fontWeight: "700", color: "#111", flex: 1, marginRight: 10 },
  rateText: { fontSize: 13, color: "#1d4ed8", fontWeight: "600" },
  rateEditor: {},
  payTypeRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  payTypeButton: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 8,
    alignItems: "center",
  },
  payTypeButtonActive: { backgroundColor: "#1d4ed8", borderColor: "#1d4ed8" },
  payTypeButtonText: { color: "#333", fontWeight: "600", fontSize: 13 },
  payTypeButtonTextActive: { color: "#fff" },
  rateInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dollarSign: { fontSize: 15, color: "#111", fontWeight: "700" },
  rateInput: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 14,
  },
  saveRateButton: {
    backgroundColor: "#1d4ed8",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  saveRateButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  cancelRateText: { color: "#888", fontWeight: "600", fontSize: 13 },
  statusHint: { fontSize: 13, color: "#888", marginBottom: 10 },
  statusActions: { gap: 10, marginBottom: 30 },
  statusButton: {
    backgroundColor: "#e8edff",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  statusButtonText: { color: "#1d4ed8", fontWeight: "700", fontSize: 15 },
  qbInvoiceButton: {
    backgroundColor: "#1d4ed8",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  qbInvoiceButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  cancelButton: {
    backgroundColor: "#fdecea",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelButtonText: { color: "#c0392b", fontWeight: "700", fontSize: 15 },
});
