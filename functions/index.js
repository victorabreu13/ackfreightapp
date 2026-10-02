const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const {
  onDocumentCreated,
  onDocumentDeleted,
  onDocumentUpdated,
} = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const {
  applyComplete,
  applyStart,
  driversGainingAwbLines,
} = require("./awbLogic");
const { proofsForRequest } = require("./proofs");
const {
  addTripUldKeys,
  commitTripIfUnique,
  findDuplicateUld,
  removeTripUldKeys,
} = require("./uldKeys");

admin.initializeApp();

// Excluded from all automated notification emails on request — the account
// still keeps its admin role and access, it just stops getting cc'd here.
const EXCLUDED_NOTIFICATION_EMAILS = new Set(["victor.abreu13@gmail.com"]);
function isNotificationEmail(email) {
  return !!email && !EXCLUDED_NOTIFICATION_EMAILS.has(String(email).toLowerCase());
}

const GMAIL_USER = defineSecret("GMAIL_USER");
const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");

// Switch back to "sandbox" any time to test again — the sandbox secrets
// (QB_CLIENT_ID/QB_CLIENT_SECRET) are untouched and still live in Secret
// Manager, separate from the production ones below.
const QB_ENVIRONMENT = "production";
const QB_CLIENT_ID = defineSecret(
  QB_ENVIRONMENT === "production" ? "QB_PROD_CLIENT_ID" : "QB_CLIENT_ID"
);
const QB_CLIENT_SECRET = defineSecret(
  QB_ENVIRONMENT === "production" ? "QB_PROD_CLIENT_SECRET" : "QB_CLIENT_SECRET"
);
const QB_API_BASE =
  QB_ENVIRONMENT === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";
const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QB_REDIRECT_URI =
  "https://us-central1-ack-freight.cloudfunctions.net/quickbooksOAuthCallback";

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
async function sendExpoPush(tokens, title, body, data, badge) {
  const validTokens = [...new Set((tokens || []).filter(Boolean))];
  if (validTokens.length === 0) {
    logger.info("sendExpoPush: no push tokens to send to, skipping.", { title });
    return;
  }
  try {
    const message = { title, body, data, sound: "default" };
    if (typeof badge === "number") message.badge = badge;
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(validTokens.map((to) => ({ to, ...message }))),
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

function buildTripRequestEmailHtml(heading, intro, req, onlyDriverId) {
  const lines = onlyDriverId
    ? (req.awbLines || []).filter((l) => l.assignedDriverId === onlyDriverId)
    : req.awbLines || [];
  const awbRows = lines
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
      ${req.pickupTime ? `<tr><th align="left">Pick up time</th><td>${escapeHtml(req.pickupTime)}</td></tr>` : ""}
      <tr><th align="left">Person requesting</th><td>${escapeHtml(req.personRequesting)}</td></tr>
      <tr><th align="left">Assigned driver(s)</th><td>${escapeHtml(
        onlyDriverId
          ? [...new Set(lines.map((l) => l.assignedDriverName).filter(Boolean))].join(", ") || "Not assigned yet"
          : (req.assignedDriverNames || []).join(", ") || "Not assigned yet"
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
  const adminEmails = adminsSnap.docs.map((d) => d.data().email).filter(isNotificationEmail);

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

// Duplicate AWB+ULD check. Reads claim documents only (tripUldKeys), never
// the trips collection, and does not return who already logged the number.
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

  return findDuplicateUld(admin.firestore(), awbNumber, uldNumbers);
});

// Writes the trip and its ULD claims in one transaction. Direct client
// creates are still allowed by the security rules for already-shipped
// builds; those are indexed by onTripCreatedIndexUldKeys.
exports.submitTripLog = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }

  const input = (request.data && request.data.trip) || {};
  if (input.driverId !== request.auth.uid) {
    throw new HttpsError("permission-denied", "You can only log your own trips.");
  }
  if (!input.awbNumber || !Array.isArray(input.uldNumbers)) {
    throw new HttpsError("invalid-argument", "awbNumber and uldNumbers are required.");
  }

  const db = admin.firestore();
  const tripId = db.collection("trips").doc().id;
  const trip = {
    driverId: request.auth.uid,
    driverName: String(input.driverName || ""),
    driverEmail: String(input.driverEmail || request.auth.token.email || ""),
    date: String(input.date || ""),
    timeStart: String(input.timeStart || ""),
    timeFinish: String(input.timeFinish || ""),
    from: String(input.from || ""),
    to: String(input.to || ""),
    qty: Number(input.qty) || 0,
    unitTypes: Array.isArray(input.unitTypes) ? input.unitTypes : [],
    uldNumbers: input.uldNumbers.map((value) => String(value ?? "")),
    awbNumber: String(input.awbNumber),
    kilograms: Number(input.kilograms) || 0,
    notes: String(input.notes || ""),
    proofFiles: Array.isArray(input.proofFiles) ? input.proofFiles : [],
    paid: false,
    createdAt: Date.now(),
  };

  const result = await commitTripIfUnique(db, tripId, trip);
  if (result.duplicate) {
    throw new HttpsError(
      "already-exists",
      `ULD #${result.uldNumber} is already logged under this AWB.`
    );
  }
  return { id: result.id };
});

