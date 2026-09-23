const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const {
  onDocumentCreated,
  onDocumentUpdated,
} = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

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

function buildTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: GMAIL_USER.value(),
      pass: GMAIL_APP_PASSWORD.value(),
    },
  });
}

function buildDeletionEmailHtml(trip, deletedBy) {
  const units = (trip.unitTypes || []).map((type, i) => {
    const uld = trip.uldNumbers && trip.uldNumbers[i];
    return uld ? `${type} #${uld}` : type;
  });
  return `
    <h2>ACK Freight — Trip Deleted</h2>
    <p><strong>${escapeHtml(deletedBy.name)}</strong> (${escapeHtml(deletedBy.role)}, ${escapeHtml(
    deletedBy.email
  )}) deleted a trip.</p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:13px;">
      <tr><th align="left">Driver</th><td>${escapeHtml(trip.driverName)} (${escapeHtml(trip.driverEmail)})</td></tr>
      <tr><th align="left">Date</th><td>${escapeHtml(trip.date)}</td></tr>
      <tr><th align="left">Time</th><td>${escapeHtml(trip.timeStart)} – ${escapeHtml(trip.timeFinish)}</td></tr>
      <tr><th align="left">Route</th><td>${escapeHtml(trip.from)} → ${escapeHtml(trip.to)}</td></tr>
      <tr><th align="left">AWB / Doc #</th><td>${escapeHtml(trip.awbNumber)}</td></tr>
      <tr><th align="left">QTY</th><td>${escapeHtml(units.join(", ") || "-")}</td></tr>
      <tr><th align="left">Deleted at</th><td>${escapeHtml(
        new Date().toLocaleString("en-US", { timeZone: TIME_ZONE })
      )}</td></tr>
    </table>
  `;
}

// Best-effort push via Expo's push API — no SDK dependency needed since
// Node 20 has a global fetch. Failures are logged, never thrown: a missing
// or stale push token should never block the email that goes out alongside it.
async function sendExpoPush(tokens, title, body, data) {
  const validTokens = [...new Set((tokens || []).filter(Boolean))];
  if (validTokens.length === 0) {
    logger.info("sendExpoPush: no push tokens to send to, skipping.", { title });
    return;
  }
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(
        validTokens.map((to) => ({ to, title, body, data, sound: "default" }))
      ),
    });
    const responseBody = await res.text();
    logger.info("sendExpoPush: Expo push API response", {
      title,
      tokenCount: validTokens.length,
      status: res.status,
      responseBody,
    });
  } catch (err) {
    logger.error("Failed to send push notification:", err);
  }
}

function docLink(file, label) {
  if (!file || !file.url) return "";
  return `<a href="${file.url}">${escapeHtml(label)}</a>`;
}

