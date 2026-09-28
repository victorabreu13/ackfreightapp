import React, { useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { UserProfile } from "../types";

interface Props {
  drivers: UserProfile[];
  assignedDriverName: string | null;
  onSelect: (driver: UserProfile | null) => void;
  disabled?: boolean;
}

export default function AwbDriverPicker({
  drivers,
  assignedDriverName,
  onSelect,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity
        style={[styles.button, disabled && styles.buttonDisabled]}
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
      >
        <Text style={styles.buttonText}>
          {assignedDriverName ? `Assigned to: ${assignedDriverName}` : "Unassigned"}
        </Text>
        {!disabled && <Text style={styles.chevron}>▾</Text>}
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.option}
              onPress={() => {
                onSelect(null);
                setOpen(false);
              }}
            >
              <Text style={styles.optionText}>Unassigned</Text>
            </TouchableOpacity>
            {drivers.map((d) => (
              <TouchableOpacity
                key={d.uid}
                style={styles.option}
                onPress={() => {
                  onSelect(d);
                  setOpen(false);
                }}
              >
                <Text style={styles.optionText}>{d.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  buttonDisabled: { backgroundColor: "#f0f0f0" },
  buttonText: { fontSize: 14, color: "#111", fontWeight: "600" },
  chevron: { color: "#888", fontSize: 12 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 32,
  },
  card: { backgroundColor: "#fff", borderRadius: 12, paddingVertical: 8 },
  option: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  optionText: { fontSize: 16, color: "#111" },
});
