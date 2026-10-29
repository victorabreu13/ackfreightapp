import { collection, doc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { HttpsCallable, httpsCallable } from "firebase/functions";
import { auth, db, functions } from "../firebase/config";
import { ChatMessage, Conversation } from "../types";

// Same helper as the other services: use the cached token, and on "unauthenticated"
// force one refresh and retry (never refresh on every call: that hit Google's quota).
async function callWithFreshToken<Req, Res>(fn: HttpsCallable<Req, Res>, data: Req): Promise<Res> {
  if (auth.currentUser) await auth.currentUser.getIdToken();
  try {
    return (await fn(data)).data;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "functions/unauthenticated" && auth.currentUser) {
      await auth.currentUser.getIdToken(true);
      return (await fn(data)).data;
    }
    throw err;
  }
}

/** Admins: every driver's thread, newest first. */
export function subscribeToConversations(
  onChange: (conversations: Conversation[]) => void,
  onError: (error: Error) => void
) {
  const q = query(collection(db, "conversations"), orderBy("lastAt", "desc"));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => ({ driverId: d.id, ...(d.data() as Omit<Conversation, "driverId">) }))),
    onError
  );
}

/** One thread's summary (unread counts, last message); null before the first message. */
export function subscribeToConversation(
  driverId: string,
  onChange: (conversation: Conversation | null) => void,
  onError: (error: Error) => void = () => {}
) {
  return onSnapshot(
    doc(db, "conversations", driverId),
    (snap) => onChange(snap.exists() ? ({ driverId, ...(snap.data() as Omit<Conversation, "driverId">) }) : null),
    onError
  );
}

/** The latest 200 messages of a thread, oldest first. */
export function subscribeToMessages(
  driverId: string,
  onChange: (messages: ChatMessage[]) => void,
  onError: (error: Error) => void
) {
  const q = query(collection(db, "conversations", driverId, "messages"), orderBy("createdAt", "desc"), limit(200));
  return onSnapshot(
    q,
    (snap) =>
      onChange(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<ChatMessage, "id">) }))
          .reverse()
      ),
    onError
  );
}

const sendMessageFn = httpsCallable<
  { driverId?: string; driverIds?: string[]; text: string },
  { success: boolean; sent: number }
>(functions, "sendMessage");

/** A driver sends to dispatch (no recipient needed); an admin sends to one driver or to several. */
export async function sendMessage(input: { driverId?: string; driverIds?: string[]; text: string }): Promise<number> {
  const result = await callWithFreshToken(sendMessageFn, input);
  return result.sent;
}

const markMessagesReadFn = httpsCallable<{ driverId?: string }, { success: boolean }>(functions, "markMessagesRead");

export async function markMessagesRead(driverId?: string): Promise<void> {
  await callWithFreshToken(markMessagesReadFn, { driverId });
}