exports.onTripCreatedIndexUldKeys = onDocumentCreated(
  { document: "trips/{tripId}" },
  async (event) => {
    const trip = event.data?.data();
    if (!trip) return;
    await addTripUldKeys(admin.firestore(), event.params.tripId, trip);
  }
);

exports.onTripDeletedIndexUldKeys = onDocumentDeleted(
  { document: "trips/{tripId}" },
  async (event) => {
    const trip = event.data?.data();
    if (!trip) return;
    await removeTripUldKeys(admin.firestore(), event.params.tripId, trip);
  }
);

// One-time (re-runnable) index of trips that existed before tripUldKeys.
// Idempotent: each trip id is set on its claim documents again.
exports.backfillTripUldKeys = onCall(
  { invoker: "public", timeoutSeconds: 540 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }
    await requireAdmin(request.auth.uid);

    const db = admin.firestore();
    let last = null;
    let tripsIndexed = 0;
    for (;;) {
      let query = db.collection("trips").orderBy(admin.firestore.FieldPath.documentId()).limit(200);
      if (last) query = query.startAfter(last);
      const snap = await query.get();
      if (snap.empty) break;
      for (const doc of snap.docs) {
        await addTripUldKeys(db, doc.id, doc.data());
        tripsIndexed += 1;
      }
      last = snap.docs[snap.docs.length - 1];
      if (snap.size < 200) break;
    }
    return { tripsIndexed };
  }
);

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
      const adminEmails = adminsSnap.docs.map((d) => d.data().email).filter(isNotificationEmail);
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
    const adminEmails = adminsSnap.docs.map((d) => d.data().email).filter(isNotificationEmail);
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

    // Phone-in orders can be assigned at create time. That is not an update,
    // so onTripRequestAssigned never sees it.
    await notifyDriversOfNewAwbs(db, [], req, event.params.requestId);
  }
);

// Emails and pushes each driver who gained an AWB on this request. Scoped to
// that driver's lines. Used for creates that are already assigned and for
// later assignments, including a second AWB for a driver already on the job.
async function notifyDriversOfNewAwbs(db, beforeLines, after, requestId) {
  const driverIds = driversGainingAwbLines(beforeLines, after.awbLines || []);
  if (driverIds.length === 0) return;

  const driverDocs = await Promise.all(
    driverIds.map((id) => db.collection("users").doc(id).get())
  );

  for (const driverDoc of driverDocs) {
    const driver = driverDoc.data();
    if (!driver) continue;

    if (driver.email) {
      try {
        const transporter = buildTransporter();
        await transporter.sendMail({
          from: `"ACK Freight" <${GMAIL_USER.value()}>`,
          to: driver.email,
          subject: `ACK Freight — Trip Assigned to You (${after.tripDate})`,
          html: buildTripRequestEmailHtml(
            "Trip Assigned to You",
            "You've been assigned a new trip. Details below.",
            after,
            driverDoc.id
          ),
        });
      } catch (err) {
        logger.error("Failed to send trip-assigned email:", err);
      }
    }

    // Each driver's app icon badge tracks their own count of assigned-but-
    // not-started AWB lines (not the trip's overall rollup status, which
    // may already show in_progress/completed because of another driver's
    // lines on the same request) — the push payload carries this number so
    // the badge is correct even if the app is closed when the push lands.
    const pushToken = driver.pushToken;
    if (!pushToken) continue;
    const assignedSnap = await db
      .collection("tripRequests")
      .where("assignedDriverIds", "array-contains", driverDoc.id)
      .get();
    const badge = assignedSnap.docs.filter((d) =>
      (d.data().awbLines || []).some(
        (l) => l.assignedDriverId === driverDoc.id && l.status === "assigned"
      )
    ).length;
    await sendExpoPush(
      [pushToken],
      "New Trip Assigned",
      `${after.from} → ${after.to} on ${after.tripDate}`,
      { type: "tripRequestAssigned", requestId },
      badge
    );
  }
}

