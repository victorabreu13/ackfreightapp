import * as DocumentPicker from "expo-document-picker";
import React, { useRef, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import DateField from "./DateField";
import PlaceInput from "./PlaceInput";
import { savePlaceIfNew } from "../services/places";
import { uploadTripRequestFile } from "../services/storage";
import { createBulkTripRequest } from "../services/tripRequests";
import { RequestFile, ULD_TYPES, UldType } from "../types";
import { notify } from "../utils/alert";
import { awbKeyOf, DocSlot, FileRow, LeftFile, parseSheet, PickedFile, placeFiles } from "../utils/bulkAwb";
import { toLocalDateString as formatDate } from "../utils/date";

const MAX_ROWS = 100;
const PARALLEL_UPLOADS = 4;
const SLOTS: { slot: DocSlot; label: string }[] = [
  { slot: "awb", label: "AWB" },
  { slot: "loa", label: "LOA" },
  { slot: "do", label: "Delivery Order" },
];

interface Row extends FileRow {
  id: number;
  qtyPieces: string;
  kilograms: string;
  type: UldType;
  hazmat: boolean;
  unNumber: string;
}

function formatTime(d: Date) {
  return d.toTimeString().slice(0, 5);
}

// Runs the tasks a few at a time; resolves with the ones that failed.
async function runPool<T>(items: T[], size: number, task: (item: T) => Promise<void>, onEach: () => void): Promise<T[]> {
  const failed: T[] = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await task(item);
      } catch {
        failed.push(item);
      }
      onEach();
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return failed;
}

