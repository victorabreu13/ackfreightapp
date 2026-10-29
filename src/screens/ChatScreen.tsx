import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AdminShell from "../components/AdminShell";
import { useAuth } from "../context/AuthContext";
import { goBackOrHome } from "../navigation/goBackOrHome";
import { markMessagesRead, sendMessage, subscribeToMessages } from "../services/messages";
import { ChatMessage } from "../types";
import { notify } from "../utils/alert";

function stamp(ms: number): string {
  const d = new Date(ms);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString()
    ? time
    : `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
}

// The chat between dispatch and one driver. A driver opens it from their home
// (their own thread); an admin opens a driver's thread from Messages.
export default function ChatScreen({ route, navigation }: any) {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const driverId: string | undefined = isAdmin ? route.params?.driverId : user?.uid;
  const title = isAdmin ? route.params?.driverName || "Driver" : "Dispatch";

  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const lastRead = useRef<string | null>(null);

  useEffect(() => {
    if (!driverId) return;
    return subscribeToMessages(
      driverId,
      setMessages,
      (err) => {
        console.error("subscribeToMessages failed:", err);
        setMessages([]);
      }
    );
  }, [driverId]);

  // Open or receive a message from the other side while looking at it: mark it read.
  useEffect(() => {
    if (!driverId || !messages || messages.length === 0) return;
    const last = messages[messages.length - 1];
    const fromOtherSide = isAdmin ? last.senderRole === "driver" : last.senderRole === "admin";
    if (!fromOtherSide || lastRead.current === last.id) return;
    lastRead.current = last.id;
    markMessagesRead(driverId).catch((err) => console.error("markMessagesRead failed:", err));
  }, [messages, driverId, isAdmin]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending || !driverId) return;
    setSending(true);
    try {
      await sendMessage(isAdmin ? { driverId, text: body } : { text: body });
      setText("");
    } catch (e: any) {
      notify("Couldn't send", e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const mySide = isAdmin ? "admin" : "driver";
  const list = (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}>
      {messages === null ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          style={styles.flex}
          contentContainerStyle={styles.listContent}
          inverted
          data={[...messages].reverse()}
          keyExtractor={(m) => m.id}
          ListEmptyComponent={<Text style={styles.empty}>No messages yet. Say hello.</Text>}
          renderItem={({ item }) => {
            const mine = item.senderRole === mySide;
            return (
              <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  {(!mine || (isAdmin && item.senderId !== user?.uid)) && (
                    <Text style={styles.sender}>{item.senderName}</Text>
                  )}
                  <Text style={[styles.text, mine && styles.textMine]}>{item.text}</Text>
                  <Text style={[styles.time, mine && styles.timeMine]}>{stamp(item.createdAt)}</Text>
                </View>
              </View>
            );
          }}
        />
      )}
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="Write a message"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={1000}
          onSubmitEditing={Platform.OS === "web" ? send : undefined}
        />
        <TouchableOpacity style={[styles.sendButton, (!text.trim() || sending) && styles.sendOff]} onPress={send} disabled={!text.trim() || sending}>
          {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sendText}>Send</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );

  if (isAdmin) {
    return (
      <AdminShell navigation={navigation} active="Inbox" title={title} subtitle="Messages" scroll={false}>
        <View style={styles.adminWrap}>{list}</View>
      </AdminShell>
    );
  }
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBackOrHome(navigation)}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{ width: 50 }} />
      </View>
      {list}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: "#f5f6fa" },
  adminWrap: { flex: 1, minHeight: 480, maxWidth: 760 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  back: { color: "#1d4ed8", fontWeight: "700", fontSize: 16, width: 50 },
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#111" },
  listContent: { padding: 14, gap: 8 },
  empty: { textAlign: "center", color: "#94a3b8", marginTop: 40, transform: [{ scaleY: -1 }] },
  row: { flexDirection: "row" },
  rowMine: { justifyContent: "flex-end" },
  rowTheirs: { justifyContent: "flex-start" },
  bubble: { maxWidth: "82%", borderRadius: 16, paddingVertical: 8, paddingHorizontal: 12 },
  bubbleMine: { backgroundColor: "#1d4ed8", borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e5e7eb", borderBottomLeftRadius: 4 },
  sender: { fontSize: 11.5, fontWeight: "800", color: "#475569", marginBottom: 2 },
  text: { fontSize: 15, color: "#0f172a", lineHeight: 20 },
  textMine: { color: "#fff" },
  time: { fontSize: 10.5, color: "#94a3b8", marginTop: 3, alignSelf: "flex-end" },
  timeMine: { color: "#c7d7ff" },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 10, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#e5e7eb" },
  input: { flex: 1, maxHeight: 120, backgroundColor: "#f5f6fa", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  sendButton: { backgroundColor: "#1d4ed8", borderRadius: 18, paddingVertical: 10, paddingHorizontal: 18, minWidth: 64, alignItems: "center" },
  sendOff: { opacity: 0.45 },
  sendText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
