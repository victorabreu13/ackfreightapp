import * as DocumentPicker from "expo-document-picker";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AwbDriverPicker from "./AwbDriverPicker";
import DateField from "./DateField";
import { uploadTripRequestFile } from "../services/storage";
import { AwbLine, RequestFile, ULD_TYPES, UldType, UserProfile, newAwbLine } from "../types";
import { notify } from "../utils/alert";

function formatDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function formatTime(d: Date) {
  return d.toTimeString().slice(0, 5);
}

// Each file slot is either untouched (uploaded, from a previous save),
// freshly picked but not yet uploaded (pending), or empty. Uploads happen
// once, at submit time, so re-opening the form to tweak one field doesn't
// re-upload everything.
type Slot =
  | { kind: "empty" }
  | { kind: "uploaded"; file: RequestFile }
  | { kind: "pending"; uri: string; name: string };

interface LineState {
  awbNumber: string;
  qtyPieces: string;
  type: UldType;
  kilograms: string;
  awbSlot: Slot;
  loaSlot: Slot;
  doSlot: Slot;
  // Carried through untouched on edit so a customer editing AWB details
  // never wipes out Dispatch's existing driver assignment; only settable via
  // the driverAssignment prop (Dispatch's new-request flow).
  assignedDriverId: string | null;
  assignedDriverName: string | null;
  status: AwbLine["status"];
}

function lineFromAwbLine(line?: AwbLine): LineState {
  return {
    awbNumber: line?.awbNumber ?? "",
    qtyPieces: line ? String(line.qtyPieces) : "1",
    type: line?.type ?? "Loose",
    kilograms: line ? String(line.kilograms) : "",
    awbSlot: line?.awbFile ? { kind: "uploaded", file: line.awbFile } : { kind: "empty" },
    loaSlot: line?.loaFile ? { kind: "uploaded", file: line.loaFile } : { kind: "empty" },
    doSlot: line?.doFile ? { kind: "uploaded", file: line.doFile } : { kind: "empty" },
    assignedDriverId: line?.assignedDriverId ?? null,
    assignedDriverName: line?.assignedDriverName ?? null,
    status: line?.status ?? "submitted",
  };
}

export interface TripRequestFormValues {
  tripDate: string;
  from: string;
  pickupTime: string;
  to: string;
  personRequesting: string;
  awbLines: AwbLine[];
  importFeeFiles: RequestFile[];
}

interface Props {
  customerId: string;
  requestId: string;
  initial?: {
    tripDate: string;
    from: string;
    pickupTime: string;
    to: string;
    personRequesting: string;
    awbLines: AwbLine[];
    importFeeFiles: RequestFile[];
  };
  submitLabel: string;
  onSubmit: (values: TripRequestFormValues) => Promise<void>;
  footer?: React.ReactNode;
  // When provided, each AWB card gets a driver-assignment picker — used only
  // by Dispatch's new-request flow. Customer flows omit this and their cards
  // render unchanged.
  driverAssignment?: { drivers: UserProfile[] };
}

const MAX_AWB_LINES = 10;

