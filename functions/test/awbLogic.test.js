const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  applyAcceptAssigned,
  applyAssignment,
  applyBoardAccept,
  applyComplete,
  applyDecline,
  applyPickup,
  applyStart,
  driversGainingAwbLines,
  linesEnteringStatus,
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
  it("starts only the caller's accepted lines", () => {
    const lines = [
      line({ assignedDriverId: "drv1", assignedDriverName: "Dee", status: "accepted", awbNumber: "111" }),
      line({ assignedDriverId: "drv2", assignedDriverName: "Sam", status: "accepted", awbNumber: "222" }),
      line({ awbNumber: "333" }),
    ];
    const result = applyStart(lines, "drv1", 50);
    assert.equal(result.changed, true);
    assert.equal(result.awbLines[0].status, "in_progress");
    assert.equal(result.awbLines[0].startedAt, 50);
    assert.equal(result.awbLines[1].status, "accepted");
    assert.equal(result.awbLines[2].status, "submitted");
    assert.equal(result.status, "in_progress");
  });

  it("does not start another driver's lines", () => {
    const result = applyStart(
      [line({ assignedDriverId: "drv2", assignedDriverName: "Sam", status: "accepted" })],
      "drv1",
      50
    );
    assert.equal(result.changed, false);
    assert.equal(result.awbLines[0].status, "accepted");
  });

  it("starts a line that is assigned but not yet accepted (accept is optional)", () => {
    const result = applyStart(
      [line({ assignedDriverId: "drv1", assignedDriverName: "Dee", status: "assigned" })],
      "drv1",
      50
    );
    assert.equal(result.changed, true);
    assert.equal(result.awbLines[0].status, "in_progress");
    assert.equal(result.awbLines[0].startedAt, 50);
  });
});

