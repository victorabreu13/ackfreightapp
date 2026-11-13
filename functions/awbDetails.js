// Dispatch fixes an AWB's pieces, kilograms or ULD type after submit, and brings a
// cancelled trip request back. Pure, so unit tests can require it alone.

const { computeRollup } = require("./awbLogic");
const { uldCountForLines } = require("./quote");

const ULD_TYPES = ["Loose", "Skid", "PMC", "FQA", "PAG", "DQF", "ALF", "AKE"];

// What was typed, checked. Only the fields that came in are changed.
function cleanDetailChanges(input) {
  const c = input || {};
  const out = {};
  if (c.qtyPieces !== undefined && c.qtyPieces !== null) {
    const pieces = Number(c.qtyPieces);
    if (!Number.isInteger(pieces) || pieces < 1 || pieces > 9999) {
      return { ok: false, message: "Enter the number of pieces (1 or more)." };
    }
    out.qtyPieces = pieces;
  }
  if (c.kilograms !== undefined && c.kilograms !== null) {
    const kg = Number(c.kilograms);
    if (!Number.isFinite(kg) || kg <= 0 || kg > 100000) {
      return { ok: false, message: "Enter the weight in kilograms (more than 0)." };
    }
    out.kilograms = Math.round(kg * 100) / 100;
  }
  if (c.type !== undefined && c.type !== null) {
    if (!ULD_TYPES.includes(c.type)) return { ok: false, message: "Pick a ULD type from the list." };
    out.type = c.type;
  }
  if (Object.keys(out).length === 0) return { ok: false, message: "Nothing to change." };
  return { ok: true, changes: out };
}

// The line with the changes, and how much its kilograms and ULD count moved (a trip
// log already made for a completed line follows by those differences).
function planUpdateAwbDetails(awbLines, awbIndex, changes) {
  const lines = awbLines || [];
  const line = lines[awbIndex];
  if (!line) return { ok: false, message: "That AWB isn't on this trip request." };
  const next = { ...line, ...changes };
  const same = ["qtyPieces", "kilograms", "type"].every((k) => next[k] === line[k]);
  if (same) return { ok: false, message: "Nothing changed." };
  const nextLines = lines.map((l, i) => (i === awbIndex ? next : l));
  return {
    ok: true,
    awbLines: nextLines,
    line: next,
    kgDelta: Math.round(((Number(next.kilograms) || 0) - (Number(line.kilograms) || 0)) * 100) / 100,
    uldDelta: uldCountForLines([next]) - uldCountForLines([line]),
  };
}

// The same differences applied to the trip log of a completed line. A trip already
// paid out can't change if the amounts it is paid from would.
function planTripLogFollow(trip, kgDelta, uldDelta) {
  if (!trip) return { ok: true, update: null };
  if (kgDelta === 0 && uldDelta === 0) return { ok: true, update: null };
  if (trip.paid === true) {
    return {
      ok: false,
      message: `This trip was already paid to ${trip.driverName || "the driver"}. Mark it unpaid in Payroll first, then change the kilograms or ULDs.`,
    };
  }
  const update = {};
  if (kgDelta !== 0) update.kilograms = Math.max(0, Math.round(((Number(trip.kilograms) || 0) + kgDelta) * 100) / 100);
  if (uldDelta !== 0 && typeof trip.uldCount === "number") update.uldCount = Math.max(0, trip.uldCount + uldDelta);
  return { ok: true, update: Object.keys(update).length > 0 ? update : null };
}

// Bringing a cancelled trip request back: its status is worked out again from its AWBs.
function planReopen(request) {
  if (!request) return { ok: false, message: "Trip request not found." };
  if (request.status !== "cancelled") return { ok: false, message: "This trip request isn't cancelled." };
  const lines = request.awbLines || [];
  if (lines.length === 0) return { ok: false, message: "This trip request has no AWBs." };
  return { ok: true, ...computeRollup(lines) };
}

module.exports = { cleanDetailChanges, planUpdateAwbDetails, planTripLogFollow, planReopen };
