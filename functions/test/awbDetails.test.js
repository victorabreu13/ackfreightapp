const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanDetailChanges, planUpdateAwbDetails, planTripLogFollow, planReopen } = require("../awbDetails");

const line = (over) => ({ awbNumber: "1", qtyPieces: 2, kilograms: 100, type: "Loose", status: "assigned", assignedDriverId: "a", assignedDriverName: "A", ...over });

test("only the fields that came in are checked and kept", () => {
  assert.deepEqual(cleanDetailChanges({ qtyPieces: "3", kilograms: "12.345", type: "PMC" }).changes, { qtyPieces: 3, kilograms: 12.35, type: "PMC" });
  assert.deepEqual(cleanDetailChanges({ type: "AKE" }).changes, { type: "AKE" });
  assert.equal(cleanDetailChanges({ qtyPieces: 0 }).ok, false);
  assert.equal(cleanDetailChanges({ qtyPieces: 1.5 }).ok, false);
  assert.equal(cleanDetailChanges({ kilograms: -1 }).ok, false);
  assert.equal(cleanDetailChanges({ type: "Box" }).ok, false);
  assert.equal(cleanDetailChanges({}).ok, false);
});

test("changing the line moves the kilograms and the ULD count by the difference", () => {
  const plan = planUpdateAwbDetails([line(), line({ awbNumber: "2" })], 0, { type: "PMC", qtyPieces: 3, kilograms: 130 });
  assert.equal(plan.ok, true);
  assert.equal(plan.awbLines[0].type, "PMC");
  assert.equal(plan.awbLines[1].type, "Loose");
  assert.equal(plan.kgDelta, 30);
  assert.equal(plan.uldDelta, 3); // Loose counts 0 ULDs, 3 PMC count 3
  const back = planUpdateAwbDetails(plan.awbLines, 0, { type: "Loose" });
  assert.equal(back.uldDelta, -3);
  assert.equal(planUpdateAwbDetails([line()], 0, { kilograms: 100 }).ok, false);
  assert.equal(planUpdateAwbDetails([line()], 4, { kilograms: 1 }).ok, false);
});

test("the trip log follows by the differences, unless it was already paid", () => {
  const trip = { paid: false, kilograms: 250, uldCount: 4, driverName: "A" };
  assert.deepEqual(planTripLogFollow(trip, 30, 3).update, { kilograms: 280, uldCount: 7 });
  assert.deepEqual(planTripLogFollow(trip, -300, 0).update, { kilograms: 0 });
  assert.equal(planTripLogFollow(trip, 0, 0).update, null);
  assert.equal(planTripLogFollow({ ...trip, uldCount: undefined }, 0, 2).update, null);
  const paid = planTripLogFollow({ ...trip, paid: true }, 10, 0);
  assert.equal(paid.ok, false);
  assert.match(paid.message, /already paid to A/);
  // a paid trip is untouched when nothing payable changes
  assert.equal(planTripLogFollow({ ...trip, paid: true }, 0, 0).ok, true);
  assert.equal(planTripLogFollow(null, 5, 5).update, null);
});

test("a cancelled trip request comes back with the status its AWBs have", () => {
  const assigned = planReopen({ status: "cancelled", awbLines: [line()] });
  assert.equal(assigned.ok, true);
  assert.equal(assigned.status, "assigned");
  const open = planReopen({ status: "cancelled", awbLines: [line({ status: "submitted", assignedDriverId: null })] });
  assert.equal(open.status, "submitted");
  const done = planReopen({ status: "cancelled", awbLines: [line({ status: "completed" })] });
  assert.equal(done.status, "completed");
  assert.equal(planReopen({ status: "assigned", awbLines: [line()] }).ok, false);
  assert.equal(planReopen(null).ok, false);
  assert.equal(planReopen({ status: "cancelled", awbLines: [] }).ok, false);
});
