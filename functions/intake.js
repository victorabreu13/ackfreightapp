const crypto = require("crypto");

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 8;

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Shared secret (Wix backend) or a verified reCAPTCHA token. Fail closed
// when neither check is configured.
function intakeAuthorized({ providedSecret, expectedSecret, recaptchaConfigured, recaptchaPassed }) {
  if (expectedSecret && safeEqual(providedSecret, expectedSecret)) return true;
  if (recaptchaConfigured && recaptchaPassed) return true;
  return false;
}

function rateLimitDecision(timestamps, now, limit = MAX_PER_WINDOW, windowMs = WINDOW_MS) {
  const recent = (timestamps || []).filter((stamp) => typeof stamp === "number" && now - stamp < windowMs);
  if (recent.length >= limit) return { allowed: false, timestamps: recent };
  return { allowed: true, timestamps: [...recent, now] };
}

function cleanText(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

function validateIntakePayload(body) {
  const source = body && typeof body === "object" ? body : {};
  const contactName = cleanText(source.contactName, 120);
  const email = cleanText(source.email, 200).toLowerCase();
  const phone = cleanText(source.phone, 40);
  const from = cleanText(source.from, 200);
  const to = cleanText(source.to, 200);
  const tripDate = cleanText(source.tripDate, 20);
  const pickupTime = cleanText(source.pickupTime, 10);
  const notes = cleanText(source.notes, 2000);
  const awbNumber = cleanText(source.awbNumber, 40);
  const type = cleanText(source.type, 20) || "Loose";
  const qtyPieces = Math.max(0, Math.min(9999, parseInt(source.qtyPieces, 10) || 0));
  const kilograms = Math.max(0, Math.min(1000000, Number(source.kilograms) || 0));
  const lengthIn = source.lengthIn == null || source.lengthIn === "" ? null : Number(source.lengthIn);
  const widthIn = source.widthIn == null || source.widthIn === "" ? null : Number(source.widthIn);
  const heightIn = source.heightIn == null || source.heightIn === "" ? null : Number(source.heightIn);
  const hazmat = source.hazmat === true || source.hazmat === "true" || source.hazmat === "yes";
  const unNumber = cleanText(source.unNumber, 20);
  const hazmatClass = cleanText(source.hazmatClass, 20);

  const missing = [];
  if (!contactName) missing.push("contactName");
  if (!email || !email.includes("@")) missing.push("email");
  if (!from) missing.push("from");
  if (!to) missing.push("to");
  if (missing.length) return { ok: false, missing };

  return {
    ok: true,
    lead: {
      contactName,
      email,
      phone,
      from,
      to,
      tripDate,
      pickupTime,
      notes,
      awbNumber,
      type,
      qtyPieces,
      kilograms,
      lengthIn: Number.isFinite(lengthIn) ? lengthIn : null,
      widthIn: Number.isFinite(widthIn) ? widthIn : null,
      heightIn: Number.isFinite(heightIn) ? heightIn : null,
      hazmat,
      unNumber: hazmat ? unNumber : "",
      hazmatClass: hazmat ? hazmatClass : "",
      status: "pending",
      source: "website",
    },
  };
}

module.exports = {
  WINDOW_MS,
  MAX_PER_WINDOW,
  intakeAuthorized,
  rateLimitDecision,
  validateIntakePayload,
};