function buildTripRequestEmailHtml(heading, intro, req) {
  const awbRows = (req.awbLines || [])
    .map((l) => {
      const docs =
        [
          docLink(l.awbFile, "AWB doc"),
          docLink(l.loaFile, "Letter of Auth."),
          docLink(l.doFile, "Delivery Order"),
        ]
          .filter(Boolean)
          .join(" &middot; ") || "—";
      return `<tr>
        <td>${escapeHtml(l.awbNumber)}</td>
        <td>${escapeHtml(l.type)}</td>
        <td>${escapeHtml(String(l.qtyPieces))}</td>
        <td>${escapeHtml(String(l.kilograms))} kg</td>
        <td>${docs}</td>
      </tr>`;
    })
    .join("");

  const importFeeLinks =
    (req.importFeeFiles || [])
      .map((f, i) => docLink(f, `File ${i + 1}`))
      .filter(Boolean)
      .join(" &middot; ") || "None";

  return `
    <h2>${escapeHtml(heading)}</h2>
    <p>${intro}</p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:13px;">
      <tr><th align="left">Customer</th><td>${escapeHtml(req.customerName)} (${escapeHtml(req.customerEmail)})</td></tr>
      <tr><th align="left">Trip date</th><td>${escapeHtml(req.tripDate)}</td></tr>
      <tr><th align="left">Route</th><td>${escapeHtml(req.from)} → ${escapeHtml(req.to)}</td></tr>
      <tr><th align="left">Person requesting</th><td>${escapeHtml(req.personRequesting)}</td></tr>
      <tr><th align="left">Assigned driver(s)</th><td>${escapeHtml(
        (req.assignedDriverNames || []).join(", ") || "Not assigned yet"
      )}</td></tr>
      <tr><th align="left">Import Fee / 1F</th><td>${importFeeLinks}</td></tr>
    </table>
    <h3>AWBs</h3>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:13px;">
      <tr style="background:#f0f0f0;"><th>AWB #</th><th>Type</th><th>Pieces</th><th>Weight</th><th>Documents</th></tr>
      ${awbRows}
    </table>
  `;
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

  const transporter = buildTransporter();

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
exports.checkDuplicateUld = onCall({ invoker: "public" }, async (request) => {
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

// Trips are immutable via direct Firestore writes (see firestore.rules) — the
// only way to remove one is through this function, so every deletion is
// permission-checked, snapshotted to `deletedTrips` for an audit trail, and
// emailed to admins immediately.
exports.deleteTrip = onCall(
  { secrets: [GMAIL_USER, GMAIL_APP_PASSWORD], invoker: "public" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }

    const { tripId } = request.data || {};
    if (!tripId) {
      throw new HttpsError("invalid-argument", "tripId is required.");
    }

    const db = admin.firestore();
    const tripRef = db.collection("trips").doc(tripId);
    const tripSnap = await tripRef.get();
    if (!tripSnap.exists) {
      throw new HttpsError("not-found", "Trip not found.");
    }
    const trip = tripSnap.data();

    const callerSnap = await db.collection("users").doc(request.auth.uid).get();
    const callerProfile = callerSnap.exists ? callerSnap.data() : null;
    const isAdmin = callerProfile?.role === "admin";
    const isOwner = trip.driverId === request.auth.uid;

    if (!isAdmin && !isOwner) {
      throw new HttpsError(
        "permission-denied",
        "You can only delete your own trips."
      );
    }

    const deletedBy = {
      uid: request.auth.uid,
      name: callerProfile?.name || request.auth.token.email || "Unknown",
      email: callerProfile?.email || request.auth.token.email || "",
      role: callerProfile?.role || "driver",
    };

    await db.collection("deletedTrips").add({
      trip,
      tripId,
      deletedBy,
      deletedAt: Date.now(),
    });

    await tripRef.delete();

    try {
      const adminsSnap = await db.collection("users").where("role", "==", "admin").get();
      const adminEmails = adminsSnap.docs.map((d) => d.data().email).filter(Boolean);
      if (adminEmails.length > 0) {
        const transporter = buildTransporter();
        await transporter.sendMail({
          from: `"ACK Freight" <${GMAIL_USER.value()}>`,
          to: adminEmails.join(","),
          subject: `ACK Freight — Trip Deleted (${trip.awbNumber || "no AWB"})`,
          html: buildDeletionEmailHtml(trip, deletedBy),
        });
      }
    } catch (err) {
      logger.error("Failed to send trip-deletion email:", err);
    }

    return { success: true };
  }
);

// Fires the moment a customer (or admin, on their behalf) submits a trip
// request. Immediate, unlike sendDailyTripSummary which only covers trips
// already logged by end of day.
exports.onTripRequestCreated = onDocumentCreated(
  { document: "tripRequests/{requestId}", secrets: [GMAIL_USER, GMAIL_APP_PASSWORD] },
  async (event) => {
    const req = event.data?.data();
    if (!req) return;

    const db = admin.firestore();
    const adminsSnap = await db.collection("users").where("role", "==", "admin").get();
    const adminEmails = adminsSnap.docs.map((d) => d.data().email).filter(Boolean);
    const adminPushTokens = adminsSnap.docs.map((d) => d.data().pushToken).filter(Boolean);

    if (adminEmails.length > 0) {
      try {
        const transporter = buildTransporter();
        await transporter.sendMail({
          from: `"ACK Freight" <${GMAIL_USER.value()}>`,
          to: adminEmails.join(","),
          subject: `ACK Freight — New Trip Request (${req.customerName})`,
          html: buildTripRequestEmailHtml(
            "New Trip Request",
            `${escapeHtml(req.customerName)} submitted a new trip request.`,
            req
          ),
        });
      } catch (err) {
        logger.error("Failed to send new-trip-request email:", err);
      }
    }

    await sendExpoPush(
      adminPushTokens,
      "New Trip Request",
      `${req.customerName}: ${req.from} → ${req.to}`,
      { type: "tripRequestCreated", requestId: event.params.requestId }
    );
  }
);

// Fires whenever assignedDriverIds gains a new entry — covers Dispatch
// assigning for the first time and reassigning/adding a second driver alike.
exports.onTripRequestAssigned = onDocumentUpdated(
  { document: "tripRequests/{requestId}", secrets: [GMAIL_USER, GMAIL_APP_PASSWORD] },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;

    const beforeIds = new Set(before.assignedDriverIds || []);
    const newDriverIds = (after.assignedDriverIds || []).filter((id) => !beforeIds.has(id));
    if (newDriverIds.length === 0) return;

    const db = admin.firestore();
    const driverDocs = await Promise.all(
      newDriverIds.map((id) => db.collection("users").doc(id).get())
    );
    const driverEmails = driverDocs.map((d) => d.data()?.email).filter(Boolean);
    const driverPushTokens = driverDocs.map((d) => d.data()?.pushToken).filter(Boolean);

    if (driverEmails.length > 0) {
      try {
        const transporter = buildTransporter();
        await transporter.sendMail({
          from: `"ACK Freight" <${GMAIL_USER.value()}>`,
          to: driverEmails.join(","),
          subject: `ACK Freight — Trip Assigned to You (${after.tripDate})`,
          html: buildTripRequestEmailHtml(
            "Trip Assigned to You",
            "You've been assigned a new trip. Details below.",
            after
          ),
        });
      } catch (err) {
        logger.error("Failed to send trip-assigned email:", err);
      }
    }

    await sendExpoPush(
      driverPushTokens,
      "New Trip Assigned",
      `${after.from} → ${after.to} on ${after.tripDate}`,
      { type: "tripRequestAssigned", requestId: event.params.requestId }
    );
  }
);

// Fires when a trip request's status flips to "completed" (set by the
// assigned driver from their app) — admins and the customer both want to
// know right away, separate from the daily summary and from the driver's
// own assignment email above.
exports.onTripRequestStatusEmails = onDocumentUpdated(
  { document: "tripRequests/{requestId}", secrets: [GMAIL_USER, GMAIL_APP_PASSWORD] },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    if (before.status === "completed" || after.status !== "completed") return;

    const db = admin.firestore();
    const adminsSnap = await db.collection("users").where("role", "==", "admin").get();
    const recipients = adminsSnap.docs.map((d) => d.data().email).filter(Boolean);
    if (after.customerEmail) recipients.push(after.customerEmail);
    if (recipients.length === 0) return;

    try {
      const transporter = buildTransporter();
      await transporter.sendMail({
        from: `"ACK Freight" <${GMAIL_USER.value()}>`,
        to: recipients.join(","),
        subject: `ACK Freight — Trip Completed (${after.tripDate})`,
        html: buildTripRequestEmailHtml(
          "Trip Completed",
          "This trip has been marked completed.",
          after
        ),
      });
    } catch (err) {
      logger.error("Failed to send trip-completed email:", err);
    }
  }
);

// Admin-only: creates a real, login-capable customer account (e.g. for a
// phone-in order) without the admin ever seeing or setting the password —
// a random one is generated here, and the client follows up with Firebase
// Auth's own sendPasswordResetEmail so the customer sets their own.
exports.createCustomer = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }

  const db = admin.firestore();
  const callerSnap = await db.collection("users").doc(request.auth.uid).get();
  if (callerSnap.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Admins only.");
  }

  const { name, email } = request.data || {};
  if (!name || !email) {
    throw new HttpsError("invalid-argument", "name and email are required.");
  }

  const userRecord = await admin.auth().createUser({
    email,
    password: crypto.randomBytes(18).toString("base64"),
    displayName: name,
  });

  await db.collection("users").doc(userRecord.uid).set({
    uid: userRecord.uid,
    email,
    name,
    role: "customer",
    createdAt: Date.now(),
  });

  return { uid: userRecord.uid };
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
