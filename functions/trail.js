// Location history for a trip: a breadcrumb trail of the driver's pings plus a
// location "stamp" on each AWB line when it is started, picked up and completed,
// so an admin can later check where the cargo really went. Pure helpers (no
// Firebase) so they can be unit tested.

const MAX_TRAIL_POINTS = 4000; // ~28 hours of pings at one every 25 s
const MIN_MOVE_METERS = 15; // a standing driver adds no new point...
const MAX_QUIET_MS = 120000; // ...except one every 2 minutes, to show they stayed

function validPoint(p) {
  return (
    !!p &&
    typeof p.lat === "number" &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}

function distanceMeters(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Whether a new ping is worth adding to the trail. */
function shouldRecordPoint(last, point) {
  if (!last) return true;
  if (point.t - last.t >= MAX_QUIET_MS) return true;
  return distanceMeters(last, point) >= MIN_MOVE_METERS;
}

/**
 * Where the driver was when they tapped start / pick up / complete. Prefers the
 * exact fix their phone sent; otherwise the last ping the server holds (at most
 * about 25 seconds old while they are on the road).
 */
function stampPoint(data, uid, clientLocation, now) {
  if (validPoint(clientLocation)) {
    const stamp = { lat: clientLocation.lat, lng: clientLocation.lng, at: now, source: "device" };
    if (typeof clientLocation.accuracy === "number" && Number.isFinite(clientLocation.accuracy)) {
      stamp.accuracy = Math.round(clientLocation.accuracy);
    }
    return stamp;
  }
  const last = data && data.driverLocations && data.driverLocations[uid];
  if (validPoint(last)) {
    return { lat: last.lat, lng: last.lng, at: now, source: "last ping", pingAt: last.updatedAt || null };
  }
  return null;
}

const STAMP_FIELD = {
  in_progress: "startedLocation",
  picked_up: "pickedUpLocation",
  completed: "completedLocation",
};

/** Adds the stamp to every line whose status just changed to started / picked up / completed. */
function stampTransitions(beforeLines, afterLines, stamp) {
  if (!stamp) return afterLines;
  return (afterLines || []).map((line, i) => {
    const before = (beforeLines || [])[i];
    const field = STAMP_FIELD[line && line.status];
    if (!field || !before || before.status === line.status) return line;
    return { ...line, [field]: stamp };
  });
}

module.exports = {
  MAX_TRAIL_POINTS,
  validPoint,
  distanceMeters,
  shouldRecordPoint,
  stampPoint,
  stampTransitions,
};
