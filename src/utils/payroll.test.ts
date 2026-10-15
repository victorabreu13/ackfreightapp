import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { payrollSummary } from "./payroll";

const trip = (date: string, paid = false, extra = {}) => ({ date, paid, kilograms: 100, unitTypes: [] as any[], ...extra });

describe("payrollSummary with a daily minimum", () => {
  it("tops a short day up to the minimum", () => {
    const r = payrollSummary([trip("2026-10-14"), trip("2026-10-14")], "perTrip", 40, 180);
    assert.equal(r.unpaid, 180); // 2 trips = $80, topped up to $180
    assert.deepEqual(r.topUps.map((t) => [t.date, t.earned, t.topUp]), [["2026-10-14", 80, 100]]);
  });

  it("does not top up a day that reaches the minimum", () => {
    const five = Array.from({ length: 5 }, () => trip("2026-10-14"));
    const r = payrollSummary(five, "perTrip", 40, 180); // 5 x 40 = 200
    assert.equal(r.unpaid, 200);
    assert.equal(r.topUps.length, 0);
  });

  it("only counts days that have trips", () => {
    const r = payrollSummary([trip("2026-10-14"), trip("2026-10-16")], "perTrip", 40, 180);
    assert.equal(r.unpaid, 360); // two worked days, each topped to 180; no pay for 10-15
  });

  it("moves a day's top-up to paid once all its trips are paid", () => {
    const r = payrollSummary([trip("2026-10-14", true), trip("2026-10-15", false)], "perTrip", 40, 180);
    assert.equal(r.paid, 180);
    assert.equal(r.unpaid, 180);
    const mixed = payrollSummary([trip("2026-10-14", true), trip("2026-10-14", false)], "perTrip", 40, 180);
    assert.equal(mixed.paid, 40);
    assert.equal(mixed.unpaid, 140 + 0); // unpaid trip 40 + top-up 100 while the day isn't fully paid
  });

  it("applies the minimum even when no per-trip rate is set", () => {
    const r = payrollSummary([trip("2026-10-14")], undefined, undefined, 180);
    assert.equal(r.unpaid, 180);
  });

  it("is unchanged without a daily minimum", () => {
    const r = payrollSummary([trip("2026-10-14")], "perTrip", 40, undefined);
    assert.equal(r.unpaid, 40);
    assert.equal(r.topUps.length, 0);
  });
});
