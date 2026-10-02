const crypto = require("crypto");

function normalizeKeyPart(value) {
  return String(value ?? "").trim().toUpperCase();
}

function uldDocId(awbNumber, uldNumber) {
  const awb = normalizeKeyPart(awbNumber);
  const uld = normalizeKeyPart(uldNumber);
  return crypto.createHash("sha256").update(`${awb}\n${uld}`).digest("hex");
}

function uldPairs(trip) {
  const awb = normalizeKeyPart(trip && trip.awbNumber);
  const ulds = [
    ...new Set(((trip && trip.uldNumbers) || []).map(normalizeKeyPart).filter(Boolean)),
  ];
  return ulds.map((uld) => ({ awb, uld, id: uldDocId(awb, uld) }));
}

function tripIdsMap(data) {
  if (!data || !data.tripIds || typeof data.tripIds !== "object") return {};
  return data.tripIds;
}

function hasAnyTrip(data) {
  return Object.keys(tripIdsMap(data)).length > 0;
}

async function addTripUldKeys(db, tripId, trip) {
  for (const pair of uldPairs(trip)) {
    const ref = db.collection("tripUldKeys").doc(pair.id);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const tripIds = { ...tripIdsMap(snap.exists ? snap.data() : null) };
      tripIds[tripId] = true;
      tx.set(
        ref,
        { awbNumber: pair.awb, uldNumber: pair.uld, tripIds },
        { merge: true }
      );
    });
  }
}

async function removeTripUldKeys(db, tripId, trip) {
  for (const pair of uldPairs(trip)) {
    const ref = db.collection("tripUldKeys").doc(pair.id);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const tripIds = { ...tripIdsMap(snap.data()) };
      if (!Object.prototype.hasOwnProperty.call(tripIds, tripId)) return;
      delete tripIds[tripId];
      if (Object.keys(tripIds).length === 0) {
        tx.delete(ref);
      } else {
        tx.set(ref, { awbNumber: pair.awb, uldNumber: pair.uld, tripIds }, { merge: true });
      }
    });
  }
}

// Reads only the claim documents for this AWB + ULD pair. Does not return
// who logged the earlier trip.
async function findDuplicateUld(db, awbNumber, uldNumbers) {
  const awb = normalizeKeyPart(awbNumber);
  const ulds = [...new Set((uldNumbers || []).map(normalizeKeyPart).filter(Boolean))];
  for (const uld of ulds) {
    const snap = await db.collection("tripUldKeys").doc(uldDocId(awb, uld)).get();
    if (hasAnyTrip(snap.exists ? snap.data() : null)) {
      return { duplicate: true, uldNumber: uld };
    }
  }
  return { duplicate: false };
}

// Check-and-write in one transaction so two drivers submitting the same
// AWB+ULD can't both succeed. All reads happen before writes.
async function commitTripIfUnique(db, tripId, trip) {
  const pairs = uldPairs(trip);
  return db.runTransaction(async (tx) => {
    const refs = pairs.map((pair) => db.collection("tripUldKeys").doc(pair.id));
    const snaps = [];
    for (const ref of refs) {
      snaps.push(await tx.get(ref));
    }
    for (let i = 0; i < snaps.length; i++) {
      if (hasAnyTrip(snaps[i].exists ? snaps[i].data() : null)) {
        return { duplicate: true, uldNumber: pairs[i].uld };
      }
    }
    tx.set(db.collection("trips").doc(tripId), trip);
    for (let i = 0; i < pairs.length; i++) {
      const existing = snaps[i].exists ? { ...tripIdsMap(snaps[i].data()) } : {};
      existing[tripId] = true;
      tx.set(refs[i], {
        awbNumber: pairs[i].awb,
        uldNumber: pairs[i].uld,
        tripIds: existing,
      });
    }
    return { duplicate: false, id: tripId };
  });
}

module.exports = {
  normalizeKeyPart,
  uldDocId,
  uldPairs,
  hasAnyTrip,
  addTripUldKeys,
  removeTripUldKeys,
  findDuplicateUld,
  commitTripIfUnique,
};