// One trip request with many AWBs: pick all the documents at once (the AWB number
// is read from each file's name) and/or paste a list from a spreadsheet, check the
// table, send. Used by customers and, for a customer, by dispatch.
export default function BulkTripRequestForm({
  customerId,
  requestId,
  asAdmin,
  onDone,
}: {
  customerId: string;
  requestId: string;
  /** Dispatch is creating the request on behalf of the customer (`customerId`). */
  asAdmin?: boolean;
  onDone: () => void;
}) {
  const [tripDate, setTripDate] = useState(new Date());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pickupTime, setPickupTime] = useState(new Date());
  const [personRequesting, setPersonRequesting] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [left, setLeft] = useState<LeftFile[]>([]);
  const [fees, setFees] = useState<PickedFile[]>([]);
  const [showPaste, setShowPaste] = useState(false);
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const nextId = useRef(1);
  // Files already uploaded in this session, so a retry doesn't send them again.
  const uploaded = useRef<Map<string, RequestFile>>(new Map());

  const makeRow = (awbNumber: string): Row => ({
    id: nextId.current++,
    awbNumber,
    files: {},
    qtyPieces: "1",
    kilograms: "",
    type: "Loose",
    hazmat: false,
    unNumber: "",
  });

  const updateRow = (id: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const chooseFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], multiple: true });
    if (result.canceled || result.assets.length === 0) return;
    const picked: PickedFile[] = result.assets.map((a) => ({ uri: a.uri, name: a.name }));
    const placed = placeFiles(rows, picked, makeRow);
    if (placed.rows.length > MAX_ROWS) {
      notify("Too many AWBs", `A bulk upload takes up to ${MAX_ROWS} AWBs. Send the rest in another trip request.`);
      return;
    }
    setRows(placed.rows);
    setLeft((prev) => [...prev, ...placed.left]);
    if (placed.fees.length > 0) setFees((prev) => [...prev, ...placed.fees]);
  };

  const addFeeFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], multiple: true });
    if (result.canceled || result.assets.length === 0) return;
    setFees((prev) => [...prev, ...result.assets.map((a) => ({ uri: a.uri, name: a.name }))]);
  };

  const pickOne = async (id: number, slot: DocSlot) => {
    const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"] });
    if (result.canceled || !result.assets[0]) return;
    const a = result.assets[0];
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, files: { ...r.files, [slot]: { uri: a.uri, name: a.name } } } : r))
    );
  };

  const applyPasted = () => {
    const sheet = parseSheet(pasted);
    if (sheet.length === 0) {
      notify("Nothing to add", "No AWB numbers were found. Paste rows with the AWB number in the first column, or a header row (AWB, Pieces, KG, Type).");
      return;
    }
    const next = rows.map((r) => ({ ...r }));
    for (const s of sheet) {
      let row = next.find((r) => awbKeyOf(r.awbNumber) === awbKeyOf(s.awbNumber));
      if (!row) {
        row = makeRow(s.awbNumber);
        next.push(row);
      }
      if (s.qtyPieces !== undefined) row.qtyPieces = String(s.qtyPieces);
      if (s.kilograms !== undefined) row.kilograms = String(s.kilograms);
      if (s.type) row.type = s.type;
      if (s.hazmat !== undefined) row.hazmat = s.hazmat;
      if (s.unNumber) row.unNumber = s.unNumber;
    }
    if (next.length > MAX_ROWS) {
      notify("Too many AWBs", `A bulk upload takes up to ${MAX_ROWS} AWBs. Send the rest in another trip request.`);
      return;
    }
    setRows(next);
    setPasted("");
    setShowPaste(false);
  };

  const submit = async () => {
    if (!from.trim() || !to.trim()) return notify("Missing info", "Enter both the From and To locations.");
    if (!personRequesting.trim()) return notify("Missing info", "Enter the name of the person requesting the trip.");
    if (rows.length === 0) return notify("No AWBs", "Choose the AWB files or paste a list first.");
    if (fees.length > 30) return notify("Too many files", "Attach at most 30 import fee files.");
    const seen = new Set<string>();
    for (const r of rows) {
      const key = awbKeyOf(r.awbNumber);
      if (!key) return notify("Missing info", "Every row needs its AWB number.");
      if (seen.has(key)) return notify("AWB listed twice", `AWB ${r.awbNumber.trim()} is in the list more than once.`);
      seen.add(key);
      if (!(parseInt(r.qtyPieces, 10) >= 1)) return notify("Missing info", `AWB ${r.awbNumber.trim()}: enter the number of pieces.`);
      if (!(parseFloat(r.kilograms) > 0)) return notify("Missing info", `AWB ${r.awbNumber.trim()}: enter the weight in kilograms.`);
    }

    savePlaceIfNew(from);
    savePlaceIfNew(to);
    setBusy(true);
    try {
      // 1) documents, a few at a time; what already went up is kept for a retry.
      const tasks: { key: string; slotName: string; file: PickedFile }[] = [];
      rows.forEach((row, index) => {
        for (const { slot } of SLOTS) {
          const file = row.files[slot];
          const key = `${index}-${slot}-${file?.uri}`;
          if (file && !uploaded.current.has(key)) tasks.push({ key, slotName: `${slot}-${index}`, file });
        }
      });
      fees.forEach((file, i) => {
        const key = `fee-${i}-${file.uri}`;
        if (!uploaded.current.has(key)) tasks.push({ key, slotName: `fee-${i}`, file });
      });
      let done = 0;
      if (tasks.length > 0) setProgress(`Uploading documents 0 / ${tasks.length}`);
      const failed = await runPool(
        tasks,
        PARALLEL_UPLOADS,
        async (t) => {
          const result = await uploadTripRequestFile(t.file.uri, customerId, requestId, t.slotName, t.file.name);
          uploaded.current.set(t.key, result);
        },
        () => {
          done += 1;
          setProgress(`Uploading documents ${done} / ${tasks.length}`);
        }
      );
      if (failed.length > 0) {
        notify(
          "Some documents didn't upload",
          `${failed.length} of ${tasks.length} failed (${failed
            .slice(0, 5)
            .map((f) => f.file.name)
            .join(", ")}${failed.length > 5 ? ", …" : ""}). Press Create again to retry them; the others are kept. If a file keeps failing, remove it and attach it again.`
        );
        return;
      }

      // 2) the trip request itself.
      setProgress("Creating the trip request…");
      const fileOf = (index: number, slot: DocSlot, file?: PickedFile) =>
        file ? uploaded.current.get(`${index}-${slot}-${file.uri}`) ?? null : null;
      await createBulkTripRequest({
        requestId,
        customerId: asAdmin ? customerId : undefined,
        tripDate: formatDate(tripDate),
        from: from.trim(),
        to: to.trim(),
        pickupTime: formatTime(pickupTime),
        personRequesting: personRequesting.trim(),
        notes: notes.trim(),
        importFeeFiles: fees.map((file, i) => uploaded.current.get(`fee-${i}-${file.uri}`)).filter((f): f is RequestFile => !!f),
        awbLines: rows.map((r, index) => ({
          awbNumber: r.awbNumber.trim(),
          qtyPieces: parseInt(r.qtyPieces, 10),
          kilograms: parseFloat(r.kilograms),
          type: r.type,
          hazmat: r.hazmat,
          unNumber: r.hazmat ? r.unNumber.trim() : "",
          awbFile: fileOf(index, "awb", r.files.awb),
          loaFile: fileOf(index, "loa", r.files.loa),
          doFile: fileOf(index, "do", r.files.do),
        })),
      });
      notify("Trip request created", `${rows.length} AWB${rows.length === 1 ? "" : "s"} sent.`);
      onDone();
    } catch (e: any) {
      notify("Couldn't create the trip request", e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  return (
    <View style={Platform.OS === "web" && styles.webContainer}>
      <Text style={styles.label}>Date of trip</Text>
      <DateField value={tripDate} mode="date" onChange={setTripDate} />

      <Text style={styles.label}>From</Text>
      <PlaceInput style={styles.input} placeholder="Origin" value={from} onChangeText={setFrom} />
      <Text style={styles.label}>To</Text>
      <PlaceInput style={styles.input} placeholder="Destination" value={to} onChangeText={setTo} />

      <Text style={styles.label}>Pick up Time</Text>
      <DateField value={pickupTime} mode="time" onChange={setPickupTime} />

      <Text style={styles.label}>Person requesting the trip</Text>
      <TextInput style={styles.input} placeholder="Full name" value={personRequesting} onChangeText={setPersonRequesting} />

      <Text style={styles.label}>Note (optional)</Text>
      <TextInput
        style={[styles.input, styles.notesInput]}
        placeholder="Anything admins or the driver should know about this trip"
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      <Text style={styles.sectionTitle}>
        AWBs ({rows.length}/{MAX_ROWS})
      </Text>
      <Text style={styles.hint}>
        Choose all the documents at once. The AWB number is read from each file's name (for example 045-54066773 AWB.pdf,
        045-54066773 LOA.pdf, 045-54066773 DO.pdf). Files without LOA or DO in the name are taken as the AWB itself.
      </Text>
      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.primaryButton} onPress={chooseFiles} disabled={busy}>
          <Text style={styles.primaryButtonText}>Choose files…</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => setShowPaste((v) => !v)} disabled={busy}>
          <Text style={styles.secondaryButtonText}>Paste a list</Text>
        </TouchableOpacity>
      </View>

      {showPaste && (
        <View style={styles.pasteBox}>
          <Text style={styles.hint}>
            Paste rows from Excel or Google Sheets: AWB, Pieces, KG, Type, Hazmat, UN (a header row lets the columns come in any order).
          </Text>
          <TextInput
            style={[styles.input, styles.pasteInput]}
            multiline
            placeholder={"AWB\tPieces\tKG\tType\n045-54066773\t3\t120.5\tPMC"}
            value={pasted}
            onChangeText={setPasted}
          />
          <TouchableOpacity style={styles.primaryButton} onPress={applyPasted}>
            <Text style={styles.primaryButtonText}>Add to the table</Text>
          </TouchableOpacity>
        </View>
      )}

      {left.length > 0 && (
        <View style={styles.leftBox}>
          <Text style={styles.leftTitle}>Not added ({left.length})</Text>
          {left.map((l, i) => (
            <Text key={i} style={styles.leftText}>
              {l.file.name} — {l.reason}
            </Text>
          ))}
          <Text style={styles.leftText}>Add each one from its AWB row below, or rename it with the AWB number and choose it again.</Text>
          <TouchableOpacity onPress={() => setLeft([])}>
            <Text style={styles.linkText}>Hide this</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.sectionTitle}>Import Fee / 1F (shared across AWBs)</Text>
      <Text style={styles.hint}>
        Files with "import fee", "1F" or "IF" in the name are put here automatically.
      </Text>
      {fees.map((file, i) => (
        <View key={i} style={styles.feeRow}>
          <Text style={styles.feeName} numberOfLines={1}>
            {file.name}
          </Text>
          <TouchableOpacity onPress={() => setFees((prev) => prev.filter((_, k) => k !== i))} disabled={busy}>
            <Text style={styles.removeText}>Remove</Text>
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity style={styles.secondaryButton} onPress={addFeeFiles} disabled={busy}>
        <Text style={styles.secondaryButtonText}>+ Add import fee files</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>AWB documents ({rows.length})</Text>
      {rows.map((r) => (
        <View key={r.id} style={styles.card}>
          <View style={styles.cardTop}>
            <TextInput
              style={[styles.input, styles.awbInput]}
              placeholder="AWB number"
              autoCapitalize="characters"
              value={r.awbNumber}
              onChangeText={(v) => updateRow(r.id, { awbNumber: v })}
            />
            <TouchableOpacity onPress={() => setRows((prev) => prev.filter((x) => x.id !== r.id))} disabled={busy}>
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.cardMid}>
            <TextInput
              style={[styles.input, styles.smallInput]}
              placeholder="Pieces"
              keyboardType="number-pad"
              value={r.qtyPieces}
              onChangeText={(v) => updateRow(r.id, { qtyPieces: v.replace(/[^0-9]/g, "") })}
            />
            <TextInput
              style={[styles.input, styles.smallInput]}
              placeholder="Kg"
              keyboardType="decimal-pad"
              value={r.kilograms}
              onChangeText={(v) => updateRow(r.id, { kilograms: v.replace(/[^0-9.]/g, "") })}
            />
            <TouchableOpacity
              style={styles.cycleButton}
              onPress={() => updateRow(r.id, { type: ULD_TYPES[(ULD_TYPES.indexOf(r.type) + 1) % ULD_TYPES.length] })}
            >
              <Text style={styles.cycleText}>{r.type} ▾</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cycleButton, r.hazmat && styles.hazmatOn]}
              onPress={() => updateRow(r.id, { hazmat: !r.hazmat })}
            >
              <Text style={[styles.cycleText, r.hazmat && styles.hazmatOnText]}>Hazmat {r.hazmat ? "yes" : "no"}</Text>
            </TouchableOpacity>
            {r.hazmat && (
              <TextInput
                style={[styles.input, styles.smallInput]}
                placeholder="UN"
                value={r.unNumber}
                onChangeText={(v) => updateRow(r.id, { unNumber: v })}
              />
            )}
          </View>
          <View style={styles.docs}>
            {SLOTS.map(({ slot, label }) => {
              const file = r.files[slot];
              return (
                <TouchableOpacity key={slot} style={[styles.docChip, !!file && styles.docChipOn]} onPress={() => pickOne(r.id, slot)} disabled={busy}>
                  <Text style={[styles.docChipText, !!file && styles.docChipTextOn]} numberOfLines={1}>
                    {file ? `${label}: ${file.name}` : `+ ${label}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}

      {busy ? (
        <View style={styles.busyRow}>
          <ActivityIndicator />
          <Text style={styles.busyText}>{progress || "Working…"}</Text>
        </View>
      ) : (
        <TouchableOpacity style={styles.submitButton} onPress={submit}>
          <Text style={styles.submitButtonText}>Create Trip Request{rows.length > 0 ? ` (${rows.length} AWB${rows.length === 1 ? "" : "s"})` : ""}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  webContainer: { width: "50%" as any, minWidth: 480, alignSelf: "flex-start" },
  label: { fontSize: 13, fontWeight: "700", color: "#444", marginTop: 16, marginBottom: 6 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#111", marginTop: 26, marginBottom: 6 },
  hint: { fontSize: 12, color: "#666", marginBottom: 10, lineHeight: 17 },
  input: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  notesInput: { minHeight: 70, textAlignVertical: "top" },
  buttonRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  primaryButton: { backgroundColor: "#1d4ed8", borderRadius: 8, paddingVertical: 11, paddingHorizontal: 18, alignSelf: "flex-start" },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  secondaryButton: { backgroundColor: "#e8edff", borderRadius: 8, paddingVertical: 11, paddingHorizontal: 18 },
  secondaryButtonText: { color: "#1d4ed8", fontWeight: "700", fontSize: 14 },
  pasteBox: { marginBottom: 12 },
  pasteInput: { minHeight: 110, textAlignVertical: "top", marginBottom: 8, fontSize: 13 },
  leftBox: { backgroundColor: "#fff7e6", borderRadius: 8, borderWidth: 1, borderColor: "#f3d9a4", padding: 10, marginBottom: 12 },
  leftTitle: { fontSize: 13, fontWeight: "800", color: "#8a5a00", marginBottom: 4 },
  leftText: { fontSize: 12, color: "#6b4a00", marginBottom: 2 },
  linkText: { color: "#1d4ed8", fontWeight: "700", fontSize: 13, marginTop: 4 },
  card: { backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#ddd", padding: 10, marginBottom: 10 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  awbInput: { flex: 1, paddingVertical: 9, fontWeight: "700" },
  removeText: { color: "#c0392b", fontWeight: "700", fontSize: 13 },
  cardMid: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 8 },
  smallInput: { width: 84, paddingVertical: 9, paddingHorizontal: 10 },
  cycleButton: { borderRadius: 8, borderWidth: 1, borderColor: "#ddd", backgroundColor: "#fff", paddingVertical: 9, paddingHorizontal: 12 },
  cycleText: { fontSize: 13, fontWeight: "700", color: "#333" },
  hazmatOn: { backgroundColor: "#fdecea", borderColor: "#f0b4ad" },
  hazmatOnText: { color: "#c0392b" },
  docs: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  docChip: { borderRadius: 14, borderWidth: 1, borderColor: "#ddd", paddingVertical: 5, paddingHorizontal: 10, maxWidth: 260 },
  docChipOn: { backgroundColor: "#e7f6ec", borderColor: "#b7e0c4" },
  docChipText: { fontSize: 12, color: "#555", fontWeight: "600" },
  docChipTextOn: { color: "#14532d" },
  feeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, backgroundColor: "#fff", borderRadius: 8, borderWidth: 1, borderColor: "#ddd", paddingVertical: 8, paddingHorizontal: 12, marginBottom: 6 },
  feeName: { flex: 1, fontSize: 13, color: "#333", fontWeight: "600" },
  busyRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 24, marginBottom: 40 },
  busyText: { fontSize: 14, color: "#333", fontWeight: "600" },
  submitButton: { backgroundColor: "#1d4ed8", borderRadius: 10, paddingVertical: 15, alignItems: "center", marginTop: 22, marginBottom: 40 },
  submitButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
