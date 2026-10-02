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
  } else if (lines.some((l) => l.status === "in_progress" || l.status === "completed")) {
    status = "in_progress";
  } else if (lines.some((l) => l.status === "assigned")) {
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
function driversGainingAwbLines(beforeLines, afterLines) {
  const gained = [];
  for (const driverId of driverIdsOnLines(afterLines)) {
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

function applyStart(awbLines, uid, now) {
  let changed = false;
  const nextLines = (awbLines || []).map((line) => {
    if (line.assignedDriverId === uid && line.status === "assigned") {
      changed = true;
      return { ...line, status: "in_progress", startedAt: now };
    }
    return line;
  });
  return { changed, awbLines: nextLines, ...computeRollup(nextLines) };
}

function applyComplete(awbLines, uid, indexSet, tripLogId) {
  let changed = false;
  const nextLines = (awbLines || []).map((line, index) => {
    if (indexSet.has(index) && line.assignedDriverId === uid && line.status === "in_progress") {
      changed = true;
      return { ...line, status: "completed", tripLogId };
    }
    return line;
  });
  return { changed, awbLines: nextLines, ...computeRollup(nextLines) };
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
  applyStart,
  applyComplete,
  applyAssignment,
};
