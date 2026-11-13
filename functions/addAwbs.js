// Adding AWBs to a trip request that was already submitted (admin, or the customer
// who owns it). Pure, so unit tests can require it alone.

const { awbKey, computeRollup } = require("./awbLogic");

const ULD_TYPES = ["Loose", "Skid", "PMC", "FQA", "PAG", "DQF", "ALF", "AKE"];
const MAX_NEW_LINES = 20;

function text(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

// What the caller typed, checked and cleaned. A refusal names the AWB it is about.
function cleanNewLines(input, max = MAX_NEW_LINES) {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, message: "Add at least one AWB." };
  }
  if (input.length > max) {
    return { ok: false, message: `Add at most ${max} AWBs at a time.` };
  }
  const lines = [];
  const seen = new Set();
  for (const raw of input) {
    const awbNumber = text(raw && raw.awbNumber, 40);
    const key = awbKey(awbNumber);
    if (!key) return { ok: false, message: "Every AWB needs its number." };
    if (seen.has(key)) return { ok: false, message: `AWB ${awbNumber} is listed twice.` };
    seen.add(key);
    const qtyPieces = Number(raw.qtyPieces);
    if (!Number.isInteger(qtyPieces) || qtyPieces < 1 || qtyPieces > 9999) {
      return { ok: false, message: `AWB ${awbNumber}: enter the number of pieces (1 or more).` };
    }
    const kilograms = Number(raw.kilograms);
    if (!Number.isFinite(kilograms) || kilograms <= 0 || kilograms > 100000) {
      return { ok: false, message: `AWB ${awbNumber}: enter the weight in kilograms.` };
    }
    const type = ULD_TYPES.includes(raw.type) ? raw.type : "Loose";
    const hazmat = raw.hazmat === true;
    lines.push({
      awbNumber,
      qtyPieces,
      type,
      kilograms,
      hazmat,
      unNumber: hazmat ? text(raw.unNumber, 20) || null : null,
    });
  }
  return { ok: true, lines };
}

// The request's one driver, if exactly one is on it; new AWBs go to that driver
// unless dispatch picks someone else (or nobody).
function defaultDriver(awbLines) {
  const drivers = new Map();
  for (const l of awbLines || []) {
    if (l.assignedDriverId) drivers.set(l.assignedDriverId, l.assignedDriverName || "");
  }
  if (drivers.size !== 1) return null;
  const [[id, name]] = [...drivers];
  return { id, name };
}

// AWBs of this request already (same number in different spelling counts).
function sameRequestDuplicates(awbLines, newLines) {
  const have = new Set((awbLines || []).map((l) => awbKey(l.awbNumber)));
  return newLines.filter((l) => have.has(awbKey(l.awbNumber))).map((l) => l.awbNumber);
}

function planAddLines(awbLines, newLines, driver) {
  const added = newLines.map((l) => ({
    awbNumber: l.awbNumber,
    qtyPieces: l.qtyPieces,
    type: l.type,
    kilograms: l.kilograms,
    lengthIn: null,
    widthIn: null,
    heightIn: null,
    hazmat: l.hazmat,
    unNumber: l.unNumber,
    awbFile: null,
    loaFile: null,
    doFile: null,
    assignedDriverId: driver ? driver.id : null,
    assignedDriverName: driver ? driver.name : null,
    status: driver ? "assigned" : "submitted",
    priority: "Normal",
  }));
  const nextLines = [...(awbLines || []), ...added];
  return { awbLines: nextLines, firstNewIndex: (awbLines || []).length, ...computeRollup(nextLines) };
}

// Who may add: dispatch always (unless cancelled); the owning customer until the
// trip is completed.
function canAdd(request, role, uid) {
  if (!request) return { ok: false, message: "Trip request not found." };
  if (request.status === "cancelled") return { ok: false, message: "This trip request was cancelled." };
  if (request.status === "invoiced") return { ok: false, message: "This trip was already invoiced. Create a new trip request for more AWBs." };
  if (role === "admin") return { ok: true };
  if (role === "customer" && request.customerId === uid) {
    if (request.status === "completed") {
      return { ok: false, message: "This trip is already completed. Submit a new trip request for more AWBs." };
    }
    return { ok: true };
  }
  return { ok: false, message: "You can't add AWBs to this trip request." };
}

module.exports = { cleanNewLines, defaultDriver, sameRequestDuplicates, planAddLines, canAdd, MAX_NEW_LINES };
