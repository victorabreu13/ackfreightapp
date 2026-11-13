// Reading an Air Waybill (AWB) with Claude: the number, the total pieces and the
// total gross weight, to fill PCS and KG in the bulk upload. The model call lives in
// index.js; this file holds what is asked, what comes back, and the checks on it, so
// tests can require it alone.

const MODEL = "claude-opus-5-5";
const LB_PER_KG = 2.20462;

const PROMPT = [
  "This document is an Air Waybill (AWB). Read it and return:",
  "- awbNumber: the AWB number printed at the top (airline prefix of 3 digits, a dash, then 8 digits, like 045-54066773).",
  "- pieces: the TOTAL number of pieces for the whole shipment (\"No. of Pieces RCP\"; when there are several lines, the total at the bottom).",
  "- grossWeight: the TOTAL gross weight of the whole shipment, as a number (when there are several lines, the total at the bottom).",
  "- weightUnit: \"K\" when that weight is in kilograms, \"L\" when it is in pounds (the K/L column next to the weight).",
  "Use null for anything you cannot read clearly. Never guess a number.",
].join("\n");

const SCHEMA = {
  type: "object",
  properties: {
    awbNumber: { anyOf: [{ type: "string" }, { type: "null" }] },
    pieces: { anyOf: [{ type: "integer" }, { type: "null" }] },
    grossWeight: { anyOf: [{ type: "number" }, { type: "null" }] },
    weightUnit: { anyOf: [{ type: "string", enum: ["K", "L"] }, { type: "null" }] },
  },
  required: ["awbNumber", "pieces", "grossWeight", "weightUnit"],
  additionalProperties: false,
};

// What the app uses: pieces and kilograms (pounds converted), or null where unread.
function normalizeExtraction(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const pieces = Number.isInteger(r.pieces) && r.pieces >= 1 && r.pieces <= 9999 ? r.pieces : null;
  let kilograms = typeof r.grossWeight === "number" && Number.isFinite(r.grossWeight) && r.grossWeight > 0 ? r.grossWeight : null;
  if (kilograms !== null && r.weightUnit === "L") kilograms = kilograms / LB_PER_KG;
  if (kilograms !== null) kilograms = Math.round(kilograms * 10) / 10;
  if (kilograms !== null && kilograms > 100000) kilograms = null;
  const digits = String(r.awbNumber ?? "").replace(/\D/g, "");
  const awbNumber = digits.length === 11 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : null;
  return { awbNumber, pieces, kilograms };
}

// The text of the model's answer, parsed; null when it isn't JSON.
function parseAnswer(content) {
  const block = (content || []).find((b) => b && b.type === "text");
  if (!block) return null;
  try {
    return JSON.parse(block.text);
  } catch (err) {
    return null;
  }
}

// Daily allowance per person, so a stray script can't run up the bill.
const DAILY_LIMIT = 300;

function usageDocId(uid, day) {
  return `${uid}_${day}`;
}

module.exports = { MODEL, PROMPT, SCHEMA, DAILY_LIMIT, normalizeExtraction, parseAnswer, usageDocId };
