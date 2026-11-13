import React, { useState } from "react";
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { updateAwbDetails } from "../services/tripRequests";
import { AwbLine, ULD_TYPES, UldType } from "../types";
import { notify } from "../utils/alert";

// Dispatch fixes pieces, kilograms and ULD type per AWB after submit. The billing, the
// driver's pay and the trip in Payroll follow on the server.
export default function AwbDetailsSection({
  requestId,
  lines,
  onChanged,
  narrow,
}: {
  requestId: string;
  lines: AwbLine[];
  onChanged: (awbIndex: number, changes: { qtyPieces: number; kilograms: number; type: UldType }) => void;
  narrow?: boolean;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [pcs, setPcs] = useState("");
  const [kg, setKg] = useState("");
  const [type, setType] = useState<UldType>("Loose");
  const [pickingType, setPickingType] = useState(false);
  const [saving, setSaving] = useState(false);

  const start = (i: number) => {
    const line = lines[i];
    setEditing(i);
    setPcs(String(line.qtyPieces));
    setKg(String(line.kilograms));
    setType(line.type);
  };

  const save = async () => {
    if (editing === null) return;
    const line = lines[editing];
    const qtyPieces = parseInt(pcs, 10);
    const kilograms = parseFloat(kg);
    if (!(qtyPieces >= 1)) return notify("Enter the pieces", "Enter a number of pieces of 1 or more.");
    if (!(kilograms > 0)) return notify("Enter a weight", "Enter a kilogram value greater than 0.");
    const changes: { qtyPieces?: number; kilograms?: number; type?: UldType } = {};
    if (qtyPieces !== line.qtyPieces) changes.qtyPieces = qtyPieces;
    if (kilograms !== line.kilograms) changes.kilograms = kilograms;
    if (type !== line.type) changes.type = type;
    if (Object.keys(changes).length === 0) {
      setEditing(null);
      return;
    }
    setSaving(true);
    try {
      const result = await updateAwbDetails(requestId, editing, changes);
      onChanged(editing, result.line);
      setEditing(null);
      const notes: string[] = [];
      if (result.tripLogUpdated) notes.push("The trip in Payroll was updated too.");
      if (result.payLocked) notes.push("This AWB's pay was already locked; adjust it from the pay section above if needed.");
      if (notes.length > 0) notify("Saved", notes.join(" "));
    } catch (e: any) {
      notify("Couldn't save", e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <Text style={styles.title}>AWB details</Text>
      <Text style={styles.hint}>
        Fix pieces, kilograms or ULD before invoicing: the quote, the invoice and the driver's pay follow (a completed trip in
        Payroll too, unless it was already paid).
      </Text>
      {lines.map((line, i) => (
        <View key={i} style={styles.row}>
          <Text style={[styles.label, narrow && styles.labelNarrow]}>{line.awbNumber}</Text>
          {editing === i ? (
            <View style={styles.editRow}>
              <TextInput style={styles.input} keyboardType="number-pad" value={pcs} onChangeText={(v) => setPcs(v.replace(/[^0-9]/g, ""))} autoFocus />
              <Text style={styles.unit}>pcs</Text>
              <TextInput style={styles.input} keyboardType="decimal-pad" value={kg} onChangeText={(v) => setKg(v.replace(/[^0-9.]/g, ""))} />
              <Text style={styles.unit}>kg</Text>
              <TouchableOpacity style={styles.typeButton} onPress={() => setPickingType(true)}>
                <Text style={styles.typeText}>{type} ▾</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Save</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditing(null)} disabled={saving}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => start(i)}>
              <Text style={styles.valueText}>
                {line.qtyPieces} pcs · {line.kilograms} kg · {line.type} · Edit
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      <Modal visible={pickingType} transparent animationType="fade" onRequestClose={() => setPickingType(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setPickingType(false)}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>ULD type</Text>
            {ULD_TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                style={styles.option}
                onPress={() => {
                  setType(t);
                  setPickingType(false);
                }}
              >
                <Text style={styles.optionText}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: "800", color: "#111", marginTop: 26, marginBottom: 10 },
  hint: { fontSize: 12, color: "#888", marginTop: -6, marginBottom: 10 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 10 },
  label: { width: 150, fontSize: 14, fontWeight: "700", color: "#111" },
  labelNarrow: { width: "100%" as any },
  editRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  input: {
    width: 80,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  unit: { fontSize: 13, color: "#666" },
  typeButton: { borderRadius: 8, borderWidth: 1, borderColor: "#ddd", backgroundColor: "#fff", paddingVertical: 9, paddingHorizontal: 12 },
  typeText: { fontSize: 13, fontWeight: "700", color: "#333" },
  saveButton: { backgroundColor: "#1d4ed8", borderRadius: 8, paddingVertical: 9, paddingHorizontal: 16 },
  saveText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  cancelText: { color: "#666", fontWeight: "700", fontSize: 13 },
  valueText: { fontSize: 13, color: "#1d4ed8", fontWeight: "600" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 24 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 12, width: "100%", maxWidth: 320 },
  cardTitle: { fontSize: 14, fontWeight: "800", color: "#111", paddingHorizontal: 8, paddingVertical: 8 },
  option: { paddingVertical: 12, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: "#eee" },
  optionText: { fontSize: 15, fontWeight: "600", color: "#111" },
});