// Fires when a driver gains an AWB, including another AWB for someone
// already assigned on the same request (assignedDriverIds would not change
// in that case).
exports.onTripRequestAssigned = onDocumentUpdated(
  { document: "tripRequests/{requestId}", secrets: [GMAIL_USER, GMAIL_APP_PASSWORD] },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    await notifyDriversOfNewAwbs(
      admin.firestore(),
      before.awbLines || [],
      after,
      event.params.requestId
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
    const recipients = adminsSnap.docs.map((d) => d.data().email).filter(isNotificationEmail);
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

// Drivers no longer write to tripRequests directly (see firestore.rules) —
// validating "only my own AWB line changed" isn't expressible there. These
// two callables do the read-modify-write server-side, in a transaction so
// two drivers acting on the same trip request concurrently can't clobber
// each other's lines, and check ownership in code instead of rules.
exports.startMyAwbLines = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }
  const { requestId } = request.data || {};
  if (!requestId) {
    throw new HttpsError("invalid-argument", "requestId is required.");
  }

  const db = admin.firestore();
  const ref = db.collection("tripRequests").doc(requestId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new HttpsError("not-found", "Trip request not found.");
    }
    const data = snap.data();
    const started = applyStart(data.awbLines || [], request.auth.uid, Date.now());
    if (!started.changed) {
      throw new HttpsError(
        "failed-precondition",
        "No assigned AWB lines to start for this driver."
      );
    }
    tx.update(ref, {
      awbLines: started.awbLines,
      status: started.status,
      assignedDriverIds: started.assignedDriverIds,
      assignedDriverNames: started.assignedDriverNames,
      updatedAt: Date.now(),
    });
  });

  return { success: true };
});

// A driver can have several AWBs in progress on one trip request but run
// them as separate physical trips (e.g. one drop-off this morning, another
// this afternoon) — awbIndexes lets them complete just the subset they
// actually finished just now, leaving the rest in_progress for later.
exports.completeMyAwbLines = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }
  const { requestId, tripLogId, awbIndexes } = request.data || {};
  if (!requestId || !tripLogId || !Array.isArray(awbIndexes) || awbIndexes.length === 0) {
    throw new HttpsError(
      "invalid-argument",
      "requestId, tripLogId, and a non-empty awbIndexes array are required."
    );
  }
  const indexSet = new Set(awbIndexes);

  const db = admin.firestore();
  const ref = db.collection("tripRequests").doc(requestId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new HttpsError("not-found", "Trip request not found.");
    }
    const data = snap.data();
    const completed = applyComplete(data.awbLines || [], request.auth.uid, indexSet, tripLogId);
    if (!completed.changed) {
      throw new HttpsError(
        "failed-precondition",
        "No matching in-progress AWB lines to complete for this driver."
      );
    }
    const updates = {
      awbLines: completed.awbLines,
      status: completed.status,
      assignedDriverIds: completed.assignedDriverIds,
      assignedDriverNames: completed.assignedDriverNames,
      updatedAt: Date.now(),
    };
    // Only clear this driver's live-tracking pin once none of their lines on
    // this request are still in progress — they may have other AWBs left to
    // finish as a separate trip.
    const stillInProgress = completed.awbLines.some(
      (l) => l.assignedDriverId === request.auth.uid && l.status === "in_progress"
    );
    if (!stillInProgress) {
      updates[`driverLocations.${request.auth.uid}`] = admin.firestore.FieldValue.delete();
    }
    tx.update(ref, updates);
  });

  return { success: true };
});

// Customer-only. Returns proof files for trip logs linked from this request.
// Does not open the trips collection to the client.
exports.getTripRequestProofs = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }
  const { requestId } = request.data || {};
  if (!requestId) {
    throw new HttpsError("invalid-argument", "requestId is required.");
  }

  const db = admin.firestore();
  const reqSnap = await db.collection("tripRequests").doc(requestId).get();
  if (!reqSnap.exists) {
    throw new HttpsError("not-found", "Trip request not found.");
  }
  const tripRequest = reqSnap.data();
  if (tripRequest.customerId !== request.auth.uid) {
    throw new HttpsError("permission-denied", "You can only view proof for your own requests.");
  }

  const tripIds = [
    ...new Set((tripRequest.awbLines || []).map((line) => line.tripLogId).filter(Boolean)),
  ];
  const tripById = {};
  const tripSnaps = await Promise.all(tripIds.map((id) => db.collection("trips").doc(id).get()));
  tripSnaps.forEach((snap) => {
    if (snap.exists) tripById[snap.id] = snap.data();
  });

  return { proofs: proofsForRequest(tripRequest, tripById) };
});

