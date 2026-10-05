// Firestore reads and writes for driver pay. Calculation stays in driverPay.js.

const {
  cleanAgreement,
  jobFromRequest,
  minutesPastPickup,
  offerForDriver,
  publicOffer,
} = require("./driverPay");

function payDocId(requestId, awbIndex) {
  return `${requestId}_${awbIndex}`;
}

async function loadAgreements(db, driverId) {
  const [driverSnap, defaultSnap] = await Promise.all([
    db.collection("driverPayAgreements").doc(driverId).get(),
    db.collection("config").doc("driverPayDefault").get(),
  ]);
  return {
    driverAgreement: driverSnap.exists ? driverSnap.data() : null,
    companyDefault: defaultSnap.exists ? defaultSnap.data() : null,
  };
}

async function loadOverride(db, requestId, awbIndex) {
  const snap = await db.collection("awbPayOverrides").doc(payDocId(requestId, awbIndex)).get();
  return snap.exists ? snap.data() : null;
}

async function offerForLine(db, driverId, req, line, requestId, awbIndex, extra) {
  const [{ driverAgreement, companyDefault }, override] = await Promise.all([
    loadAgreements(db, driverId),
    loadOverride(db, requestId, awbIndex),
  ]);
  const offer = offerForDriver(
    driverAgreement,
    companyDefault,
    jobFromRequest(req, line, req.routeEstimate, extra),
    override
  );
  return { offer, override };
}

function snapshotBody(requestId, awbIndex, driverId, req, line, offer, route) {
  const pub = publicOffer(offer);
  return {
    requestId,
    awbIndex,
    driverId,
    awbNumber: (line && line.awbNumber) || "",
    from: (req && req.from) || "",
    to: (req && req.to) || "",
    tripDate: (req && req.tripDate) || "",
    pickupTime: (req && req.pickupTime) || "",
    qtyPieces: (line && line.qtyPieces) || 0,
    type: (line && line.type) || "",
    kilograms: (line && line.kilograms) || 0,
    hazmat: !!(line && line.hazmat),
    amount: pub.amount,
    currency: "USD",
    status: pub.status,
    source: pub.source,
    breakdown: pub.breakdown,
    tripType: pub.tripType,
    miles: route && typeof route.miles === "number" ? route.miles : null,
    driveMinutes: route && typeof route.driveMinutes === "number" ? route.driveMinutes : null,
    milesApproximate: !!(route && route.approximate),
    origin: (route && route.origin) || null,
    destination: (route && route.destination) || null,
    waitFreeMinutes: offer.waitFreeMinutes,
    waitPer15Min: offer.waitPer15Min,
    waitAmount: 0,
    locked: false,
    adjustment: null,
    computedAt: Date.now(),
  };
}

async function writeSnapshot(db, requestId, awbIndex, driverId, req, line) {
  const { offer } = await offerForLine(db, driverId, req, line, requestId, awbIndex);
  const body = snapshotBody(requestId, awbIndex, driverId, req, line, offer, req.routeEstimate);
  await db.collection("awbPay").doc(payDocId(requestId, awbIndex)).set(body);
  return body;
}

async function syncAssignedSnapshots(db, requestId, beforeLines, afterReq) {
  const before = beforeLines || [];
  const after = (afterReq && afterReq.awbLines) || [];
  const count = Math.max(before.length, after.length);
  for (let index = 0; index < count; index += 1) {
    const prev = before[index];
    const next = after[index];
    const prevId = prev && prev.assignedDriverId ? prev.assignedDriverId : null;
    const nextId = next && next.assignedDriverId ? next.assignedDriverId : null;
    if (prevId === nextId) continue;
    const ref = db.collection("awbPay").doc(payDocId(requestId, index));
    if (!nextId) {
      await ref.delete().catch(() => {});
      continue;
    }
    const existing = await ref.get();
    if (existing.exists && existing.data().locked === true) continue;
    await writeSnapshot(db, requestId, index, nextId, afterReq, next);
  }
}

async function lockCompletedPay(db, requestId, indexes, req) {
  const lines = (req && req.awbLines) || [];
  for (const index of indexes) {
    const ref = db.collection("awbPay").doc(payDocId(requestId, index));
    const snap = await ref.get();
    if (!snap.exists) continue;
    const data = snap.data();
    if (data.locked === true) continue;
    const line = lines[index] || {};
    const arrivedAt = line.pickedUpAt || line.startedAt || Date.now();
    let waitAmount = 0;
    if (typeof data.waitPer15Min === "number" && data.waitPer15Min > 0) {
      const waited = minutesPastPickup(req.tripDate, req.pickupTime, arrivedAt);
      const free = typeof data.waitFreeMinutes === "number" ? data.waitFreeMinutes : 0;
      const blocks = Math.ceil(Math.max(0, waited - free) / 15);
      waitAmount = Math.round(blocks * data.waitPer15Min * 100) / 100;
    }
    await ref.update({ locked: true, waitAmount, lockedAt: Date.now() });
  }
}

function openLineIndexes(lines) {
  const indexes = [];
  (lines || []).forEach((line, index) => {
    if (line && !line.assignedDriverId && line.status === "submitted") indexes.push(index);
  });
  return indexes;
}

function sameIdList(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

module.exports = {
  payDocId,
  loadOverride,
  offerForLine,
  writeSnapshot,
  syncAssignedSnapshots,
  lockCompletedPay,
  openLineIndexes,
  sameIdList,
  cleanAgreement,
  publicOffer,
};
