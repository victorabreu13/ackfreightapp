// Pure trip-request transitions shared by the Cloud Functions.
// Kept free of firebase-admin so unit tests can require this file alone.

function normalizeAwb(value) {
  return String(value ?? "").trim().toUpperCase();
}

function computeRollup(awbLines) {
  const lines = awbLines || [];
  const assignedDriverIds = [
    ...new Set(lines.map((l) => l.assignedDriverId).filter(Boolean)),
  ];
  const assignedDriverNames = [
    ...new Set(lines.map((l) => l.assignedDriverName).filter(Boolean)),
  ];

  let status = "submitted";
  if (lines.length > 0 && lines.every((l) => l.status === "completed")) {
    status = "completed";
  } else if (
    lines.some(
      (l) => l.status === "in_progress" || l.status === "picked_up" || l.status === "completed"
    )
  ) {
    status = "in_progress";
  } else if (lines.some((l) => l.status === "assigned" || l.status === "accepted")) {
    status = "assigned";
  }

  return { status, assignedDriverIds, assignedDriverNames };
}

function awbCountsForDriver(lines, driverId) {
  const counts = new Map();
  for (const line of lines || []) {
    if (line.assignedDriverId !== driverId) continue;
    const key = normalizeAwb(line.awbNumber);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function driverIdsOnLines(lines) {
  return [...new Set((lines || []).map((l) => l.assignedDriverId).filter(Boolean))];
}

// Drivers who now hold an AWB number they didn't hold (or hold more copies of)
// on this request. Covers a request created already assigned, and a driver
// who was already on the request gaining another AWB. Status-only changes
// (start, complete) do not notify.
// A driver who took an open line themselves is already looking at it. Dispatch
// assignment (status "assigned") still notifies.
function gainedBySelfAccept(beforeLines, afterLines, driverId) {
  const before = beforeLines || [];
  const after = afterLines || [];
  let sawGain = false;
  for (let i = 0; i < after.length; i++) {
    const next = after[i];
    if (!next || next.assignedDriverId !== driverId) continue;
    const prev = before[i];
    const sameLine =
      prev &&
      prev.assignedDriverId === driverId &&
      normalizeAwb(prev.awbNumber) === normalizeAwb(next.awbNumber);
    if (sameLine) continue;
    sawGain = true;
    const fromBoard = (!prev || !prev.assignedDriverId) && next.status === "accepted";
    if (!fromBoard) return false;
  }
  return sawGain;
}

function driversGainingAwbLines(beforeLines, afterLines) {
  const gained = [];
  for (const driverId of driverIdsOnLines(afterLines)) {
    if (gainedBySelfAccept(beforeLines, afterLines, driverId)) continue;
    const before = awbCountsForDriver(beforeLines, driverId);
    const after = awbCountsForDriver(afterLines, driverId);
    let increased = false;
    for (const [key, count] of after) {
      if (count > (before.get(key) || 0)) increased = true;
    }
    if (increased) gained.push(driverId);
  }
  return gained;
}

function driverStillOnTrip(awbLines, uid) {
  return (awbLines || []).some(
    (line) =>
      line.assignedDriverId === uid &&
      (line.status === "in_progress" || line.status === "picked_up")
  );
}

// Board accept. The line must still be unassigned inside the same transaction
// that writes the winner. A second accept sees the first driver's id and loses.
function applyBoardAccept(awbLines, awbIndex, driverId, driverName, now) {
  const lines = awbLines || [];
  const line = lines[awbIndex];
  if (!line) return { ok: false, reason: "missing", awbLines: lines, ...computeRollup(lines) };
  if (line.assignedDriverId || line.status !== "submitted") {
    return { ok: false, reason: "taken", awbLines: lines, ...computeRollup(lines) };
  }
  const nextLines = lines.map((entry, index) =>
    index === awbIndex
      ? {
          ...entry,
          assignedDriverId: driverId,
          assignedDriverName: driverName,
          status: "accepted",
          acceptedAt: now,
        }
      : entry
  );
  return { ok: true, awbLines: nextLines, ...computeRollup(nextLines) };
}

// Direct dispatch assignment stays status "assigned" until this driver accepts.
function applyAcceptAssigned(awbLines, awbIndex, uid, now) {
  const lines = awbLines || [];
  const line = lines[awbIndex];
  if (!line || line.assignedDriverId !== uid || line.status !== "assigned") {
    return { changed: false, awbLines: lines, ...computeRollup(lines) };
  }
  const nextLines = lines.map((entry, index) =>
    index === awbIndex ? { ...entry, status: "accepted", acceptedAt: now } : entry
  );
  return { changed: true, awbLines: nextLines, ...computeRollup(nextLines) };
}

// Decline before the trip starts. The line goes back on the board (submitted,
// no driver) for dispatch or another on-duty driver.
function applyDecline(awbLines, awbIndex, uid) {
  const lines = awbLines || [];
  const line = lines[awbIndex];
  const declinable = line && (line.status === "assigned" || line.status === "accepted");
  if (!declinable || line.assignedDriverId !== uid) {
    return { changed: false, awbLines: lines, ...computeRollup(lines) };
  }
  const nextLines = lines.map((entry, index) => {
    if (index !== awbIndex) return entry;
    const next = {
      ...entry,
      assignedDriverId: null,
      assignedDriverName: null,
      status: "submitted",
    };
    delete next.acceptedAt;
    return next;
  });
  return { changed: true, awbNumber: line.awbNumber, awbLines: nextLines, ...computeRollup(nextLines) };
}

// Accept is optional: a driver may start a line dispatch assigned to them
// directly ("assigned") as well as one they accepted ("accepted").
function applyStart(awbLines, uid, now) {
  let changed = false;
  const nextLines = (awbLines || []).map((line) => {
    if (
      line.assignedDriverId === uid &&
      (line.status === "accepted" || line.status === "assigned")
    ) {
      changed = true;
      return { ...line, status: "in_progress", startedAt: now };
    }
    return line;
  });
  return { changed, awbLines: nextLines, ...computeRollup(nextLines) };
}

function applyPickup(awbLines, uid, indexSet, now) {
  let changed = false;
  const nextLines = (awbLines || []).map((line, index) => {
    if (indexSet.has(index) && line.assignedDriverId === uid && line.status === "in_progress") {
      changed = true;
      return { ...line, status: "picked_up", pickedUpAt: now };
    }
    return line;
  });
  return { changed, awbLines: nextLines, ...computeRollup(nextLines) };
}

// Pickup is optional: a driver may complete a line straight from "in_progress"
// (older app builds have no pickup step) as well as from "picked_up".
function applyComplete(awbLines, uid, indexSet, tripLogId) {
  let changed = false;
  const nextLines = (awbLines || []).map((line, index) => {
    if (
      indexSet.has(index) &&
      line.assignedDriverId === uid &&
      (line.status === "picked_up" || line.status === "in_progress")
    ) {
      changed = true;
      return { ...line, status: "completed", tripLogId };
    }
    return line;
  });
  return { changed, awbLines: nextLines, ...computeRollup(nextLines) };
}

function linesEnteringStatus(beforeLines, afterLines, status) {
  const before = beforeLines || [];
  const after = afterLines || [];
  const entered = [];
  for (let i = 0; i < after.length; i++) {
    if (after[i] && after[i].status === status && before[i]?.status !== status) {
      entered.push(after[i]);
    }
  }
  return entered;
}

// Mirrors the dispatch client's per-line assignment write.
function applyAssignment(awbLines, awbIndex, driverId, driverName) {
  const lines = awbLines || [];
  const previousDriverId = lines[awbIndex]?.assignedDriverId ?? null;
  const nextLines = lines.map((line, index) =>
    index === awbIndex
      ? {
          ...line,
          assignedDriverId: driverId,
          assignedDriverName: driverName,
          status: driverId ? "assigned" : "submitted",
        }
      : line
  );
  return { previousDriverId, awbLines: nextLines, ...computeRollup(nextLines) };
}

module.exports = {
  normalizeAwb,
  computeRollup,
  driversGainingAwbLines,
  driverStillOnTrip,
  applyBoardAccept,
  applyAcceptAssigned,
  applyDecline,
  applyStart,
  applyPickup,
  applyComplete,
  applyAssignment,
  linesEnteringStatus,
};
