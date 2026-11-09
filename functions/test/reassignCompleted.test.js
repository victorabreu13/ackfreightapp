const test = require("node:test");
const assert = require("node:assert/strict");
const { planReassignCompleted, planReassignTripLog } = require("../reassignCompleted");
const { driversGainingAwbLines } = require("../awbLogic");

const done = (n, driver, log) => ({
  awbNumber: n,
  status: "completed",
  assignedDriverId: driver,
  assignedDriverName: driver.toUpperCase(),
  tripLogId: log,
});

test("changes the driver of a completed AWB and keeps it completed", () => {
  const plan = planReassignCompleted([done("1", "a", "t1")], 0, "b", "Bea");
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.indexes, [0]);
  assert.equal(plan.awbLines[0].assignedDriverId, "b");
  assert.equal(plan.awbLines[0].assignedDriverName, "Bea");
  assert.equal(plan.awbLines[0].status, "completed");
  assert.equal(plan.status, "completed");
  assert.deepEqual(plan.assignedDriverIds, ["b"]);
  assert.equal(plan.fromDriverId, "a");
  assert.equal(plan.tripLogId, "t1");
});

test("every AWB of the same trip log moves with it, other trips stay", () => {
  const lines = [done("1", "a", "t1"), done("2", "a", "t1"), done("3", "a", "t2"), done("4", "c", "t1")];
  const plan = planReassignCompleted(lines, 1, "b", "Bea");
  assert.deepEqual(plan.indexes, [0, 1]);
  assert.equal(plan.awbLines[2].assignedDriverId, "a");
  assert.equal(plan.awbLines[3].assignedDriverId, "c");
});

test("refuses unfinished lines, no driver, the same driver and unknown lines", () => {
  assert.equal(planReassignCompleted([{ status: "in_progress", assignedDriverId: "a" }], 0, "b", "B").ok, false);
  assert.equal(planReassignCompleted([done("1", "a", "t1")], 0, null, null).ok, false);
  assert.equal(planReassignCompleted([done("1", "a", "t1")], 0, "a", "A").ok, false);
  assert.equal(planReassignCompleted([done("1", "a", "t1")], 5, "b", "B").ok, false);
});

test("a completed line without a trip log still moves alone", () => {
  const plan = planReassignCompleted([done("1", "a", undefined), done("2", "a", undefined)], 0, "b", "Bea");
  assert.deepEqual(plan.indexes, [0]);
});

test("the trip log follows the driver unless it was already paid", () => {
  const ok = planReassignTripLog({ paid: false, driverName: "A" }, { id: "b", name: "Bea", email: "b@x.com" });
  assert.deepEqual(ok.update, { driverId: "b", driverName: "Bea", driverEmail: "b@x.com" });
  const paid = planReassignTripLog({ paid: true, driverName: "A" }, { id: "b", name: "Bea" });
  assert.equal(paid.ok, false);
  assert.match(paid.message, /already paid to A/);
  assert.equal(planReassignTripLog(null, { id: "b", name: "Bea" }).update, null);
});

test("a completed trip handed to a driver does not send them a new-AWB notice", () => {
  const before = [done("1", "a", "t1")];
  const after = [done("1", "b", "t1")];
  assert.deepEqual(driversGainingAwbLines(before, after), []);
  // an assignment that is still open does notify
  assert.deepEqual(driversGainingAwbLines([{ awbNumber: "1", status: "submitted" }], [{ awbNumber: "1", assignedDriverId: "b", status: "assigned" }]), ["b"]);
});