describe("applyComplete", () => {
  it("completes only the selected picked-up lines for that driver", () => {
    const lines = [
      line({ assignedDriverId: "drv1", assignedDriverName: "Dee", status: "picked_up", awbNumber: "111" }),
      line({ assignedDriverId: "drv1", assignedDriverName: "Dee", status: "picked_up", awbNumber: "222" }),
      line({ assignedDriverId: "drv2", assignedDriverName: "Sam", status: "picked_up", awbNumber: "333" }),
    ];
    const result = applyComplete(lines, "drv1", new Set([0]), "trip-1");
    assert.equal(result.changed, true);
    assert.equal(result.awbLines[0].status, "completed");
    assert.equal(result.awbLines[0].tripLogId, "trip-1");
    assert.equal(result.awbLines[1].status, "picked_up");
    assert.equal(result.awbLines[2].status, "picked_up");
    assert.equal(result.status, "in_progress");
  });

  it("rolls the request up to completed when every line is done", () => {
    const lines = [
      line({ assignedDriverId: "drv1", assignedDriverName: "Dee", status: "picked_up" }),
    ];
    const result = applyComplete(lines, "drv1", new Set([0]), "trip-9");
    assert.equal(result.status, "completed");
  });

  it("completes an in-progress line directly (pickup is optional)", () => {
    const result = applyComplete(
      [line({ assignedDriverId: "drv1", assignedDriverName: "Dee", status: "in_progress" })],
      "drv1",
      new Set([0]),
      "trip-1"
    );
    assert.equal(result.changed, true);
    assert.equal(result.awbLines[0].status, "completed");
    assert.equal(result.awbLines[0].tripLogId, "trip-1");
  });

  it("refuses lines that were never started for this driver", () => {
    const result = applyComplete(
      [line({ assignedDriverId: "drv1", assignedDriverName: "Dee", status: "assigned" })],
      "drv1",
      new Set([0]),
      "trip-1"
    );
    assert.equal(result.changed, false);
    assert.equal(result.awbLines[0].status, "assigned");
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

  it("does not notify a driver who accepted an open AWB themselves", () => {
    const before = [line({ awbNumber: "111" })];
    const after = [
      line({
        awbNumber: "111",
        assignedDriverId: "drv1",
        assignedDriverName: "Dee",
        status: "accepted",
      }),
    ];
    assert.deepEqual(driversGainingAwbLines(before, after), []);
  });
});

describe("board accept race", () => {
  it("gives the line to the first accept and rejects the second", () => {
    const open = [line({ awbNumber: "111" }), line({ awbNumber: "222", assignedDriverId: "drv9", status: "assigned" })];
    const first = applyBoardAccept(open, 0, "drv1", "Dee", 10);
    assert.equal(first.ok, true);
    assert.equal(first.awbLines[0].status, "accepted");
    assert.equal(first.awbLines[0].assignedDriverId, "drv1");
    assert.equal(first.awbLines[0].acceptedAt, 10);
    assert.deepEqual(first.assignedDriverIds.sort(), ["drv1", "drv9"]);

    const second = applyBoardAccept(first.awbLines, 0, "drv2", "Sam", 11);
    assert.equal(second.ok, false);
    assert.equal(second.reason, "taken");
    assert.equal(second.awbLines[0].assignedDriverId, "drv1");
    assert.equal(second.awbLines[0].status, "accepted");
  });

  it("rejects an accept when dispatch already assigned the line", () => {
    const result = applyBoardAccept(
      [line({ awbNumber: "111", assignedDriverId: "drv1", assignedDriverName: "Dee", status: "assigned" })],
      0,
      "drv2",
      "Sam",
      10
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "taken");
  });
});

describe("accept and decline", () => {
  it("accepts a dispatch assignment and then allows start", () => {
    const assigned = [
      line({ awbNumber: "111", assignedDriverId: "drv1", assignedDriverName: "Dee", status: "assigned" }),
    ];
    const accepted = applyAcceptAssigned(assigned, 0, "drv1", 20);
    assert.equal(accepted.changed, true);
    assert.equal(accepted.awbLines[0].status, "accepted");
    const started = applyStart(accepted.awbLines, "drv1", 30);
    assert.equal(started.changed, true);
    assert.equal(started.awbLines[0].status, "in_progress");
    assert.equal(started.awbLines[0].startedAt, 30);
  });

  it("declines an assignment back onto the board", () => {
    const result = applyDecline(
      [line({ awbNumber: "111", assignedDriverId: "drv1", assignedDriverName: "Dee", status: "assigned" })],
      0,
      "drv1"
    );
    assert.equal(result.changed, true);
    assert.equal(result.awbLines[0].status, "submitted");
    assert.equal(result.awbLines[0].assignedDriverId, null);
    assert.equal(result.status, "submitted");
    assert.equal(result.awbNumber, "111");
  });

  it("declines an accepted line before start and refuses a decline after start", () => {
    const accepted = applyDecline(
      [line({ awbNumber: "111", assignedDriverId: "drv1", assignedDriverName: "Dee", status: "accepted", acceptedAt: 5 })],
      0,
      "drv1"
    );
    assert.equal(accepted.changed, true);
    assert.equal(accepted.awbLines[0].acceptedAt, undefined);

    const started = applyDecline(
      [line({ awbNumber: "111", assignedDriverId: "drv1", assignedDriverName: "Dee", status: "in_progress" })],
      0,
      "drv1"
    );
    assert.equal(started.changed, false);
    assert.equal(started.awbLines[0].status, "in_progress");
  });

  it("does not let another driver decline the assignment", () => {
    const result = applyDecline(
      [line({ awbNumber: "111", assignedDriverId: "drv1", assignedDriverName: "Dee", status: "assigned" })],
      0,
      "drv2"
    );
    assert.equal(result.changed, false);
  });
});

describe("status transitions", () => {
  it("moves accepted to in progress to picked up to completed", () => {
    const accepted = [
      line({ awbNumber: "111", assignedDriverId: "drv1", assignedDriverName: "Dee", status: "accepted" }),
    ];
    const started = applyStart(accepted, "drv1", 1);
    const picked = applyPickup(started.awbLines, "drv1", new Set([0]), 2);
    assert.equal(picked.changed, true);
    assert.equal(picked.awbLines[0].status, "picked_up");
    assert.equal(picked.awbLines[0].pickedUpAt, 2);
    assert.equal(picked.status, "in_progress");
    const done = applyComplete(picked.awbLines, "drv1", new Set([0]), "trip-1");
    assert.equal(done.awbLines[0].status, "completed");
    assert.equal(done.status, "completed");
    assert.deepEqual(
      linesEnteringStatus(started.awbLines, picked.awbLines, "picked_up").map((l) => l.awbNumber),
      ["111"]
    );
    assert.deepEqual(linesEnteringStatus(accepted, started.awbLines, "in_progress").map((l) => l.awbNumber), [
      "111",
    ]);
  });

  it("does not pick up a line that has not been started", () => {
    const result = applyPickup(
      [line({ assignedDriverId: "drv1", assignedDriverName: "Dee", status: "accepted" })],
      "drv1",
      new Set([0]),
      2
    );
    assert.equal(result.changed, false);
  });
});
