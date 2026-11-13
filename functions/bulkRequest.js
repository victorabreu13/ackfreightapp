// Bulk upload: one new trip request with many AWBs, each with its documents already
// uploaded to the customer's folder for this request. Pure, so tests can require it alone.

const { cleanNewLines } = require("./addAwbs");
const { validDay, validTime } = require("./guiasIntake");

const MAX_BULK_LINES = 100;

function text(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

// A document must be a file this customer uploaded for this very request, so a
// caller can't point a trip request at someone else's files.
function cleanFileRef(file, ctx) {
  if (file === null || file === undefined) return { ok: true, file: null };
  const url = text(file && file.url, 2000);
  const name = text(file && file.name, 200);
  const prefix = "https://firebasestorage.googleapis.com/v0/b/" + ctx.bucket + "/o/";
  if (!url.startsWith(prefix) || !name) return { ok: false };
  let path = "";
  try {
    path = decodeURIComponent(url.slice(prefix.length).split("?")[0]);
  } catch (err) {
    return { ok: false };
  }
  if (!path.startsWith("tripRequestDocs/" + ctx.customerId + "/" + ctx.requestId + "/")) return { ok: false };
  return { ok: true, file: { url, name } };
}

function cleanBulkRequest(body, ctx) {
  const b = body || {};
  if (!/^[A-Za-z0-9]{10,40}$/.test(String(b.requestId || ""))) {
    return { ok: false, message: "requestId is required." };
  }
  const from = text(b.from, 300);
  const to = text(b.to, 300);
  if (!from || !to) return { ok: false, message: "Enter both the From and To locations." };
  const personRequesting = text(b.personRequesting, 120);
  if (!personRequesting) return { ok: false, message: "Enter the name of the person requesting the trip." };
  if (!validDay(b.tripDate)) return { ok: false, message: "Pick the date of the trip." };
  const pickupTime = b.pickupTime ? String(b.pickupTime) : "";
  if (pickupTime && !validTime(pickupTime)) return { ok: false, message: "The pick up time isn't valid." };

  const cleaned = cleanNewLines(b.awbLines, MAX_BULK_LINES);
  if (!cleaned.ok) return cleaned;

  const fileCtx = { ...ctx, requestId: b.requestId };
  const awbLines = [];
  for (let i = 0; i < cleaned.lines.length; i++) {
    const line = cleaned.lines[i];
    const raw = b.awbLines[i] || {};
    const files = {};
    for (const [key, slot] of [
      ["awbFile", "awb"],
      ["loaFile", "loa"],
      ["doFile", "do"],
    ]) {
      const checked = cleanFileRef(raw[key], fileCtx);
      if (!checked.ok) {
        return { ok: false, message: `AWB ${line.awbNumber}: the ${slot.toUpperCase()} document isn't one uploaded for this request.` };
      }
      files[key] = checked.file;
    }
    awbLines.push({ ...line, ...files });
  }
  return {
    ok: true,
    value: {
      requestId: b.requestId,
      tripDate: b.tripDate,
      from,
      to,
      pickupTime: pickupTime || "08:00",
      personRequesting,
      notes: text(b.notes, 2000),
      awbLines,
    },
  };
}

// The stored request, shaped like the ones the app writes itself.
function bulkRequestDoc(value, customer, now) {
  return {
    customerId: customer.id,
    customerName: customer.name,
    customerEmail: customer.email,
    submittedAt: now,
    tripDate: value.tripDate,
    from: value.from,
    pickupTime: value.pickupTime,
    to: value.to,
    personRequesting: value.personRequesting,
    notes: value.notes,
    awbLines: value.awbLines.map((l) => ({
      awbNumber: l.awbNumber,
      qtyPieces: l.qtyPieces,
      type: l.type,
      kilograms: l.kilograms,
      lengthIn: null,
      widthIn: null,
      heightIn: null,
      hazmat: l.hazmat,
      unNumber: l.unNumber,
      hazmatClass: null,
      awbFile: l.awbFile,
      loaFile: l.loaFile,
      doFile: l.doFile,
      assignedDriverId: null,
      assignedDriverName: null,
      status: "submitted",
      priority: "Normal",
    })),
    importFeeFiles: [],
    assignedDriverIds: [],
    assignedDriverNames: [],
    status: "submitted",
    createdAt: now,
    updatedAt: now,
  };
}

module.exports = { cleanBulkRequest, bulkRequestDoc, MAX_BULK_LINES };
