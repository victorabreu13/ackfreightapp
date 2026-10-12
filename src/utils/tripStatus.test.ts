import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AwbLine, AwbLineStatus, newAwbLine, TripRequest } from "../types";
import { allAssignedConfirmed, lineStage, tripStage, TRIP_STAGES, unassignedCount } from "./tripStatus";

function line(status: AwbLineStatus, driver: string | null = status === "submitted" ? null : "d1"): AwbLine {
  return { ...newAwbLine(), status, assignedDriverId: driver, assignedDriverName: driver ? "Driver" : null };
}

function req(status: TripRequest["status"], lines: AwbLine[]) {
  return { status, awbLines: lines };
}

describe("lineStage", () => {
  it("maps every AWB line status to one stage", () => {
    assert.equal(lineStage(line("submitted")), "requested");
    assert.equal(lineStage(line("assigned")), "assigned");
    assert.equal(lineStage(line("accepted")), "assigned");
    assert.equal(lineStage(line("in_progress")), "to_pickup");
    assert.equal(lineStage(line("picked_up")), "in_transit");
    assert.equal(lineStage(line("completed")), "delivered");
  });
});

describe("tripStage", () => {
  it("uses the request rollup for cancelled and invoiced", () => {
    assert.equal(tripStage(req("cancelled", [line("picked_up")])), "cancelled");
    assert.equal(tripStage(req("invoiced", [line("completed")])), "invoiced");
  });

  it("is delivered only when every AWB is completed", () => {
    assert.equal(tripStage(req("completed", [line("completed"), line("completed")])), "delivered");
    assert.equal(tripStage(req("in_progress", [line("completed"), line("picked_up")])), "in_transit");
  });

  it("prefers To Pickup over In Transit while any freight is still to collect", () => {
    assert.equal(tripStage(req("in_progress", [line("in_progress"), line("picked_up")])), "to_pickup");
  });

  it("shows a moving trip as moving even if another AWB has no driver", () => {
    const r = req("in_progress", [line("submitted"), line("picked_up")]);
    assert.equal(tripStage(r), "in_transit");
    assert.equal(unassignedCount(r), 1);
  });

  it("is assigned when lines are assigned/accepted and nothing has started", () => {
    assert.equal(tripStage(req("assigned", [line("assigned"), line("accepted")])), "assigned");
    assert.equal(tripStage(req("assigned", [line("assigned"), line("submitted")])), "assigned");
  });

  it("is requested when no AWB has a driver", () => {
    assert.equal(tripStage(req("submitted", [line("submitted")])), "requested");
  });

  it("falls back to the rollup when there are no AWB lines", () => {
    assert.equal(tripStage(req("completed", [])), "delivered");
    assert.equal(tripStage(req("submitted", [])), "requested");
  });

  it("has a label and color for every stage", () => {
    for (const info of Object.values(TRIP_STAGES)) {
      assert.ok(info.label);
      assert.match(info.color, /^#[0-9a-f]{6}$/i);
    }
  });
});

describe("allAssignedConfirmed", () => {
  it("is true only when every waiting line was accepted", () => {
    assert.equal(allAssignedConfirmed(req("assigned", [line("accepted")])), true);
    assert.equal(allAssignedConfirmed(req("assigned", [line("accepted"), line("assigned")])), false);
    assert.equal(allAssignedConfirmed(req("submitted", [line("submitted")])), false);
  });
});
