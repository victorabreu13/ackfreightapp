const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

const GMAIL_USER = defineSecret("GMAIL_USER");
const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");

// Change this if the fleet operates in a different timezone. This controls
// both what "today" means for picking up trips, and when the job fires
// (11:59 PM in this timezone).
const TIME_ZONE = "America/New_York";

function todayDateString() {
  // en-CA locale formats as YYYY-MM-DD, matching the app's trip.date field.
  return new Date().toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function buildSummaryHtml(dateStr, trips) {
  if (trips.length === 0) {
    return `<p>No trips were logged on ${escapeHtml(dateStr)}.</p>`;
  }

  const byDriver = new Map();
  for (const trip of trips) {
    const key = trip.driverName || trip.driverEmail || "Unknown driver";
    if (!byDriver.has(key)) byDriver.set(key, []);
    byDriver.get(key).push(trip);
  }

  let html = `<h2>ACK Freight — Daily Trip Log for ${escapeHtml(dateStr)}</h2>`;
  html += `<p>${trips.length} trip(s) logged by ${byDriver.size} driver(s).</p>`;

  for (const [driverName, driverTrips] of byDriver) {
    driverTrips.sort((a, b) => (a.timeStart || "").localeCompare(b.timeStart || ""));
    html += `<h3>${escapeHtml(driverName)} (${driverTrips.length} trip${driverTrips.length === 1 ? "" : "s"})</h3>`;
    html +=
      '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:13px;">';
    html +=
      "<tr style=\"background:#f0f0f0;\"><th>Time</th><th>Route</th><th>AWB / Doc #</th><th>QTY</th><th>Proof Files</th></tr>";
    for (const t of driverTrips) {
      const units = (t.unitTypes || []).map((type, i) => {
        const uld = t.uldNumbers && t.uldNumbers[i];
        return uld ? `${type} #${uld}` : type;
      });
      const qtyText = units.length ? `${t.qty}: ${units.join(", ")}` : "-";
      html += `<tr>
        <td>${escapeHtml(t.timeStart)} – ${escapeHtml(t.timeFinish)}</td>
        <td>${escapeHtml(t.from)} → ${escapeHtml(t.to)}</td>
        <td>${escapeHtml(t.awbNumber)}</td>
        <td>${escapeHtml(qtyText)}</td>
        <td>${(t.proofFiles || []).length}</td>
      </tr>`;
    }
    html += "</table>";
  }

  return html;
}

async function sendDailySummary() {
  const db = admin.firestore();
  const dateStr = todayDateString();

  const tripsSnap = await db.collection("trips").where("date", "==", dateStr).get();
  const trips = tripsSnap.docs.map((d) => d.data());

  const adminsSnap = await db.collection("users").where("role", "==", "admin").get();
  const adminEmails = adminsSnap.docs.map((d) => d.data().email).filter(Boolean);

  if (adminEmails.length === 0) {
    logger.warn("No admin emails found in users collection; skipping send.");
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: GMAIL_USER.value(),
      pass: GMAIL_APP_PASSWORD.value(),
    },
  });

  await transporter.sendMail({
    from: `"ACK Freight" <${GMAIL_USER.value()}>`,
    to: adminEmails.join(","),
    subject: `ACK Freight — Daily Trip Log (${dateStr})`,
    html: buildSummaryHtml(dateStr, trips),
  });

  logger.info(`Sent daily summary for ${dateStr} to ${adminEmails.join(", ")} (${trips.length} trips).`);
}

function normalize(value) {
  return String(value ?? "").trim().toUpperCase();
}

// Drivers can only read their own trips under the Firestore security rules,
// so checking for a duplicate ULD#/AWB# combo across *every* driver's trips
// has to happen server-side, with admin privileges, instead of a client
// query. Called from the app right before a new trip is submitted.
exports.checkDuplicateUld = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }

  const { awbNumber, uldNumbers } = request.data || {};
  if (!awbNumber || !Array.isArray(uldNumbers) || uldNumbers.length === 0) {
    throw new HttpsError(
      "invalid-argument",
      "awbNumber and uldNumbers are required."
    );
  }

  const targetAwb = normalize(awbNumber);
  const targetUlds = uldNumbers.map(normalize);

  const db = admin.firestore();
  const snap = await db.collection("trips").get();

  for (const doc of snap.docs) {
    const data = doc.data();
    if (normalize(data.awbNumber) !== targetAwb) continue;
    const existingUlds = (data.uldNumbers || []).map(normalize);
    for (const uld of targetUlds) {
      if (uld && existingUlds.includes(uld)) {
        return {
          duplicate: true,
          uldNumber: uld,
          conflictingDriverName: data.driverName || "another driver",
          conflictingDate: data.date || "",
        };
      }
    }
  }

  return { duplicate: false };
});

exports.sendDailyTripSummary = onSchedule(
  {
    schedule: "59 23 * * *",
    timeZone: TIME_ZONE,
    secrets: [GMAIL_USER, GMAIL_APP_PASSWORD],
  },
  async () => {
    await sendDailySummary();
  }
);
