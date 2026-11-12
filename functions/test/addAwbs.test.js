const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanNewLines, defaultDriver, sameRequestDuplicates, planAddLines, canAdd } = require("../addAwbs");

const line = (n, driver, status) => ({
  awbNumber: n,
  assignedDriverId: driver || null,
  assignedDriverName: driver ? driver.toUpperCase() : null,
  status: status || (driver ? "assigned" : "submitted"),
});

test("cleans what was typed and refuses bad rows", () => {
  const ok = cleanNewLines([{ awbNumber: " 045-1111 ", qtyPieces: "3", kilograms: "12.5", type: "PMC", hazmat: true, unNumber: "UN3481" }]);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.lines[0], { awbNumber: "045-1111", qtyPieces: 3, type: "PMC", kilograms: 12.5, hazmat: true, unNumber: "UN3481" });
  assert.equal(cleanNewLines([]).ok, false);
  assert.equal(cleanNewLines([{ awbNumber: "", qtyPieces: 1, kilograms: 1 }]).ok, false);
  assert.equal(cleanNewLines([{ awbNumber: "1", qtyPieces: 0, kilograms: 1 }]).ok, false);
  assert.equal(cleanNewLines([{ awbNumber: "1", qtyPieces: 1, kilograms: 0 }]).ok, false);
  const twice = cleanNewLines([
    { awbNumber: "045-1", qtyPieces: 1, kilograms: 1 },
    { awbNumber: "0451", qtyPieces: 1, kilograms: 1 },
  ]);
  assert.equal(twice.ok, false);
  assert.match(twice.message, /twice/);
  const loose = cleanNewLines([{ awbNumber: "1", qtyPieces: 1, kilograms: 1, type: "nonsense", hazmat: false, unNumber: "UN1" }]);
  assert.equal(loose.lines[0].type, "Loose");
  assert.equal(loose.lines[0].unNumber, null);
});

test("new AWBs follow the request's single driver, otherwise they stay open", () => {
  assert.deepEqual(defaultDriver([line("1", "a"), line("2", "a", "completed")]), { id: "a", name: "A" });
  assert.equal(defaultDriver([line("1", "a"), line("2", "b")]), null);
  assert.equal(defaultDriver([line("1")]), null);
});

test("the AWB already on this request is named, in any spelling", () => {
  assert.deepEqual(sameRequestDuplicates([line("045-1111")], [{ awbNumber: "0451111" }, { awbNumber: "9" }]), ["0451111"]);
});

test("adds the lines at the end, assigned to the driver, and rolls the status up", () => {
  const plan = planAddLines([line("1", "a", "completed")], [{ awbNumber: "2", qtyPieces: 1, kilograms: 5, type: "Loose", hazmat: false, unNumber: null }], { id: "a", name: "A" });
  assert.equal(plan.awbLines.length, 2);
  assert.equal(plan.firstNewIndex, 1);
  assert.equal(plan.awbLines[1].status, "assigned");
  assert.equal(plan.awbLines[1].assignedDriverId, "a");
  assert.equal(plan.awbLines[1].awbFile, null);
  assert.equal(plan.status, "in_progress");
  const open = planAddLines([line("1")], [{ awbNumber: "2", qtyPieces: 1, kilograms: 5, type: "Loose", hazmat: false, unNumber: null }], null);
  assert.equal(open.awbLines[1].status, "submitted");
  assert.equal(open.awbLines[1].assignedDriverId, null);
});

test("who may add: admins, and the owning customer until the trip is completed", () => {
  const req = { customerId: "c1", status: "assigned" };
  assert.equal(canAdd(req, "admin", "x").ok, true);
  assert.equal(canAdd(req, "customer", "c1").ok, true);
  assert.equal(canAdd(req, "customer", "c2").ok, false);
  assert.equal(canAdd(req, "driver", "d1").ok, false);
  assert.equal(canAdd({ ...req, status: "completed" }, "customer", "c1").ok, false);
  assert.equal(canAdd({ ...req, status: "completed" }, "admin", "x").ok, true);
  assert.equal(canAdd({ ...req, status: "cancelled" }, "admin", "x").ok, false);
  assert.equal(canAdd({ ...req, status: "invoiced" }, "admin", "x").ok, false);
  assert.equal(canAdd({ ...req, status: "in_progress" }, "customer", "c1").ok, true);
  assert.equal(canAdd(null, "admin", "x").ok, false);
});
