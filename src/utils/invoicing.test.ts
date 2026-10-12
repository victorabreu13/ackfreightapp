import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AwbLine, AwbLineStatus, newAwbLine, TripRequest } from "../types";
import { pendingInvoiceRequests } from "./dispatchBoard";
import { canMarkInvoiced, canUndoInvoiced, markInvoicedUpdate, notInvoicedStatus } from "./invoicing";
import { tripStage } from "./tripStatus";

function line(status: AwbLineStatus): AwbLine {
  return { ...newAwbLine(), status, assignedDriverId: "d1", assignedDriverName: "Driver" };
}

function req(id: string, status: TripRequest["status"], lines: AwbLine[], extra: Partial<TripRequest> = {}): TripRequest {
  return { id, status, awbLines: lines, tripDate: "2026-10-01", ...extra } as TripRequest;
}

describe("canMarkInvoiced", () => {
  it("allows every delivered trip, even when the stored rollup is stale", () => {
    assert.equal(canMarkInvoiced(req("a", "completed", [line("completed")])), true);
    assert.equal(canMarkInvoiced(req("b", "in_progress", [line("completed"), line("completed")])), true);
  });

  it("refuses open, cancelled and already-invoiced trips", () => {
    assert.equal(canMarkInvoiced(req("c", "in_progress", [line("completed"), line("picked_up")])), false);
    assert.equal(canMarkInvoiced(req("d", "cancelled", [line("completed")])), false);
    assert.equal(canMarkInvoiced(req("e", "invoiced", [line("completed")])), false);
  });

  it("matches the Pending invoice / To Invoice list exactly", () => {
    const all = [
      req("a", "completed", [line("completed")]),
      req("b", "in_progress", [line("completed")]),
      req("c", "in_progress", [line("picked_up")]),
      req("e", "invoiced", [line("completed")]),
    ];
    assert.deepEqual(
      pendingInvoiceRequests(all).map((r) => r.id),
      all.filter(canMarkInvoiced).map((r) => r.id)
    );
  });
});

describe("marking and undoing", () => {
  it("a marked trip shows as Invoiced and leaves Pending invoice", () => {
    const before = req("a", "in_progress", [line("completed")]);
    const after = { ...before, ...markInvoicedUpdate(123) };
    assert.equal(after.status, "invoiced");
    assert.equal(after.invoicedAt, 123);
    assert.equal(tripStage(after), "invoiced");
    assert.deepEqual(pendingInvoiceRequests([after]), []);
  });

  it("undo goes back to the AWB rollup (completed) and returns to Pending invoice", () => {
    const invoiced = req("a", "invoiced", [line("completed")], { invoicedAt: 1 });
    assert.equal(notInvoicedStatus(invoiced), "completed");
    const back = { ...invoiced, status: notInvoicedStatus(invoiced) };
    assert.deepEqual(pendingInvoiceRequests([back]).map((r) => r.id), ["a"]);
  });

  it("undo only for manual invoices, and only when enabled", () => {
    const manual = req("a", "invoiced", [line("completed")]);
    const qb = req("b", "invoiced", [line("completed")], { quickbooksInvoiceId: "99" });
    assert.equal(canUndoInvoiced(manual, true), true);
    assert.equal(canUndoInvoiced(qb, true), false);
    assert.equal(canUndoInvoiced(manual, false), false);
    assert.equal(canUndoInvoiced(req("c", "completed", [line("completed")]), true), false);
  });
});
