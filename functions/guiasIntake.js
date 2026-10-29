// Trip requests that ACK Guías sends to ACK Freight (a pickup order was created, or
// the cargo is ready for delivery). Pure helpers (no Firebase) so they can be unit
// tested. Everything in the payload is untrusted: it is cleaned and bounded here.

const ULD_TYPES = ["Loose", "Skid", "PMC", "FQA", "PAG", "DQF", "ALF", "AKE"];
const SLOTS = ["awb", "loa", "do"];
const MAX_LINES = 10;
const MAX_DOC_CHARS = 8000000; // base64 characters, about 6 MB of file

function clean(value, max) {
  return String(value == null ? "" : value)
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max);
}

function cleanMultiline(value, max) {
  return String(value == null ? "" : value)
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, max);
}

/** Lower-case letters and digits only, so "IVI Logistics" and "ivi-logistics" are the same name. */
function normalizeName(value) {
  return String(value == null ? "" : value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function validDay(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

function validTime(value) {
  return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(String(value || ""));
}

/** "pdf", "png" or "jpg" from the file's first bytes, else null. */
function sniffFile(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf.slice(0, 4).toString("latin1") === "%PDF") return "pdf";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
  return null;
}

/** Document id for the trip request, so sending the same order twice never makes two. */
function requestDocId(kind, externalId) {
  return "guias_" + kind + "_" + String(externalId).replace(/[^A-Za-z0-9_-]/g, "_");
}

/** { ok: true, value } with the payload cleaned, or { ok: false, error }. */
function validateGuiasPayload(body) {
  const src = body && typeof body === "object" ? body : {};
  const externalId = clean(src.externalId, 100);
  if (!/^[A-Za-z0-9._:-]{1,100}$/.test(externalId)) return { ok: false, error: "externalId is required." };
  const kind = String(src.kind || "");
  if (kind !== "pickup" && kind !== "delivery") return { ok: false, error: 'kind must be "pickup" or "delivery".' };

  const clientName = clean(src.clientName, 120);
  const clientEmail = clean(src.clientEmail, 200).toLowerCase();
  if (!clientName && !clientEmail) return { ok: false, error: "clientName or clientEmail is required." };

  const from = clean(src.from, 200);
  const to = clean(src.to, 200);
  if (!from || !to) return { ok: false, error: "from and to are required." };

  const tripDate = clean(src.tripDate, 10);
  if (tripDate && !validDay(tripDate)) return { ok: false, error: "tripDate must be YYYY-MM-DD." };
  const pickupTime = clean(src.pickupTime, 5);
  if (pickupTime && !validTime(pickupTime)) return { ok: false, error: "pickupTime must be HH:mm." };

  const rawLines = Array.isArray(src.awbLines) ? src.awbLines : [];
  if (rawLines.length < 1 || rawLines.length > MAX_LINES) {
    return { ok: false, error: "awbLines needs between 1 and " + MAX_LINES + " lines." };
  }
  const awbLines = [];
  for (const raw of rawLines) {
    const line = raw && typeof raw === "object" ? raw : {};
    const awbNumber = clean(line.awbNumber, 40);
    if (!awbNumber) return { ok: false, error: "Every AWB line needs an awbNumber." };
    const type = ULD_TYPES.includes(line.type) ? line.type : "Loose";
    const hazmat = line.hazmat === true;
    const documents = [];
    for (const doc of Array.isArray(line.documents) ? line.documents.slice(0, 6) : []) {
      if (!doc || !SLOTS.includes(doc.slot)) continue;
      const contentBase64 = typeof doc.contentBase64 === "string" ? doc.contentBase64 : "";
      if (!contentBase64) continue;
      if (contentBase64.length > MAX_DOC_CHARS) return { ok: false, error: "A document is too large (6 MB at most)." };
      documents.push({ slot: doc.slot, name: clean(doc.name, 120) || "document", contentBase64 });
    }
    awbLines.push({
      awbNumber,
      type,
      qtyPieces: Math.max(0, Math.min(9999, Math.round(Number(line.qtyPieces) || 0))),
      kilograms: Math.max(0, Math.min(1000000, Number(line.kilograms) || 0)),
      hazmat,
      unNumber: hazmat ? clean(line.unNumber, 20) : "",
      hazmatClass: hazmat ? clean(line.hazmatClass, 20) : "",
      documents,
    });
  }

  return {
    ok: true,
    value: {
      externalId,
      kind,
      clientName,
      clientEmail,
      from,
      to,
      tripDate,
      pickupTime,
      personRequesting: clean(src.personRequesting, 120) || "ACK Guías",
      notes: cleanMultiline(src.notes, 2000),
      awbLines,
    },
  };
}

/**
 * Which ACK Freight customer a Guías client is: the account with that email, else the
 * one with that name (case, spaces and dashes ignored). Never guesses between two.
 * customers: [{ id, data }] of users whose role is customer.
 */
function matchCustomer(customers, { email, name }) {
  const wantedEmail = String(email || "").trim().toLowerCase();
  if (wantedEmail) {
    const byEmail = customers.filter((c) => String((c.data && c.data.email) || "").trim().toLowerCase() === wantedEmail);
    if (byEmail.length === 1) return { ok: true, customer: byEmail[0] };
    if (byEmail.length > 1) return { ok: false, reason: "more than one customer uses that email" };
  }
  const wantedName = normalizeName(name);
  if (wantedName) {
    const byName = customers.filter((c) => normalizeName(c.data && c.data.name) === wantedName);
    if (byName.length === 1) return { ok: true, customer: byName[0] };
    if (byName.length > 1) return { ok: false, reason: "more than one customer has that name" };
  }
  return { ok: false, reason: "no customer matches" };
}

module.exports = {
  ULD_TYPES,
  clean,
  normalizeName,
  validDay,
  validTime,
  sniffFile,
  requestDocId,
  validateGuiasPayload,
  matchCustomer,
};
