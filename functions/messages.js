// Internal messages between admins and drivers. Pure helpers (no Firebase) so
// they can be unit tested. Messages live in conversations/{driverId}/messages,
// one thread per driver that every admin shares.

const MAX_TEXT = 1000;
const MAX_RECIPIENTS = 200;

/** { ok: true, text } with the message cleaned up, or { ok: false, message }. */
function cleanMessageText(value) {
  const text = String(value == null ? "" : value)
    .replace(/\r\n/g, "\n")
    .trim();
  if (!text) return { ok: false, message: "Write a message first." };
  if (text.length > MAX_TEXT) return { ok: false, message: "That message is too long (1,000 characters at most)." };
  return { ok: true, text };
}

/** One short line for the notification and the conversation list. */
function previewText(text, max = 120) {
  const oneLine = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1) + "…" : oneLine;
}

/**
 * Which driver threads a message goes to. A driver can only write to their own;
 * an admin to one driver or to a list of drivers (a broadcast).
 */
function messageTargets(role, uid, data) {
  if (role === "driver") {
    const asked = data && data.driverId;
    if (asked && asked !== uid) return { ok: false, message: "You can only message dispatch." };
    return { ok: true, driverIds: [uid] };
  }
  if (role === "admin") {
    const list = Array.isArray(data && data.driverIds) ? data.driverIds : data && data.driverId ? [data.driverId] : [];
    const unique = [...new Set(list.filter((id) => typeof id === "string" && id))];
    if (unique.length === 0) return { ok: false, message: "Choose who to message." };
    if (unique.length > MAX_RECIPIENTS) return { ok: false, message: "Too many recipients at once." };
    return { ok: true, driverIds: unique };
  }
  return { ok: false, message: "Only admins and drivers can send messages." };
}

module.exports = { MAX_TEXT, cleanMessageText, previewText, messageTargets };
