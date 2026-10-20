import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TextInput,
  View,
} from "react-native";
import { savePlaceIfNew } from "../services/places";
import { updateTripDetails } from "../services/tripRequests";
import { TripRequest } from "../types";
import { notify } from "../utils/alert";
import { toLocalDateString } from "../utils/date";
import DateField from "./DateField";
import PlaceInput from "./PlaceInput";

function dateFromString(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function timeFromString(hhmm: string): Date {
  const date = new Date();
  const [h, m] = (hhmm || "00:00").split(":").map(Number);
  date.setHours(h || 0, m || 0, 0, 0);
  return date;
}

function hhmm(d: Date): string {
  return d.toTimeString().slice(0, 5);
}

// Admin: change a submitted trip's date, pick up time, From or To. The customer
// is emailed what changed.
export default function EditTripDetails({ request }: { request: TripRequest }) {
  const [open, setOpen] = useState(false);
  const [tripDate, setTripDate] = useState(dateFromString(request.tripDate));
  const [pickupTime, setPickupTime] = useState(timeFromString(request.pickupTime));
  const [from, setFrom] = useState(request.from);
  const [to, setTo] = useState(request.to);
  const [saving, setSaving] = useState(false);

  const openEditor = () => {
    // Start from what's saved now, not from an earlier unsaved edit.
    setTripDate(dateFromString(request.tripDate));
    setPickupTime(timeFromString(request.pickupTime));
    setFrom(request.from);
    setTo(request.to);
    setOpen(true);
  };

  const save = async () => {
    const next = { tripDate: toLocalDateString(tripDate), pickupTime: hhmm(pickupTime), from: from.trim(), to: to.trim() };
    if (!next.from || !next.to) {
      notify("Missing info", "Enter both the From and To locations.");
      return;
    }
    if (
      next.tripDate === request.tripDate &&
      next.pickupTime === request.pickupTime &&
      next.from === request.from &&
      next.to === request.to
    ) {
      notify("No changes", "Nothing was changed.");
      return;
    }
    setSaving(true);
    try {
      savePlaceIfNew(next.from);
      savePlaceIfNew(next.to);
      const { emailed } = await updateTripDetails(request.id, next);
      setOpen(false);
      notify(
        "Trip updated",
        emailed
          ? "Saved. The customer was emailed what changed."
          : "Saved. The customer wasn't emailed (no email on file for them)."
      );
    } catch (e: any) {
      notify("Couldn't update the trip", e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <TouchableOpacity style={styles.link} onPress={openEditor}>
        <Text style={styles.linkText}>✏ Edit date, time, From / To</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <ScrollView style={styles.box} contentContainerStyle={{ padding: 18 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Edit trip details</Text>
            <Text style={styles.text}>The customer gets an email with what changed.</Text>

            <Text style={styles.label}>Date of trip</Text>
            <DateField value={tripDate} mode="date" onChange={setTripDate} />

            <Text style={styles.label}>Pick up time</Text>
            <DateField value={pickupTime} mode="time" onChange={setPickupTime} />

            <Text style={styles.label}>From</Text>
            <PlaceInput style={styles.input} placeholder="Origin" value={from} onChangeText={setFrom} />

            <Text style={styles.label}>To</Text>
            <PlaceInput style={styles.input} placeholder="Destination" value={to} onChangeText={setTo} />

            <View style={styles.actions}>
              <TouchableOpacity onPress={() => setOpen(false)} disabled={saving}>
                <Text style={styles.cancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.save} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Save and notify</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 6, marginBottom: 2 },
  link: { alignSelf: "flex-start", backgroundColor: "#e8edff", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  linkText: { color: "#1d4ed8", fontWeight: "700", fontSize: 13 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: 20 },
  box: { backgroundColor: "#fff", borderRadius: 14, width: "100%", maxWidth: 440, maxHeight: "90%" },
  title: { fontSize: 18, fontWeight: "800", color: "#111", marginBottom: 4 },
  text: { fontSize: 13.5, color: "#475569", marginBottom: 8 },
  label: { fontSize: 13, fontWeight: "700", color: "#444", marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#ddd", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  actions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 18, marginTop: 20 },
  cancel: { color: "#64748b", fontWeight: "700", fontSize: 15 },
  save: { backgroundColor: "#1d4ed8", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 18, minWidth: 130, alignItems: "center" },
  saveText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