// Called every ~20-30s from a driver's phone while they have at least one
// AWB line in progress on this request — powers the live map customers and
// admins see. Only the driver's own entry in the driverLocations map is
// ever touched; other drivers' pins on the same request are untouched.
exports.updateMyLiveLocation = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }
  const { requestId, lat, lng } = request.data || {};
  if (!requestId || typeof lat !== "number" || typeof lng !== "number") {
    throw new HttpsError("invalid-argument", "requestId, lat, and lng are required.");
  }

  const db = admin.firestore();
  const ref = db.collection("tripRequests").doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Trip request not found.");
  }
  const data = snap.data();
  const hasActiveLine = (data.awbLines || []).some(
    (l) => l.assignedDriverId === request.auth.uid && l.status === "in_progress"
  );
  if (!hasActiveLine) {
    throw new HttpsError(
      "failed-precondition",
      "You don't have an in-progress AWB line on this trip request."
    );
  }

  await ref.update({
    [`driverLocations.${request.auth.uid}`]: { lat, lng, updatedAt: Date.now() },
  });

  return { success: true };
});

// --- QuickBooks Online integration ---
// Connection (access/refresh tokens + realmId) lives in one server-only
// Firestore doc — firestore.rules denies all client read/write on it, so the
// only way in or out is through these functions via the Admin SDK.

function qbConnectionRef() {
  return admin.firestore().collection("quickbooksAuth").doc("connection");
}

function qbBasicAuthHeader() {
  return "Basic " + Buffer.from(`${QB_CLIENT_ID.value()}:${QB_CLIENT_SECRET.value()}`).toString("base64");
}

