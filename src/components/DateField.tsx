import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useState } from "react";
import {
  Modal,
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { toLocalDateString } from "../utils/date";

interface Props {
  value: Date;
  mode: "date" | "time";
  onChange: (date: Date) => void;
  style?: StyleProp<ViewStyle>;
  // Native-only override for the button text (e.g. "All dates" while a
  // filter is cleared). Web always shows the browser's own input value.
  label?: string;
}

function formatLabel(value: Date, mode: "date" | "time") {
  return mode === "date" ? toLocalDateString(value) : value.toTimeString().slice(0, 5);
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Local (not UTC) calendar/clock components — matches what a date/time
// picker widget shows and lets the user change. Callers apply the app's own
// local-calendar-day string convention afterward (see utils/date.ts).
function toWebInputValue(value: Date, mode: "date" | "time") {
  if (mode === "date") {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function fromWebInputValue(raw: string, mode: "date" | "time", base: Date): Date | null {
  if (!raw) return null;
  const next = new Date(base);
  if (mode === "date") {
    const [y, m, d] = raw.split("-").map(Number);
    if (!y || !m || !d) return null;
    next.setFullYear(y, m - 1, d);
  } else {
    const [h, min] = raw.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(min)) return null;
    next.setHours(h, min, 0, 0);
  }
  return next;
}

// @react-native-community/datetimepicker is native-only — it silently
// renders nothing on web. This wraps it with a real HTML date/time input on
// web, and the usual tap-to-open picker on native.
export default function DateField({ value, mode, onChange, style, label }: Props) {
  const [show, setShow] = useState(false);
  const [draft, setDraft] = useState(value);

  if (Platform.OS === "web") {
    return React.createElement("input", {
      type: mode,
      value: toWebInputValue(value, mode),
      onChange: (e: any) => {
        const next = fromWebInputValue(e.target.value, mode, value);
        if (next) onChange(next);
      },
      style: mode === "date" ? webInputStyleDate : webInputStyleTime,
    });
  }

  const open = () => {
    setDraft(value);
    setShow(true);
  };

  // iOS: the spinner opens in a bottom sheet over the screen, so it can't push
  // the fields around it (a wheel drawn inline widens whatever row holds the
  // field). The date only changes when Done is tapped.
  if (Platform.OS === "ios") {
    return (
      <View>
        <TouchableOpacity style={[styles.button, style]} onPress={open}>
          <Text style={styles.buttonText}>{label ?? formatLabel(value, mode)}</Text>
        </TouchableOpacity>
        <Modal visible={show} transparent animationType="slide" onRequestClose={() => setShow(false)}>
          <View style={styles.backdrop}>
            <TouchableOpacity style={styles.backdropTap} activeOpacity={1} onPress={() => setShow(false)} />
            <View style={styles.sheet}>
              <View style={styles.sheetBar}>
                <TouchableOpacity onPress={() => setShow(false)} style={styles.sheetButton}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    onChange(draft);
                    setShow(false);
                  }}
                  style={styles.sheetButton}
                >
                  <Text style={styles.doneButtonText}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={draft}
                mode={mode}
                display="spinner"
                themeVariant="light"
                style={styles.spinner}
                onChange={(_, selected) => {
                  if (selected) setDraft(selected);
                }}
              />
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View>
      <TouchableOpacity style={[styles.button, style]} onPress={open}>
        <Text style={styles.buttonText}>{label ?? formatLabel(value, mode)}</Text>
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          value={value}
          mode={mode}
          display="default"
          onChange={(_, selected) => {
            setShow(false);
            if (selected) onChange(selected);
          }}
        />
      )}
    </View>
  );
}

const webInputStyleBase: any = {
  backgroundColor: "#fff",
  borderRadius: 10,
  border: "1px solid #ddd",
  paddingTop: 12,
  paddingBottom: 12,
  paddingLeft: 14,
  paddingRight: 14,
  fontSize: 15,
  color: "#111",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

// Fixed to roughly the width of the value itself (browsers otherwise stretch
// a bare <input> to fill its container) instead of spanning the whole form.
const webInputStyleDate: any = { ...webInputStyleBase, width: 170 };
const webInputStyleTime: any = { ...webInputStyleBase, width: 140 };

const styles = StyleSheet.create({
  button: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  buttonText: { fontSize: 15, color: "#111" },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(10,26,58,0.35)" },
  backdropTap: { flex: 1 },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 24 },
  sheetBar: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: "#e3e7ef" },
  sheetButton: { paddingVertical: 14, paddingHorizontal: 12 },
  spinner: { alignSelf: "center", width: "100%" },
  cancelText: { color: "#666", fontWeight: "600", fontSize: 16 },
  doneButtonText: { color: "#1d4ed8", fontWeight: "700", fontSize: 16 },
});
