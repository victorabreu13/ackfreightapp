import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import {
  adjustAwbPay,
  setAwbPayOverride,
  subscribeToRequestAwbPay,
  subscribeToRequestPayOverrides,
} from "../services/driverPay";
import { AwbLine, AwbPay, AwbPayOverride } from "../types";
import { notify } from "../utils/alert";
import { money, payHeadline } from "../utils/driverPayDisplay";

export default function DispatchAwbPay({
  requestId,
  lines,
}: {
  requestId: string;
  lines: AwbLine[];
}) {
  const [pays, setPays] = useState<AwbPay[]>([]);
  const [overrides, setOverrides] = useState<AwbPayOverride[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsubPay = subscribeToRequestAwbPay(requestId, setPays);
    const unsubOverride = subscribeToRequestPayOverrides(requestId, setOverrides);
    return () => {
      unsubPay();
      unsubOverride();
    };
  }, [requestId]);

  const startEdit = (index: number, current?: number) => {
    setEditing(index);
    setAmount(typeof current === "number" ? String(current) : "");
    setReason("");
  };

  const save = async (index: number, locked: boolean) => {
    const value = Number(amount);
    if (!Number.isFinite(value) || (locked ? value === 0 : value < 0)) {
      notify("Enter an amount", locked ? "Enter a non-zero adjustment." : "Enter zero or more.");
      return;
    }
    if (!reason.trim()) {
      notify("Enter a reason", "Say why this pay changed.");
      return;
    }
    setSaving(true);
    try {
      if (locked) await adjustAwbPay(requestId, index, value, reason.trim());
      else await setAwbPayOverride(requestId, index, value, reason.trim());
      setEditing(null);
    } catch (err: any) {
      notify("Couldn't update pay", err?.message ?? "Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <Text style={styles.sectionTitle}>Driver pay</Text>
      <Text style={styles.hint}>
        Each driver is offered their own agreement. Type an amount here to set this job for every driver. Completed
        trips stay locked; add an adjustment instead.
      </Text>
      {lines.map((line, index) => {
        const pay = pays.find((row) => row.awbIndex === index);
        const override = overrides.find((row) => row.awbIndex === index);
        const headline = payHeadline(pay);
        const locked = pay?.locked === true;
        return (
          <View key={index} style={styles.card}>
            <Text style={styles.awb}>{line.awbNumber || `AWB ${index + 1}`}</Text>
            {pay ? (
              <Text style={[styles.pay, !headline.quoted && styles.unset]}>{headline.text}</Text>
            ) : override ? (
              <Text style={styles.pay}>{money(override.amount)}</Text>
            ) : line.assignedDriverId ? (
              <Text style={styles.unset}>Pay set by dispatch</Text>
            ) : (
              <Text style={styles.unset}>Each on-duty driver sees their own pay.</Text>
            )}
            {pay?.status === "quoted" &&
              pay.breakdown.map((part) => (
                <Text key={part.label} style={styles.meta}>
                  {part.label} {money(part.amount)}
                </Text>
              ))}
            {pay && pay.waitAmount > 0 && <Text style={styles.meta}>Wait {money(pay.waitAmount)}</Text>}
            {pay?.adjustment && (
              <Text style={styles.meta}>
                Adjustment {money(pay.adjustment.amount)} · {pay.adjustment.reason}
              </Text>
            )}
            {override && !locked && (
              <Text style={styles.meta}>
                Set by {override.byName || "dispatch"} · {override.reason}
              </Text>
            )}
            {editing === index ? (
              <View style={styles.editor}>
                <TextInput
                  style={styles.input}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  placeholder={locked ? "Adjustment, e.g. 15 or -10" : "Amount"}
                />
                <TextInput
                  style={styles.input}
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Reason"
                />
                <View style={styles.row}>
                  <TouchableOpacity style={styles.save} onPress={() => save(index, locked)} disabled={saving}>
                    {saving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.saveText}>{locked ? "Add adjustment" : "Set pay"}</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditing(null)}>
                    <Text style={styles.cancel}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity onPress={() => startEdit(index, locked ? undefined : override?.amount ?? pay?.amount ?? undefined)}>
                <Text style={styles.link}>{locked ? "Add adjustment" : "Set this job's pay"}</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 16, fontWeight: "800", color: "#111", marginTop: 22, marginBottom: 6 },
  hint: { fontSize: 13, color: "#666", marginBottom: 8, lineHeight: 18 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 8 },
  awb: { fontSize: 14, fontWeight: "700", color: "#111" },
  pay: { fontSize: 26, fontWeight: "800", color: "#111", marginTop: 4 },
  unset: { fontSize: 15, fontWeight: "700", color: "#92400e", marginTop: 4 },
  meta: { fontSize: 12, color: "#555", marginTop: 3 },
  link: { color: "#1d4ed8", fontWeight: "700", fontSize: 13, marginTop: 8 },
  editor: { marginTop: 8, gap: 8 },
  input: {
    backgroundColor: "#f5f6fa",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  save: { backgroundColor: "#1d4ed8", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  saveText: { color: "#fff", fontWeight: "700" },
  cancel: { color: "#888", fontWeight: "600" },
});