async function qbApiRequest(accessToken, realmId, path, options = {}) {
  const res = await fetch(`${QB_API_BASE}/v3/company/${realmId}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  // Intuit's own tid for this exact request — including it in our logs is
  // what lets Intuit support actually locate a specific failed call.
  const intuitTid = res.headers.get("intuit_tid");
  if (!res.ok) {
    logger.error("QuickBooks API error:", { path, status: res.status, intuitTid, data });
    const err = new HttpsError(
      "internal",
      data?.Fault?.Error?.[0]?.Message || "QuickBooks API request failed."
    );
    err.qbStatus = res.status;
    err.intuitTid = intuitTid;
    throw err;
  }
  return data;
}

// Always does a real refresh call and persists the result — Intuit rotates
// the refresh token on every refresh, so the new one always gets saved
// back, or the next refresh would fail.
async function refreshQuickBooksToken(refreshToken) {
  const tokenRes = await fetch(QB_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: qbBasicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) {
    logger.error("QuickBooks token refresh failed:", {
      intuitTid: tokenRes.headers.get("intuit_tid"),
      tokenData,
    });
    throw new HttpsError(
      "internal",
      "Couldn't refresh the QuickBooks connection. Try reconnecting from Dispatch."
    );
  }

  await qbConnectionRef().update({
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: Date.now() + tokenData.expires_in * 1000,
  });

  return tokenData.access_token;
}

// The single entry point every QuickBooks API call goes through: gets a
// (proactively refreshed if near expiry) access token, makes the call, and
// — if QuickBooks still rejects it as unauthorized (token revoked
// externally, expired between our check and the request landing, etc.) —
// forces one real refresh and retries exactly once before giving up.
async function callQuickBooks(path, options = {}) {
  const snap = await qbConnectionRef().get();
  if (!snap.exists) {
    throw new HttpsError("failed-precondition", "QuickBooks isn't connected yet.");
  }
  const data = snap.data();
  const { realmId } = data;
  let accessToken =
    Date.now() < data.expiresAt - 60000
      ? data.accessToken
      : await refreshQuickBooksToken(data.refreshToken);

  try {
    return await qbApiRequest(accessToken, realmId, path, options);
  } catch (err) {
    if (err.qbStatus === 401) {
      accessToken = await refreshQuickBooksToken(data.refreshToken);
      return await qbApiRequest(accessToken, realmId, path, options);
    }
    throw err;
  }
}

async function requireAdmin(uid) {
  const callerSnap = await admin.firestore().collection("users").doc(uid).get();
  if (callerSnap.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Admins only.");
  }
}

function qbQueryEscape(value) {
  return String(value).replace(/'/g, "\\'");
}

// Returns both the QuickBooks customer id and the email to actually bill —
// if the customer already exists in QuickBooks, their email on file there
// takes precedence over ACK's own copy (which may be stale if it was edited
// directly in QuickBooks); for a brand-new customer there's nothing in
// QuickBooks yet, so ACK's email is used to seed it.
async function findOrCreateQuickBooksCustomer(name, email) {
  const query = `select * from Customer where DisplayName = '${qbQueryEscape(name)}'`;
  const result = await callQuickBooks(`/query?query=${encodeURIComponent(query)}`);
  const existing = result.QueryResponse?.Customer?.[0];
  if (existing) {
    return { id: existing.Id, email: existing.PrimaryEmailAddr?.Address || email || null };
  }

  const created = await callQuickBooks("/customer", {
    method: "POST",
    body: JSON.stringify({
      DisplayName: name,
      PrimaryEmailAddr: email ? { Address: email } : undefined,
    }),
  });
  return { id: created.Customer.Id, email: created.Customer.PrimaryEmailAddr?.Address || email || null };
}

// Every invoice line needs a QuickBooks Item to reference — reuse one
// shared "Freight Service" item across all invoices rather than creating a
// new one each time.
async function findOrCreateFreightServiceItem() {
  const query = "select * from Item where Name = 'Freight Service'";
  const result = await callQuickBooks(`/query?query=${encodeURIComponent(query)}`);
  const existing = result.QueryResponse?.Item?.[0];
  if (existing) return existing.Id;

  const incomeQuery = "select * from Account where AccountType = 'Income' MAXRESULTS 1";
  const incomeResult = await callQuickBooks(`/query?query=${encodeURIComponent(incomeQuery)}`);
  const incomeAccount = incomeResult.QueryResponse?.Account?.[0];
  if (!incomeAccount) {
    throw new HttpsError("failed-precondition", "No income account found in QuickBooks.");
  }

  const created = await callQuickBooks("/item", {
    method: "POST",
    body: JSON.stringify({
      Name: "Freight Service",
      Type: "Service",
      IncomeAccountRef: { value: incomeAccount.Id },
    }),
  });
  return created.Item.Id;
}

function qbPendingStateRef() {
  return admin.firestore().collection("quickbooksAuth").doc("pendingState");
}

// Builds the Intuit authorize URL server-side (so the client never needs
// the client ID hardcoded twice) and registers a one-time CSRF state value
// that quickbooksOAuthCallback checks before trusting the redirect back —
// without this, anything hitting the callback URL with a stolen/guessed
// authorization code would be accepted.
exports.startQuickBooksAuth = onCall(
  { secrets: [QB_CLIENT_ID], invoker: "public" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }
    await requireAdmin(request.auth.uid);

    const state = crypto.randomBytes(24).toString("hex");
    await qbPendingStateRef().set({ state, createdAt: Date.now() });

    const params = new URLSearchParams({
      client_id: QB_CLIENT_ID.value(),
      response_type: "code",
      scope: "com.intuit.quickbooks.accounting",
      redirect_uri: QB_REDIRECT_URI,
      state,
    });
    return { authUrl: `https://appcenter.intuit.com/connect/oauth2?${params.toString()}` };
  }
);

