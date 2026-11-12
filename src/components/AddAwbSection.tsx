import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import AwbDriverPicker from "./AwbDriverPicker";
import { addAwbLines } from "../services/tripRequests";
import { ULD_TYPES, UldType, UserProfile } from "../types";
import { notify } from "../utils/alert";

interface Row {
  awbNumber: string;
  qtyPieces: string;
  kilograms: string;
  type: UldType;
  hazmat: boolean;
  unNumber: string;
}

const emptyRow = (): Row => ({ awbNumber: "", qtyPieces: "", kilograms: "", type: "Loose", hazmat: false, unNumber: "" });

// Adds AWBs to a trip request that was already submitted. Dispatch can also pick
// the driver; without `drivers` (the customer) the new AWBs follow the trip's driver.
export default function AddAwbSection({ requestId, drivers }: { requestId: string; drivers?: UserProfile[] }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  // undefined: the trip's own driver. null: nobody (goes on the job board).
  const [driver, setDriver] = useState<UserProfile | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const setRow = (i: number, changes: Partial<Row>) =>
    setRows((prev) => prev.map((r, k) => (k === i ? { ...r, ...changes } : r)));

  const reset = () => {
    setRows([emptyRow()]);
    setDriver(undefined);
    setOpen(false);
  };

  const save = async () => {
    for (const r of rows) {
      if (!r.awbNumber.trim()) return notify("Missing info", "Enter the AWB number on every row.");
      if (!(parseInt(r.qtyPieces, 10) >= 1)) return notify("Missing info", `AWB ${r.awbNumber.trim()}: enter the number of pieces.`);
      if (!(parseFloat(r.kilograms) > 0)) return notify("Missing info", `AWB ${r.awbNumber.trim()}: enter the weight in kilograms.`);
    }
    setSaving(true);
    try {
      const result = await addAwbLines(
        requestId,
        rows.map((r) => ({
          awbNumber: r.awbNumber.trim(),
          qtyPieces: parseInt(r.qtyPieces, 10),
          kilograms: parseFloat(r.kilograms),
          type: r.type,
          hazmat: r.hazmat,
          unNumber: r.hazmat ? r.unNumber.trim() : "",
        })),
        drivers && driver !== undefined ? { driverId: driver ? driver.uid : null } : undefined
      );
      notify(
        result.added === 1 ? "AWB added" : "AWBs added",
        result.driverName
          ? `${result.driverName} was notified. Attach its documents from the AWB list below.`
          : "It is on the job board until a driver is assigned. Attach its documents from the AWB list below."
      );
      reset();
    } catch (e: any) {
      notify("Couldn't add the AWB", e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <TouchableOpacity style={styles.openButton} onPress={() => setOpen(true)}>
        <Text style={styles.openButtonText}>+ Add AWB to this trip</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Add AWB</Text>
      {rows.map((r, i) => (
        <View key={i} style={styles.row}>
          <TextInput
            style={styles.input}
            placeholder="AWB number"
            autoCapitalize="characters"
            value={r.awbNumber}
            onChangeText={(v) => setRow(i, { awbNumber: v })}
          />
          <View style={styles.pair}>
            <TextInput
              style={[styles.input, styles.half]}
              placeholder="Pieces"
              keyboardType="number-pad"
              value={r.qtyPieces}
              onChangeText={(v) => setRow(i, { qtyPieces: v.replace(/[^0-9]/g, "") })}
            />
            <TextInput
              style={[styles.input, styles.half]}
              placeholder="Kilograms"
              keyboardType="decimal-pad"
              value={r.kilograms}
              onChangeText={(v) => setRow(i, { kilograms: v.replace(/[^0-9.]/g, "") })}
            />
          </View>
          <View style={styles.chips}>
            {ULD_TYPES.map((t) => (
              <TouchableOpacity key={t} style={[styles.chip, r.type === t && styles.chipOn]} onPress={() => setRow(i, { type: t })}>
                <Text style={[styles.chipText, r.type === t && styles.chipTextOn]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.hazRow}>
            <Text style={styles.hazLabel}>Hazmat</Text>
            <Switch value={r.hazmat} onValueChange={(v) => setRow(i, { hazmat: v })} />
            {r.hazmat && (
              <TextInput
                style={[styles.input, styles.unInput]}
                placeholder="UN number"
                value={r.unNumber}
                onChangeText={(v) => setRow(i, { unNumber: v })}
              />
            )}
          </View>
          {rows.length > 1 && (
            <TouchableOpacity onPress={() => setRows((prev) => prev.filter((_, k) => k !== i))}>
              <Text style={styles.removeText}>Remove this row</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
      <TouchableOpacity onPress={() => setRows((prev) => [...prev, emptyRow()])}>
        <Text style={styles.linkText}>+ Another AWB</Text>
      </TouchableOpacity>

      {drivers && (
        <View style={{ marginTop: 12 }}>
          <Text style={styles.label}>Driver</Text>
          <AwbDriverPicker
            drivers={drivers}
            assignedDriverName={driver === undefined ? "Same driver as the trip" : driver ? driver.name : null}
            onSelect={(d) => setDriver(d)}
          />
        </View>
      )}

      <View style={styles.actions}>
        {saving ? (
          <ActivityIndicator />
        ) : (
          <>
            <TouchableOpacity style={styles.saveButton} onPress={save}>
              <Text style={styles.saveButtonText}>Add</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={reset}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  openButton: {
    alignSelf: "flex-start",
    backgroundColor: "#e8edff",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  openButtonText: { color: "#1d4ed8", fontWeight: "700", fontSize: 14 },
  box: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 14,
    marginTop: 10,
    width: "100%",
    maxWidth: 440,
  },
  title: { fontSize: 15, fontWeight: "800", color: "#111", marginBottom: 8 },
  row: { borderBottomWidth: 1, borderBottomColor: "#eee", paddingBottom: 10, marginBottom: 10 },
  input: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 8,
  },
  pair: { flexDirection: "row", gap: 8 },
  half: { flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  chip: { borderRadius: 14, borderWidth: 1, borderColor: "#ddd", paddingVertical: 5, paddingHorizontal: 10, backgroundColor: "#fff" },
  chipOn: { backgroundColor: "#1d4ed8", borderColor: "#1d4ed8" },
  chipText: { fontSize: 13, color: "#333", fontWeight: "600" },
  chipTextOn: { color: "#fff" },
  hazRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  hazLabel: { fontSize: 14, color: "#333", fontWeight: "600" },
  unInput: { flex: 1, marginBottom: 0 },
  removeText: { color: "#c0392b", fontWeight: "700", fontSize: 13, marginTop: 8 },
  linkText: { color: "#1d4ed8", fontWeight: "700", fontSize: 14 },
  label: { fontSize: 13, fontWeight: "700", color: "#555", marginBottom: 6 },
  actions: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 14 },
  saveButton: { backgroundColor: "#1d4ed8", borderRadius: 8, paddingVertical: 11, paddingHorizontal: 22 },
  saveButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  cancelText: { color: "#666", fontWeight: "700", fontSize: 14 },
});
