import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AwbLine } from "../types";
import { applyAwbAssignment } from "./awbMutations";

function line(overrides: Partial<AwbLine> = {}): AwbLine {
  return {
    awbNumber: "123",
    qtyPieces: 1,
    type: "AKE",
    kilograms: 10,
    awbFile: null,
    loaFile: null,
    doFile: null,
    assignedDriverId: null,
    assignedDriverName: null,
    status: "submitted",
    priority: "Normal",
    ...overrides,
  };
}

describe("applyAwbAssignment", () => {
  it("assigns a single line without touching the others", () => {
    const result = applyAwbAssignment(
      [line({ awbNumber: "111" }), line({ awbNumber: "222", kilograms: 4 })],
      0,
      "drv1",
      "Dee"
    );
    assert.equal(result.awbLines[0].assignedDriverId, "drv1");
    assert.equal(result.awbLines[0].status, "assigned");
    assert.equal(result.awbLines[1].status, "submitted");
    assert.equal(result.awbLines[1].kilograms, 4);
    assert.deepEqual(result.assignedDriverIds, ["drv1"]);
    assert.equal(result.status, "assigned");
  });

  it("resets a reassigned in-progress line to assigned for the new driver", () => {
    const result = applyAwbAssignment(
      [
        line({
          assignedDriverId: "drv1",
          assignedDriverName: "Dee",
          status: "in_progress",
          startedAt: 10,
        }),
      ],
      0,
      "drv2",
      "Sam"
    );
    assert.equal(result.previousDriverId, "drv1");
    assert.equal(result.awbLines[0].assignedDriverId, "drv2");
    assert.equal(result.awbLines[0].status, "assigned");
    assert.deepEqual(result.assignedDriverIds, ["drv2"]);
  });
});
