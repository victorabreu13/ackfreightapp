// Admin edits to a submitted trip request's date, pick up time, From and To.
// Pure helpers (no Firebase) so they can be unit tested.

const FIELDS = [
  { key: "tripDate", label: "Date" },
  { key: "pickupTime", label: "Pick up time" },
  { key: "from", label: "From" },
  { key: "to", label: "To" },
];

function to12h(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
  if (!m) return String(hhmm || "");
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
}

/** Returns { ok: true, values } with cleaned values, or { ok: false, message }. */
function validateTripDetails(input) {
  const tripDate = String((input && input.tripDate) || "").trim();
  const pickupTime = String((input && input.pickupTime) || "").trim();
  const from = String((input && input.from) || "").trim().replace(/\s+/g, " ");
  const to = String((input && input.to) || "").trim().replace(/\s+/g, " ");
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tripDate);
  if (!dm) return { ok: false, message: "Enter a valid date." };
  const d = new Date(Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3])));
  if (d.getUTCFullYear() !== Number(dm[1]) || d.getUTCMonth() !== Number(dm[2]) - 1 || d.getUTCDate() !== Number(dm[3])) {
    return { ok: false, message: "Enter a valid date." };
  }
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(pickupTime)) {
    return { ok: false, message: "Enter a valid pick up time." };
  }
  if (!from || !to) return { ok: false, message: "Enter both the From and To locations." };
  if (from.length > 120 || to.length > 120) return { ok: false, message: "From and To must be under 120 characters." };
  return { ok: true, values: { tripDate, pickupTime, from, to } };
}

/** What changed between the stored request and the new values: [{ field, from, to }]. */
function diffTripDetails(current, next) {
  const out = [];
  for (const { key, label } of FIELDS) {
    const before = String((current && current[key]) || "");
    const after = String(next[key] || "");
    if (before === after) continue;
    out.push({
      field: label,
      from: key === "pickupTime" ? to12h(before) : before,
      to: key === "pickupTime" ? to12h(after) : after,
    });
  }
  return out;
}

module.exports = { FIELDS, to12h, validateTripDetails, diffTripDetails };
