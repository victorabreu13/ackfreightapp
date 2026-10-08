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
import { checkAwbInUse } from "../services/tripRequests";
import {
  AWB_PRIORITIES,
  AwbLine,
  AwbPriority,
  RequestFile,
  ULD_TYPES,
  UldType,
  UserProfile,
  newAwbLine,
} from "../types";
import { notify } from "../utils/alert";
import { toLocalDateString as formatDate } from "../utils/date";
import { formatQuote, quoteForRequest } from "../utils/quote";

const PRIORITY_COLORS: Record<AwbPriority, { bg: string; text: string }> = {
  Low: { bg: "#f0f0f0", text: "#666" },
  Normal: { bg: "#fff", text: "#111" },
  High: { bg: "#fdecea", text: "#c0392b" },
};

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
  lengthIn: string;
  widthIn: string;
  heightIn: string;
  hazmat: boolean;
  unNumber: string;
  hazmatClass: string;
  assignedDriverId: string | null;
  assignedDriverName: string | null;
  status: AwbLine["status"];
  priority: AwbPriority;
  tripLogId?: string;
  startedAt?: number;
  acceptedAt?: number;
  pickedUpAt?: number;
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
    lengthIn: line?.lengthIn != null ? String(line.lengthIn) : "",
    widthIn: line?.widthIn != null ? String(line.widthIn) : "",
    heightIn: line?.heightIn != null ? String(line.heightIn) : "",
    hazmat: line?.hazmat === true,
    unNumber: line?.unNumber ?? "",
    hazmatClass: line?.hazmatClass ?? "",
    assignedDriverId: line?.assignedDriverId ?? null,
    assignedDriverName: line?.assignedDriverName ?? null,
    status: line?.status ?? "submitted",
    priority: line?.priority ?? "Normal",
    tripLogId: line?.tripLogId,
    startedAt: line?.startedAt,
    acceptedAt: line?.acceptedAt,
    pickedUpAt: line?.pickedUpAt,
  };
}