// Intuit redirects the admin's browser here after they approve the
// connection on QuickBooks' own login/consent page — this exchanges the
// short-lived authorization code for the access/refresh tokens we store.
exports.quickbooksOAuthCallback = onRequest(
  { secrets: [QB_CLIENT_ID, QB_CLIENT_SECRET] },
  async (req, res) => {
    const { code, realmId, state, error } = req.query;
    if (error) {
      res.status(400).send(`QuickBooks authorization failed: ${error}`);
      return;
    }
    if (!code || !realmId || !state) {
      res.status(400).send("Missing code, realmId, or state from QuickBooks.");
      return;
    }

    const pendingSnap = await qbPendingStateRef().get();
    const pending = pendingSnap.data();
    const stateIsValid =
      pending && pending.state === state && Date.now() - pending.createdAt < 15 * 60 * 1000;
    if (!stateIsValid) {
      res
        .status(400)
        .send("This connection request has expired or is invalid — please try connecting again from Dispatch.");
      return;
    }
    await qbPendingStateRef().delete(); // one-time use

    try {
      const tokenRes = await fetch(QB_TOKEN_URL, {
        method: "POST",
        headers: {
          Authorization: qbBasicAuthHeader(),
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: String(code),
          redirect_uri: QB_REDIRECT_URI,
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        logger.error("QuickBooks token exchange failed:", {
          intuitTid: tokenRes.headers.get("intuit_tid"),
          tokenData,
        });
        res.status(500).send("Couldn't complete QuickBooks connection. Check function logs.");
        return;
      }

      await qbConnectionRef().set({
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        realmId: String(realmId),
        environment: QB_ENVIRONMENT,
        connectedAt: Date.now(),
        expiresAt: Date.now() + tokenData.expires_in * 1000,
      });

      try {
        const companyInfo = await qbApiRequest(
          tokenData.access_token,
          String(realmId),
          `/companyinfo/${realmId}`
        );
        await qbConnectionRef().update({
          companyName: companyInfo.CompanyInfo?.CompanyName || null,
        });
      } catch (err) {
        logger.error("Failed to fetch QuickBooks company info:", err);
      }

      res.status(200).send(
        "<html><body style='font-family:sans-serif;text-align:center;padding:60px;'>" +
          "<h2>QuickBooks connected!</h2><p>You can close this tab and go back to ACK Freight.</p>" +
          "</body></html>"
      );
    } catch (err) {
      logger.error("quickbooksOAuthCallback error:", err);
      res.status(500).send("Something went wrong connecting QuickBooks.");
    }
  }
);

exports.getQuickBooksStatus = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }
  await requireAdmin(request.auth.uid);

  const snap = await qbConnectionRef().get();
  if (!snap.exists) return { connected: false };
  const data = snap.data();
  return {
    connected: true,
    companyName: data.companyName || null,
    environment: data.environment || QB_ENVIRONMENT,
    realmId: data.realmId,
  };
});

exports.disconnectQuickBooks = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }
  await requireAdmin(request.auth.uid);

  await qbConnectionRef().delete();
  return { success: true };
});

