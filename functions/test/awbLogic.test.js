const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  applyAssignment,
  applyComplete,
  applyStart,
  driversGainingAwbLines,
} = require("../awbLogic");

function line(overrides) {
  return {
    awbNumber: "123",
    qtyPieces: 1,
    type: "AKE",
    kilograms: 10,
    assignedDriverId: null,
    assignedDriverName: null,
    status: "submitted",
    ...overrides,
  };
}

describe("applyAssignment", () => {
  it("assigns one line and rolls the request up to assigned", () => {
    const result = applyAssignment(
      [line({ awbNumber: "111" }), line({ awbNumber: "222" })],
      1,
      "drv1",
      "Dee"
    );
    assert.equal(result.awbLines[0].status, "submitted");
    assert.equal(result.awbLines[1].status, "assigned");
    assert.equal(result.awbLines[1].assignedDriverId, "drv1");
    assert.deepEqual(result.assignedDriverIds, ["drv1"]);
    assert.equal(result.status, "assigned");
    assert.equal(result.previousDriverId, null);
  });

  it("clears a line back to submitted and drops that driver from the rollup", () => {
    const result = applyAssignment(
      [line({ awbNumber: "111", assignedDriverId: "drv1", assignedDriverName: "Dee", status: "assigned" })],
      0,
      null,
      null
    );
    assert.equal(result.awbLines[0].status, "submitted");
    assert.equal(result.awbLines[0].assignedDriverId, null);
    assert.deepEqual(result.assignedDriverIds, []);
    assert.equal(result.status, "submitted");
    assert.equal(result.previousDriverId, "drv1");
  });
});

describe("applyStart", () => {
  it("starts only the caller's assigned lines", () => {
    const lines = [
      line({ assignedDriverId: "drv1", assignedDriverName: "Dee", status: "assigned", awbNumber: "111" }),
      line({ assignedDriverId: "drv2", assignedDriverName: "Sam", status: "assigned", awbNumber: "222" }),
      line({ awbNumber: "333" }),
    ];
    const result = applyStart(lines, "drv1", 50);
    assert.equal(result.changed, true);
    assert.equal(result.awbLines[0].status, "in_progress");
    assert.equal(result.awbLines[0].startedAt, 50);
    assert.equal(result.awbLines[1].status, "assigned");
    assert.equal(result.awbLines[2].status, "submitted");
    assert.equal(result.status, "in_progress");
  });

  it("does not start another driver's lines", () => {
    const result = applyStart(
      [line({ assignedDriverId: "drv2", assignedDriverName: "Sam", status: "assigned" })],
      "drv1",
      50
    );
    assert.equal(result.changed, false);
    assert.equal(result.awbLines[0].status, "assigned");
  });
});

describe("applyComplete", () => {
  it("completes only the selected in-progress lines for that driver", () => {
    const lines = [
      line({ assignedDriverId: "drv1", assignedDriverName: "Dee", status: "in_progress", awbNumber: "111" }),
      line({ assignedDriverId: "drv1", assignedDriverName: "Dee", status: "in_progress", awbNumber: "222" }),
      line({ assignedDriverId: "drv2", assignedDriverName: "Sam", status: "in_progress", awbNumber: "333" }),
    ];
    const result = applyComplete(lines, "drv1", new Set([0]), "trip-1");
    assert.equal(result.changed, true);
    assert.equal(result.awbLines[0].status, "completed");
    assert.equal(result.awbLines[0].tripLogId, "trip-1");
    assert.equal(result.awbLines[1].status, "in_progress");
    assert.equal(result.awbLines[2].status, "in_progress");
    assert.equal(result.status, "in_progress");
  });

  it("rolls the request up to completed when every line is done", () => {
    const lines = [
      line({ assignedDriverId: "drv1", assignedDriverName: "Dee", status: "in_progress" }),
    ];
    const result = applyComplete(lines, "drv1", new Set([0]), "trip-9");
    assert.equal(result.status, "completed");
  });

  it("refuses lines that are not in progress for this driver", () => {
    const result = applyComplete(
      [line({ assignedDriverId: "drv1", assignedDriverName: "Dee", status: "assigned" })],
      "drv1",
      new Set([0]),
      "trip-1"
    );
    assert.equal(result.changed, false);
  });
});

describe("driversGainingAwbLines", () => {
  it("notifies drivers already assigned on a newly created request", () => {
    const after = [
      line({ awbNumber: "111", assignedDriverId: "drv1", assignedDriverName: "Dee", status: "assigned" }),
    ];
    assert.deepEqual(driversGainingAwbLines([], after), ["drv1"]);
  });

  it("notifies a driver who gains another AWB without being new on the request", () => {
    const before = [
      line({ awbNumber: "111", assignedDriverId: "drv1", assignedDriverName: "Dee", status: "assigned" }),
      line({ awbNumber: "222" }),
    ];
    const after = [
      line({ awbNumber: "111", assignedDriverId: "drv1", assignedDriverName: "Dee", status: "assigned" }),
      line({ awbNumber: "222", assignedDriverId: "drv1", assignedDriverName: "Dee", status: "assigned" }),
    ];
    assert.deepEqual(driversGainingAwbLines(before, after), ["drv1"]);
  });

  it("does not notify when a driver only starts or completes a line", () => {
    const before = [
      line({ awbNumber: "111", assignedDriverId: "drv1", assignedDriverName: "Dee", status: "assigned" }),
    ];
    const after = [
      line({
        awbNumber: "111",
        assignedDriverId: "drv1",
        assignedDriverName: "Dee",
        status: "in_progress",
        startedAt: 10,
      }),
    ];
    assert.deepEqual(driversGainingAwbLines(before, after), []);
  });

  it("notifies only the driver who received a reassigned line", () => {
    const before = [
      line({ awbNumber: "111", assignedDriverId: "drv1", assignedDriverName: "Dee", status: "assigned" }),
    ];
    const after = [
      line({ awbNumber: "111", assignedDriverId: "drv2", assignedDriverName: "Sam", status: "assigned" }),
    ];
    assert.deepEqual(driversGainingAwbLines(before, after), ["drv2"]);
  });
});