function parseDim(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface TripRequestFormValues {
  tripDate: string;
  from: string;
  pickupTime: string;
  to: string;
  personRequesting: string;
  notes: string;
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
    notes?: string;
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
  // Customer's billing rate, used only to preview a quote before submit.
  // The stored quote is stamped by the server and is not written from here.
  billing?: { billType?: UserProfile["billType"]; billRate?: number | null } | null;
  storedQuote?: {
    quotedAmount?: number | null;
    quoteStatus?: string | null;
    quoteBasis?: string | null;
  } | null;
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
  billing,
  storedQuote,
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
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<LineState[]>(
    initial?.awbLines?.length
      ? initial.awbLines.map(lineFromAwbLine)
      : [lineFromAwbLine()]
  );
  const [importFeeSlots, setImportFeeSlots] = useState<Slot[]>(
    (initial?.importFeeFiles ?? []).map((file) => ({ kind: "uploaded", file }))
  );
  const [typeModalIndex, setTypeModalIndex] = useState<number | null>(null);
  const [priorityModalIndex, setPriorityModalIndex] = useState<number | null>(null);
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
      // One AWB, one trip: refuse numbers already on another trip request. If
      // the check itself can't run (offline), don't block the customer.
      let inUse: string[] = [];
      try {
        inUse = await checkAwbInUse(
          lines.map((l) => l.awbNumber.trim()),
          requestId
        );
      } catch (err) {
        console.error("AWB duplicate check failed:", err);
      }
      if (inUse.length > 0) {
        notify(
          "AWB already on a trip",
          `${inUse.join(", ")} ${inUse.length === 1 ? "is" : "are"} already on another trip request. Remove ${inUse.length === 1 ? "it" : "them"} from this one, or ask dispatch to move it.`
        );
        return;
      }

      const awbLines: AwbLine[] = [];
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const [awbFile, loaFile, doFile] = await Promise.all([
          uploadSlot(l.awbSlot, `awb-${i}`),
          uploadSlot(l.loaSlot, `loa-${i}`),
          uploadSlot(l.doSlot, `do-${i}`),
        ]);
        const line: AwbLine = {
          awbNumber: l.awbNumber.trim(),
          qtyPieces: parseInt(l.qtyPieces, 10) || 0,
          type: l.type,
          kilograms: parseFloat(l.kilograms) || 0,
          lengthIn: parseDim(l.lengthIn),
          widthIn: parseDim(l.widthIn),
          heightIn: parseDim(l.heightIn),
          hazmat: l.hazmat,
          unNumber: l.hazmat ? l.unNumber.trim() || null : null,
          hazmatClass: l.hazmat ? l.hazmatClass.trim() || null : null,
          awbFile,
          loaFile,
          doFile,
          assignedDriverId: l.assignedDriverId,
          assignedDriverName: l.assignedDriverName,
          status: l.status,
          priority: l.priority,
        };
        if (l.tripLogId) line.tripLogId = l.tripLogId;
        if (l.startedAt) line.startedAt = l.startedAt;
        if (l.acceptedAt) line.acceptedAt = l.acceptedAt;
        if (l.pickedUpAt) line.pickedUpAt = l.pickedUpAt;
        awbLines.push(line);
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
        notes: notes.trim(),
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

      <Text style={styles.label}>Note (optional)</Text>
      <TextInput
        style={[styles.input, styles.notesInput]}
        placeholder="Anything admins or the driver should know about this trip"
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      <Text style={styles.sectionTitle}>Quote</Text>
      <Text style={styles.quoteText}>
        {storedQuote?.quoteStatus
          ? `${formatQuote(storedQuote)}. Changing the weight later does not change this quote.`
          : billing
            ? `${formatQuote(
                quoteForRequest(
                  billing,
                  lines.map((line) => ({ kilograms: parseFloat(line.kilograms) || 0 }))
                )
              )} — preview from this customer's billing rate. Saved when the request is submitted.`
            : "No quote until this customer's billing rate is on file."}
      </Text>

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

          <View style={styles.row}>
            <View style={styles.awbNumberCol}>
              <Text style={styles.label}>AWB #</Text>
              <TextInput
                style={[styles.input, Platform.OS === "web" && styles.quarterWidthWeb]}
                placeholder="e.g. AWB-102938"
                value={line.awbNumber}
                onChangeText={(v) => updateLine(i, { awbNumber: v })}
                autoCapitalize="characters"
              />
            </View>
            <View style={styles.priorityCol}>
              <Text style={styles.label}>Priority</Text>
              <TouchableOpacity
                style={[
                  styles.pickerButton,
                  { backgroundColor: PRIORITY_COLORS[line.priority].bg },
                ]}
                onPress={() => setPriorityModalIndex(i)}
              >
                <Text style={[styles.pickerText, { color: PRIORITY_COLORS[line.priority].text }]}>
                  {line.priority}
                  {line.priority === "High" ? " !" : ""}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

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

          <View style={styles.row}>
            <View style={styles.third}>
              <Text style={styles.label}>Length (in)</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                placeholder="L"
                value={line.lengthIn}
                onChangeText={(v) => updateLine(i, { lengthIn: v })}
              />
            </View>
            <View style={styles.third}>
              <Text style={styles.label}>Width (in)</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                placeholder="W"
                value={line.widthIn}
                onChangeText={(v) => updateLine(i, { widthIn: v })}
              />
            </View>
            <View style={styles.third}>
              <Text style={styles.label}>Height (in)</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                placeholder="H"
                value={line.heightIn}
                onChangeText={(v) => updateLine(i, { heightIn: v })}
              />
            </View>
          </View>

          <TouchableOpacity
            style={styles.hazmatRow}
            onPress={() => updateLine(i, { hazmat: !line.hazmat })}
          >
            <View style={[styles.checkbox, line.hazmat && styles.checkboxChecked]}>
              {line.hazmat && <Text style={styles.checkboxMark}>✓</Text>}
            </View>
            <Text style={styles.hazmatLabel}>Hazmat</Text>
          </TouchableOpacity>
          {line.hazmat && (
            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.label}>UN number</Text>
                <TextInput
                  style={styles.input}
                  placeholder="UN1203"
                  value={line.unNumber}
                  onChangeText={(v) => updateLine(i, { unNumber: v })}
                  autoCapitalize="characters"
                />
              </View>
              <View style={styles.half}>
                <Text style={styles.label}>Class</Text>
                <TextInput
                  style={styles.input}
                  placeholder="3"
                  value={line.hazmatClass}
                  onChangeText={(v) => updateLine(i, { hazmatClass: v })}
                />
              </View>
            </View>
          )}

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

      <Modal
        visible={priorityModalIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPriorityModalIndex(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setPriorityModalIndex(null)}
        >
          <View style={styles.modalCard}>
            {AWB_PRIORITIES.map((p) => (
              <TouchableOpacity
                key={p}
                style={styles.modalOption}
                onPress={() => {
                  if (priorityModalIndex !== null) updateLine(priorityModalIndex, { priority: p });
                  setPriorityModalIndex(null);
                }}
              >
                <Text style={[styles.modalOptionText, { color: PRIORITY_COLORS[p].text }]}>
                  {p}
                </Text>
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
  quoteText: { fontSize: 14, color: "#333", marginBottom: 4 },
  hazmatRow: { flexDirection: "row", alignItems: "center", marginTop: 14 },
  hazmatLabel: { fontSize: 14, fontWeight: "700", color: "#111" },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "#ccc",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  checkboxChecked: { backgroundColor: "#1d4ed8", borderColor: "#1d4ed8" },
  checkboxMark: { color: "#fff", fontSize: 13, fontWeight: "800" },
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
  notesInput: { minHeight: 70, textAlignVertical: "top" },
  awbNumberCol: { flex: 3 },
  priorityCol: { flex: 1, minWidth: 100 },
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
    alignItems: "center",
    padding: 32,
  },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, paddingVertical: 8, minWidth: 160 },
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