export default function TripRequestForm({
  customerId,
  requestId,
  initial,
  submitLabel,
  onSubmit,
  footer,
  driverAssignment,
}: Props) {
  const [tripDate, setTripDate] = useState(
    initial ? new Date(`${initial.tripDate}T00:00:00`) : new Date()
  );
  const [from, setFrom] = useState(initial?.from ?? "");
  const [pickupTime, setPickupTime] = useState(
    initial?.pickupTime ? new Date(`2000-01-01T${initial.pickupTime}:00`) : new Date()
  );
  const [to, setTo] = useState(initial?.to ?? "");
  const [personRequesting, setPersonRequesting] = useState(
    initial?.personRequesting ?? ""
  );
  const [lines, setLines] = useState<LineState[]>(
    initial?.awbLines?.length
      ? initial.awbLines.map(lineFromAwbLine)
      : [lineFromAwbLine()]
  );
  const [importFeeSlots, setImportFeeSlots] = useState<Slot[]>(
    (initial?.importFeeFiles ?? []).map((file) => ({ kind: "uploaded", file }))
  );
  const [typeModalIndex, setTypeModalIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const updateLine = (index: number, patch: Partial<LineState>) => {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line))
    );
  };

  const addLine = () => {
    if (lines.length >= MAX_AWB_LINES) return;
    setLines((prev) => [...prev, lineFromAwbLine()]);
  };

  const removeLine = (index: number) => {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  };

  const pickForSlot = async (setSlot: (slot: Slot) => void) => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setSlot({ kind: "pending", uri: asset.uri, name: asset.name });
    }
  };

  const addImportFeeFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
      multiple: true,
    });
    if (!result.canceled) {
      setImportFeeSlots((prev) => [
        ...prev,
        ...result.assets.map(
          (a): Slot => ({ kind: "pending", uri: a.uri, name: a.name })
        ),
      ]);
    }
  };

  const removeImportFeeFile = (index: number) => {
    setImportFeeSlots((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadSlot = async (slot: Slot, path: string): Promise<RequestFile | null> => {
    if (slot.kind === "uploaded") return slot.file;
    if (slot.kind === "empty") return null;
    return uploadTripRequestFile(slot.uri, customerId, requestId, path, slot.name);
  };

  const handleSubmit = async () => {
    if (!from.trim() || !to.trim()) {
      notify("Missing info", "Enter both the From and To locations.");
      return;
    }
    if (!personRequesting.trim()) {
      notify("Missing info", "Enter the name of the person requesting the trip.");
      return;
    }
    if (lines.some((l) => !l.awbNumber.trim())) {
      notify("Missing info", "Enter the AWB # for each line.");
      return;
    }

    setSubmitting(true);
    try {
      const awbLines: AwbLine[] = [];
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const [awbFile, loaFile, doFile] = await Promise.all([
          uploadSlot(l.awbSlot, `awb-${i}`),
          uploadSlot(l.loaSlot, `loa-${i}`),
          uploadSlot(l.doSlot, `do-${i}`),
        ]);
        awbLines.push({
          awbNumber: l.awbNumber.trim(),
          qtyPieces: parseInt(l.qtyPieces, 10) || 0,
          type: l.type,
          kilograms: parseFloat(l.kilograms) || 0,
          awbFile,
          loaFile,
          doFile,
          assignedDriverId: l.assignedDriverId,
          assignedDriverName: l.assignedDriverName,
          status: l.status,
        });
      }

      const importFeeFiles: RequestFile[] = [];
      for (let i = 0; i < importFeeSlots.length; i++) {
        const file = await uploadSlot(importFeeSlots[i], `importfee-${i}`);
        if (file) importFeeFiles.push(file);
      }

      await onSubmit({
        tripDate: formatDate(tripDate),
        from: from.trim(),
        pickupTime: formatTime(pickupTime),
        to: to.trim(),
        personRequesting: personRequesting.trim(),
        awbLines,
        importFeeFiles,
      });
    } catch (e: any) {
      notify("Error", `Couldn't save the trip request: ${e?.message ?? "unknown error"}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={Platform.OS === "web" && styles.webContainer}>
      <Text style={styles.label}>Date of trip</Text>
      <DateField value={tripDate} mode="date" onChange={setTripDate} />

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.label}>From</Text>
          <TextInput style={styles.input} placeholder="Origin" value={from} onChangeText={setFrom} />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>To</Text>
          <TextInput style={styles.input} placeholder="Destination" value={to} onChangeText={setTo} />
        </View>
      </View>

      <Text style={styles.label}>Pick up Time</Text>
      <DateField value={pickupTime} mode="time" onChange={setPickupTime} />

      <Text style={styles.label}>Person requesting the trip</Text>
      <TextInput
        style={[styles.input, Platform.OS === "web" && styles.quarterWidthWeb]}
        placeholder="Full name"
        value={personRequesting}
        onChangeText={setPersonRequesting}
      />

      <Text style={styles.sectionTitle}>AWBs ({lines.length}/{MAX_AWB_LINES})</Text>
      {lines.map((line, i) => (
        <View key={i} style={styles.awbCard}>
          <View style={styles.awbCardHeader}>
            <Text style={styles.awbCardTitle}>AWB {i + 1}</Text>
            {lines.length > 1 && (
              <TouchableOpacity onPress={() => removeLine(i)}>
                <Text style={styles.removeText}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.label}>AWB #</Text>
          <TextInput
            style={[styles.input, Platform.OS === "web" && styles.quarterWidthWeb]}
            placeholder="e.g. AWB-102938"
            value={line.awbNumber}
            onChangeText={(v) => updateLine(i, { awbNumber: v })}
            autoCapitalize="characters"
          />

          <View style={styles.row}>
            <View style={styles.third}>
              <Text style={styles.label}>Qty Pieces</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={line.qtyPieces}
                onChangeText={(v) => updateLine(i, { qtyPieces: v })}
              />
            </View>
            <View style={styles.third}>
              <Text style={styles.label}>Type</Text>
              <TouchableOpacity style={styles.pickerButton} onPress={() => setTypeModalIndex(i)}>
                <Text style={styles.pickerText}>{line.type}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.third}>
              <Text style={styles.label}>Kilograms</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={line.kilograms}
                onChangeText={(v) => updateLine(i, { kilograms: v })}
              />
            </View>
          </View>

          <FileSlotRow
            label="AWB document"
            slot={line.awbSlot}
            onPick={() => pickForSlot((s) => updateLine(i, { awbSlot: s }))}
            onRemove={() => updateLine(i, { awbSlot: { kind: "empty" } })}
          />
          <FileSlotRow
            label="Letter of Authorization"
            slot={line.loaSlot}
            onPick={() => pickForSlot((s) => updateLine(i, { loaSlot: s }))}
            onRemove={() => updateLine(i, { loaSlot: { kind: "empty" } })}
          />
          <FileSlotRow
            label="Delivery Order / Ticket"
            slot={line.doSlot}
            onPick={() => pickForSlot((s) => updateLine(i, { doSlot: s }))}
            onRemove={() => updateLine(i, { doSlot: { kind: "empty" } })}
          />

          {driverAssignment && (
            <>
              <Text style={styles.label}>Driver</Text>
              <AwbDriverPicker
                drivers={driverAssignment.drivers}
                assignedDriverName={line.assignedDriverName}
                onSelect={(driver) =>
                  updateLine(i, {
                    assignedDriverId: driver?.uid ?? null,
                    assignedDriverName: driver?.name ?? null,
                    status: driver ? "assigned" : "submitted",
                  })
                }
              />
            </>
          )}
        </View>
      ))}

      {lines.length < MAX_AWB_LINES && (
        <TouchableOpacity style={styles.addButton} onPress={addLine}>
          <Text style={styles.addButtonText}>+ Add AWB</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.sectionTitle}>Import Fee / 1F (shared across AWBs)</Text>
      {importFeeSlots.map((slot, i) => (
        <FileSlotRow
          key={i}
          label={`Import fee file ${i + 1}`}
          slot={slot}
          onPick={() => {}}
          onRemove={() => removeImportFeeFile(i)}
          pickDisabled
        />
      ))}
      <TouchableOpacity style={styles.addButton} onPress={addImportFeeFile}>
        <Text style={styles.addButtonText}>+ Add Import Fee File</Text>
      </TouchableOpacity>

      <Modal
        visible={typeModalIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setTypeModalIndex(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setTypeModalIndex(null)}
        >
          <View style={styles.modalCard}>
            {ULD_TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                style={styles.modalOption}
                onPress={() => {
                  if (typeModalIndex !== null) updateLine(typeModalIndex, { type: t });
                  setTypeModalIndex(null);
                }}
              >
                <Text style={styles.modalOptionText}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {footer}

      <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={submitting}>
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>{submitLabel}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function FileSlotRow({
  label,
  slot,
  onPick,
  onRemove,
  pickDisabled,
}: {
  label: string;
  slot: Slot;
  onPick: () => void;
  onRemove: () => void;
  pickDisabled?: boolean;
}) {
  const name = slot.kind === "uploaded" ? slot.file.name : slot.kind === "pending" ? slot.name : null;
  return (
    <View style={styles.fileRow}>
      <Text style={styles.fileLabel} numberOfLines={1}>
        {label}
        {name ? `: ${name}` : ""}
      </Text>
      {name ? (
        <TouchableOpacity onPress={onRemove}>
          <Text style={styles.removeText}>Remove</Text>
        </TouchableOpacity>
      ) : !pickDisabled ? (
        <TouchableOpacity onPress={onPick}>
          <Text style={styles.attachText}>Attach</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  webContainer: { width: "50%" as any, minWidth: 480, alignSelf: "flex-start" },
  label: { fontSize: 13, fontWeight: "700", color: "#444", marginTop: 16, marginBottom: 6 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111",
    marginTop: 26,
    marginBottom: 10,
  },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  third: { flex: 1 },
  pickerButton: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  pickerText: { fontSize: 15, color: "#111" },
  input: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  quarterWidthWeb: { width: "25%" as any, minWidth: 160 },
  awbCard: {
    backgroundColor: "#f0f2fa",
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  awbCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  awbCardTitle: { fontSize: 14, fontWeight: "800", color: "#111" },
  removeText: { color: "#c0392b", fontSize: 13, fontWeight: "700" },
  attachText: { color: "#1d4ed8", fontSize: 13, fontWeight: "700" },
  addButton: {
    backgroundColor: "#e8edff",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 6,
  },
  addButtonText: { color: "#1d4ed8", fontWeight: "700", fontSize: 14 },
  fileRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  fileLabel: { flex: 1, fontSize: 13, color: "#333", marginRight: 8 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 32,
  },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, paddingVertical: 8 },
  modalOption: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  modalOptionText: { fontSize: 16, color: "#111" },
  submitButton: {
    backgroundColor: "#1d4ed8",
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 28,
    marginBottom: 40,
  },
  submitButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