// Computes the invoice amount from the customer's configured rate, finds or
// creates that customer in QuickBooks, creates the invoice, and emails it —
// then flips the trip request to "invoiced" the same way the manual button
// does. Only completed, not-yet-invoiced requests are eligible.
exports.sendQuickBooksInvoice = onCall(
  { secrets: [QB_CLIENT_ID, QB_CLIENT_SECRET], invoker: "public" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }
    await requireAdmin(request.auth.uid);

    const { requestId } = request.data || {};
    if (!requestId) {
      throw new HttpsError("invalid-argument", "requestId is required.");
    }

    const db = admin.firestore();
    const reqRef = db.collection("tripRequests").doc(requestId);
    const reqSnap = await reqRef.get();
    if (!reqSnap.exists) {
      throw new HttpsError("not-found", "Trip request not found.");
    }
    const tripRequest = reqSnap.data();

    if (tripRequest.status !== "completed") {
      throw new HttpsError("failed-precondition", "Only completed trip requests can be invoiced.");
    }
    if (tripRequest.quickbooksInvoiceId) {
      throw new HttpsError("failed-precondition", "This trip request was already invoiced.");
    }

    const customerRef = db.collection("users").doc(tripRequest.customerId);
    const customerSnap = await customerRef.get();
    const customer = customerSnap.data();
    if (!customer?.billType || !customer?.billRate) {
      throw new HttpsError(
        "failed-precondition",
        "Set a billing rate for this customer before sending an invoice."
      );
    }

    const amount =
      customer.billType === "perTrip"
        ? customer.billRate
        : (tripRequest.awbLines || []).reduce((sum, l) => sum + (l.kilograms || 0), 0) *
          customer.billRate;

    if (!amount || amount <= 0) {
      throw new HttpsError(
        "failed-precondition",
        "Computed invoice amount is $0 — check the customer's billing rate and this trip's AWB weights."
      );
    }

    let qbCustomerId = customer.quickbooksCustomerId;
    if (!qbCustomerId) {
      const found = await findOrCreateQuickBooksCustomer(tripRequest.customerName, tripRequest.customerEmail);
      qbCustomerId = found.id;
      await customerRef.update({ quickbooksCustomerId: qbCustomerId });
    }

    // QuickBooks' invoice /send endpoint throws a server-side
    // NullPointerException when the underlying Customer record has no email
    // on file — even when the invoice's own BillEmail is set. Always fetch
    // the live Customer record and, if it has no email, patch one in before
    // ever attempting to send.
    const qbCustomer = (await callQuickBooks(`/customer/${qbCustomerId}`)).Customer;
    const billEmail = qbCustomer.PrimaryEmailAddr?.Address || tripRequest.customerEmail || null;
    if (billEmail && !qbCustomer.PrimaryEmailAddr?.Address) {
      await callQuickBooks("/customer", {
        method: "POST",
        body: JSON.stringify({
          Id: qbCustomer.Id,
          SyncToken: qbCustomer.SyncToken,
          sparse: true,
          PrimaryEmailAddr: { Address: billEmail },
        }),
      });
    }

    const itemId = await findOrCreateFreightServiceItem();

    const awbNumbers = (tripRequest.awbLines || [])
      .map((l) => l.awbNumber)
      .filter(Boolean)
      .join(", ");
    const description = `Freight service: ${tripRequest.from} → ${tripRequest.to} on ${tripRequest.tripDate} — AWB ${awbNumbers || "N/A"}`;

    const invoice = await callQuickBooks("/invoice", {
      method: "POST",
      body: JSON.stringify({
        CustomerRef: { value: qbCustomerId },
        BillEmail: billEmail ? { Address: billEmail } : undefined,
        EmailStatus: "NeedToSend",
        // These invoices are informational — no "Ways to pay" / online
        // payment button should appear on them.
        AllowOnlineCreditCardPayment: false,
        AllowOnlineACHPayment: false,
        Line: [
          {
            Amount: amount,
            DetailType: "SalesItemLineDetail",
            Description: description,
            SalesItemLineDetail: {
              ItemRef: { value: itemId },
              Qty: 1,
              UnitPrice: amount,
              // "NON" is QuickBooks' built-in non-taxable tax code — this is
              // a freight service, not a taxed sale.
              TaxCodeRef: { value: "NON" },
            },
          },
        ],
      }),
    });

    const invoiceId = invoice.Invoice.Id;
    const invoiceNumber = invoice.Invoice.DocNumber;

    // The invoice itself now exists in QuickBooks regardless of what happens
    // next — record that immediately so a failure in the email-send step
    // (QuickBooks' sandbox email API is known to be flaky) can't cause a
    // retry to create a duplicate invoice for the same trip request.
    await reqRef.update({
      status: "invoiced",
      quickbooksInvoiceId: invoiceId,
      invoicedAt: Date.now(),
      updatedAt: Date.now(),
    });

    let emailSent = false;
    if (billEmail) {
      // Intuit's /send endpoint has a known intermittent NullPointerException
      // when passed a redundant sendTo that matches the invoice's own
      // BillEmail (already set at creation) — try the plain call first, and
      // only fall back to the explicit sendTo if that still fails.
      try {
        await callQuickBooks(`/invoice/${invoiceId}/send`, { method: "POST" });
        emailSent = true;
      } catch (err) {
        logger.error("QuickBooks invoice send (no sendTo) failed, retrying with sendTo:", err);
        try {
          await callQuickBooks(`/invoice/${invoiceId}/send?sendTo=${encodeURIComponent(billEmail)}`, {
            method: "POST",
          });
          emailSent = true;
        } catch (err2) {
          logger.error("QuickBooks invoice created but emailing it failed both ways:", err2);
        }
      }
    }

    return { success: true, invoiceId, invoiceNumber: invoiceNumber || null, amount, emailSent };
  }
);

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

// Admins can browse everything drivers/admins have deleted (deleteTrip's
// audit snapshot) and put one back if it was a mistake.
exports.listDeletedTrips = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }
  await requireAdmin(request.auth.uid);

  const db = admin.firestore();
  const snap = await db
    .collection("deletedTrips")
    .orderBy("deletedAt", "desc")
    .limit(100)
    .get();

  return {
    deletedTrips: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
});

