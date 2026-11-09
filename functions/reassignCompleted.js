// An admin changes the driver of an AWB that is already completed. The completed
// trip belongs to one trip log (one driver's trip), so every AWB on this request
// that shares that log moves to the new driver together, and the log moves with them.
// Pure, so unit tests can require it alone.

const { computeRollup } = require("./awbLogic");

function planReassignCompleted(awbLines, awbIndex, newDriverId, newDriverName) {
  const lines = awbLines || [];
  const line = lines[awbIndex];
  if (!line) return { ok: false, message: "That AWB isn't on this trip request." };
  if (line.status !== "completed") {
    return { ok: false, message: "Only a completed AWB is changed this way. Reassign it from the driver list instead." };
  }
  if (!newDriverId) return { ok: false, message: "A completed AWB needs a driver. Pick another driver." };
  if (line.assignedDriverId === newDriverId) {
    return { ok: false, message: `This AWB is already assigned to ${newDriverName || "that driver"}.` };
  }
  const tripLogId = line.tripLogId || null;
  const fromDriverId = line.assignedDriverId || null;
  const indexes = [];
  lines.forEach((l, i) => {
    if (i === awbIndex) indexes.push(i);
    else if (tripLogId && l.tripLogId === tripLogId && l.status === "completed" && l.assignedDriverId === fromDriverId) {
      indexes.push(i);
    }
  });
  const moved = new Set(indexes);
  const nextLines = lines.map((l, i) =>
    moved.has(i) ? { ...l, assignedDriverId: newDriverId, assignedDriverName: newDriverName } : l
  );
  return {
    ok: true,
    indexes,
    tripLogId,
    fromDriverId,
    fromDriverName: line.assignedDriverName || "",
    awbLines: nextLines,
    ...computeRollup(nextLines),
  };
}

// The trip log goes with the driver. A trip already paid out can't change hands.
function planReassignTripLog(trip, newDriver) {
  if (!trip) return { ok: true, update: null };
  if (trip.paid === true) {
    return {
      ok: false,
      message: `This trip was already paid to ${trip.driverName || "the driver"}. Mark it unpaid in Payroll first, then change the driver.`,
    };
  }
  return {
    ok: true,
    update: { driverId: newDriver.id, driverName: newDriver.name, driverEmail: newDriver.email || "" },
  };
}

module.exports = { planReassignCompleted, planReassignTripLog };
