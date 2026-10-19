import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { sendDocumentsToCounter } from "../services/tripRequests";
import { TripRequest } from "../types";
import { notify } from "../utils/alert";

const RECENT_KEY = "recentCounterEmails";

function looksLikeEmail(value: string): boolean {
  return /^[^ @]+@[^ @]+[.][^ @]+$/.test(value.trim());
}

// Admin: email every document of this trip request, as one zip, to a counter.
export default function SendToCounterButton({ request }: { request: TripRequest }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  const documentCount = (request.awbLines ?? []).reduce(
    (n, l) => n + [l.awbFile, l.loaFile, l.doFile].filter(Boolean).length,
    0
  );

  useEffect(() => {
    if (!open) return;
    AsyncStorage.getItem(RECENT_KEY)
      .then((raw) => setRecent(raw ? (JSON.parse(raw) as string[]) : []))
      .catch(() => {});
  }, [open]);

  const send = async () => {
    const to = email.trim();
    if (!looksLikeEmail(to)) {
      notify("Enter an email", "Type the counter's email address.");
      return;
    }
    setSending(true);
    try {
      const { documents } = await sendDocumentsToCounter(request.id, to);
      const next = [to, ...recent.filter((e) => e.toLowerCase() !== to.toLowerCase())].slice(0, 5);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
      setOpen(false);
      setEmail("");
      notify("Sent", `${documents} document${documents === 1 ? "" : "s"} sent to ${to}.`);
    } catch (e: any) {
      notify("Couldn't send", e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const sends = request.counterSends ?? [];

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[styles.button, documentCount === 0 && styles.buttonOff]}
        onPress={() =>
          documentCount === 0
            ? notify("No documents", "Upload the AWB documents first, then send them to the counter.")
            : setOpen(true)
        }
      >
        <Text style={styles.buttonText}>✉  Send to counter</Text>
      </TouchableOpacity>
      {sends.length > 0 && (
        <Text style={styles.history}>
          Last sent to {sends[sends.length - 1].email} on{" "}
          {new Date(sends[sends.length - 1].sentAt).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
          {sends.length > 1 ? ` · ${sends.length} sends in total` : ""}
        </Text>
      )}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.box}>
            <Text style={styles.title}>Send to counter</Text>
            <Text style={styles.text}>
              All {documentCount} document{documentCount === 1 ? "" : "s"} of this trip go in one zip, with the subject
              “Pick up request documents”.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="counter@airline.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
            {recent.length > 0 && (
              <View style={styles.chips}>
                {recent.map((e) => (
                  <TouchableOpacity key={e} style={styles.chip} onPress={() => setEmail(e)}>
                    <Text style={styles.chipText}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <View style={styles.actions}>
              <TouchableOpacity onPress={() => setOpen(false)} disabled={sending}>
                <Text style={styles.cancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.send} onPress={send} disabled={sending}>
                {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sendText}>Send</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4, marginBottom: 12 },
  button: { backgroundColor: "#1d4ed8", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  buttonOff: { backgroundColor: "#94a3b8" },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  history: { fontSize: 12, color: "#64748b", marginTop: 6 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: 20 },
  box: { backgroundColor: "#fff", borderRadius: 14, padding: 18, width: "100%", maxWidth: 420 },
  title: { fontSize: 18, fontWeight: "800", color: "#111", marginBottom: 6 },
  text: { fontSize: 13.5, color: "#475569", marginBottom: 12, lineHeight: 19 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  chip: { backgroundColor: "#f1f5f9", borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10 },
  chipText: { fontSize: 12.5, color: "#334155", fontWeight: "600" },
  actions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 18, marginTop: 16 },
  cancel: { color: "#64748b", fontWeight: "700", fontSize: 15 },
  send: { backgroundColor: "#1d4ed8", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 22, minWidth: 80, alignItems: "center" },
  sendText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