exports.restoreDeletedTrip = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }
  await requireAdmin(request.auth.uid);

  const { deletedTripId } = request.data || {};
  if (!deletedTripId) {
    throw new HttpsError("invalid-argument", "deletedTripId is required.");
  }

  const db = admin.firestore();
  const ref = db.collection("deletedTrips").doc(deletedTripId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Deleted trip record not found.");
  }
  const data = snap.data();
  if (data.restoredAt) {
    throw new HttpsError("failed-precondition", "This trip was already restored.");
  }

  await db.collection("trips").doc(data.tripId).set(data.trip);
  await ref.update({ restoredAt: Date.now(), restoredBy: request.auth.uid });

  return { success: true, tripId: data.tripId };
});

// The users collection's own Firestore rules only let an admin touch
// payType/payRate/billType/billRate directly — role is deliberately not
// client-writable, so fixing a wrong signup (e.g. a customer who signed up
// as a driver by mistake) has to go through here instead.
const VALID_ROLES = ["admin", "driver", "customer"];
exports.setUserRole = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }
  await requireAdmin(request.auth.uid);

  const { uid, role } = request.data || {};
  if (!uid || !VALID_ROLES.includes(role)) {
    throw new HttpsError("invalid-argument", "uid and a valid role are required.");
  }

  const db = admin.firestore();
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "User not found.");
  }

  await ref.update({ role });
  return { success: true };
});

// Changes both the Auth login credential and the denormalized Firestore
// copy — updating only the Firestore doc would leave the user logging in
// with their old email while the app shows the new one.
exports.updateUserEmail = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }
  await requireAdmin(request.auth.uid);

  const { uid, email } = request.data || {};
  if (!uid || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "uid and a valid email are required.");
  }

  const db = admin.firestore();
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "User not found.");
  }

  try {
    await admin.auth().updateUser(uid, { email });
  } catch (err) {
    if (err.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "Another account already uses that email.");
    }
    throw new HttpsError("internal", err.message || "Failed to update the login email.");
  }
  await ref.update({ email });

  return { success: true };
});

// Sets a user's password directly — no need to know their old one. Useful
// for a locked-out user or fixing a bad signup. Firebase Auth requires at
// least 6 characters; nothing here ever logs the password value itself.
exports.updateUserPassword = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }
  await requireAdmin(request.auth.uid);

  const { uid, password } = request.data || {};
  if (!uid || typeof password !== "string" || password.length < 6) {
    throw new HttpsError(
      "invalid-argument",
      "uid and a password of at least 6 characters are required."
    );
  }

  const db = admin.firestore();
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "User not found.");
  }

  try {
    await admin.auth().updateUser(uid, { password });
  } catch (err) {
    throw new HttpsError("internal", err.message || "Failed to update the password.");
  }

  return { success: true };
});

// Alternative to deleteUserAccount for a user with trip history — deleting
// them would orphan nothing (trips/trip requests denormalize their own
// name/email), but it's nicer to keep the account around for the record.
// Disabling at the Auth level actually blocks sign-in (not just an app-side
// flag), and the mirrored Firestore field lets the UI show status without
// an extra Auth lookup.
exports.setUserActive = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }
  await requireAdmin(request.auth.uid);

  const { uid, active } = request.data || {};
  if (!uid || typeof active !== "boolean") {
    throw new HttpsError("invalid-argument", "uid and a boolean active are required.");
  }
  if (uid === request.auth.uid) {
    throw new HttpsError("failed-precondition", "You can't deactivate your own account.");
  }

  const db = admin.firestore();
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "User not found.");
  }

  try {
    await admin.auth().updateUser(uid, { disabled: !active });
  } catch (err) {
    if (err.code !== "auth/user-not-found") {
      throw new HttpsError("internal", err.message || "Failed to update the account.");
    }
  }
  await db.collection("users").doc(uid).update({ active });

  return { success: true };
});

// Removes the account entirely — both the Auth login and the Firestore
// profile. Historical trips/trip requests keep their own denormalized copy
// of the driver/customer name and email, so they stay readable afterward.
exports.deleteUserAccount = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }
  await requireAdmin(request.auth.uid);

  const { uid } = request.data || {};
  if (!uid) {
    throw new HttpsError("invalid-argument", "uid is required.");
  }
  if (uid === request.auth.uid) {
    throw new HttpsError("failed-precondition", "You can't delete your own account.");
  }

  const db = admin.firestore();
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "User not found.");
  }

  try {
    await admin.auth().deleteUser(uid);
  } catch (err) {
    if (err.code !== "auth/user-not-found") {
      throw new HttpsError("internal", err.message || "Failed to delete the login account.");
    }
  }
  await ref.delete();

  return { success: true };
});
