import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AdminShell from "../components/AdminShell";
import { sendMessage, subscribeToConversations } from "../services/messages";
import { subscribeToActiveDrivers } from "../services/users";
import { Conversation, UserProfile } from "../types";
import { confirmAction, notify } from "../utils/alert";
import { matchesTokens } from "../utils/search";

function when(ms: number): string {
  const d = new Date(ms);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Admin: every driver's chat with unread counts, plus starting a chat or sending
// one message to all drivers.
export default function InboxScreen({ navigation }: any) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [drivers, setDrivers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastText, setBroadcastText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const a = subscribeToConversations(
      (list) => {
        setConversations(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    const b = subscribeToActiveDrivers(setDrivers, () => {});
    return () => {
      a();
      b();
    };
  }, []);

  const openChat = (driverId: string, driverName: string) => {
    setPickerOpen(false);
    navigation.navigate("Chat", { driverId, driverName });
  };

  const pickerDrivers = useMemo(
    () => drivers.filter((d) => matchesTokens([d.name, d.email], pickerSearch)),
    [drivers, pickerSearch]
  );

  const sendToAll = () => {
    const body = broadcastText.trim();
    if (!body) {
      notify("Write a message", "Type the message first.");
      return;
    }
    confirmAction(
      {
        title: `Send to all ${drivers.length} drivers?`,
        message: "Each driver gets it in their own chat and as a notification.",
        confirmLabel: "Send",
      },
      async () => {
        setSending(true);
        try {
          const sent = await sendMessage({ driverIds: drivers.map((d) => d.uid), text: body });
          setBroadcastOpen(false);
          setBroadcastText("");
          notify("Sent", `Message sent to ${sent} driver${sent === 1 ? "" : "s"}.`);
        } catch (e: any) {
          notify("Couldn't send", e?.message ?? "Something went wrong. Please try again.");
        } finally {
          setSending(false);
        }
      }
    );
  };

  return (
    <AdminShell
      navigation={navigation}
      active="Inbox"
      title="Messages"
      subtitle="Chat with your drivers"
      right={
        <>
          <TouchableOpacity style={styles.headerButton} onPress={() => setBroadcastOpen(true)}>
            <Text style={styles.headerButtonText}>Send to all</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.headerButton, styles.headerPrimary]} onPress={() => setPickerOpen(true)}>
            <Text style={[styles.headerButtonText, { color: "#fff" }]}>+ New message</Text>
          </TouchableOpacity>
        </>
      }
    >
      {loading ? (
        <ActivityIndicator style={{ marginTop: 30 }} />
      ) : conversations.length === 0 ? (
        <Text style={styles.empty}>No messages yet. Tap “New message” to write to a driver.</Text>
      ) : (
        conversations.map((c) => (
          <TouchableOpacity key={c.driverId} style={styles.row} onPress={() => openChat(c.driverId, c.driverName)}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(c.driverName || "?").slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.rowTop}>
                <Text style={[styles.name, (c.unreadForAdmin ?? 0) > 0 && styles.nameUnread]} numberOfLines={1}>
                  {c.driverName}
                </Text>
                <Text style={styles.when}>{when(c.lastAt)}</Text>
              </View>
              <Text style={styles.preview} numberOfLines={1}>
                {c.lastSenderRole === "admin" ? `${c.lastSenderName ?? "You"}: ` : ""}
                {c.lastMessage}
              </Text>
            </View>
            {(c.unreadForAdmin ?? 0) > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{c.unreadForAdmin}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))
      )}

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Message a driver</Text>
            <TextInput style={styles.input} placeholder="Search drivers" value={pickerSearch} onChangeText={setPickerSearch} autoCapitalize="none" />
            <ScrollView style={{ maxHeight: 320, marginTop: 8 }}>
              {pickerDrivers.map((d) => (
                <TouchableOpacity key={d.uid} style={styles.pickRow} onPress={() => openChat(d.uid, d.name)}>
                  <Text style={styles.pickName}>{d.name}</Text>
                </TouchableOpacity>
              ))}
              {pickerDrivers.length === 0 && <Text style={styles.empty}>No driver matches.</Text>}
            </ScrollView>
            <TouchableOpacity onPress={() => setPickerOpen(false)}>
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={broadcastOpen} transparent animationType="fade" onRequestClose={() => setBroadcastOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Send to all drivers</Text>
            <Text style={styles.boxText}>{drivers.length} active drivers will get this message.</Text>
            <TextInput
              style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
              placeholder="Write the message"
              value={broadcastText}
              onChangeText={setBroadcastText}
              multiline
              maxLength={1000}
            />
            <View style={styles.actions}>
              <TouchableOpacity onPress={() => setBroadcastOpen(false)} disabled={sending}>
                <Text style={styles.cancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sendButton} onPress={sendToAll} disabled={sending}>
                {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sendText}>Send</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  headerButton: { borderWidth: 1, borderColor: "#e3e7ef", backgroundColor: "#fff", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  headerPrimary: { backgroundColor: "#1d4ed8", borderColor: "#1d4ed8" },
  headerButtonText: { fontWeight: "700", fontSize: 13, color: "#0f172a" },
  empty: { color: "#94a3b8", fontSize: 14, marginTop: 16, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 12, marginBottom: 8 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#e8edff", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#1d4ed8", fontWeight: "800", fontSize: 17 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  name: { flex: 1, fontSize: 15, fontWeight: "600", color: "#0f172a" },
  nameUnread: { fontWeight: "800" },
  when: { fontSize: 12, color: "#94a3b8" },
  preview: { fontSize: 13, color: "#64748b", marginTop: 2 },
  badge: { backgroundColor: "#16a34a", borderRadius: 11, minWidth: 22, height: 22, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: 20 },
  box: { backgroundColor: "#fff", borderRadius: 14, padding: 18, width: "100%", maxWidth: 420 },
  boxTitle: { fontSize: 18, fontWeight: "800", color: "#111", marginBottom: 6 },
  boxText: { fontSize: 13.5, color: "#475569", marginBottom: 10 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  pickRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  pickName: { fontSize: 15, fontWeight: "600", color: "#0f172a" },
  actions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 18, marginTop: 14 },
  cancel: { color: "#64748b", fontWeight: "700", fontSize: 15, textAlign: "center", marginTop: 12 },
  sendButton: { backgroundColor: "#1d4ed8", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 22, minWidth: 80, alignItems: "center" },
  sendText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
