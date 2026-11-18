import assert from "node:assert/strict";
import test from "node:test";
import { chargeToLargest, costModeFrom, dayText, ruleCost, ruleOf, tableFor, tableLabel, type CostRule } from "@/lib/guias/acct-costs";

const ack: CostRule = { mode: "per_trip", tripCost: 40, baseCost: null, basePallets: null, stepCost: null, stepPallets: null };
const rl: CostRule = { mode: "tiered", tripCost: null, baseCost: 50, basePallets: 4, stepCost: 10, stepPallets: 2 };
const manual: CostRule = { mode: "manual", tripCost: null, baseCost: null, basePallets: null, stepCost: null, stepPallets: null };

test("ACK TEAM LLC charges one price for the trip", () => {
  assert.equal(ruleCost(ack, 1), 40);
  assert.equal(ruleCost(ack, 12), 40);
});

test("RL Services: 50 for the first 4 pallets, then 10 for each 2 more, or for 1 left over", () => {
  assert.equal(ruleCost(rl, 1), 50);
  assert.equal(ruleCost(rl, 4), 50);
  assert.equal(ruleCost(rl, 5), 60);
  assert.equal(ruleCost(rl, 6), 60);
  assert.equal(ruleCost(rl, 7), 70);
  assert.equal(ruleCost(rl, 8), 70);
  assert.equal(ruleCost(rl, 9), 80);
});

test("a manual rule, a missing price or no pallets has no cost to give", () => {
  assert.equal(ruleCost(manual, 5), null);
  assert.equal(ruleCost({ ...ack, tripCost: null }, 5), null);
  assert.equal(ruleCost(rl, 0), null);
  assert.equal(ruleCost({ ...rl, baseCost: null }, 5), null);
});

test("the biggest guía of a trip carries its whole cost and the others none", () => {
  const trip = [{ id: "a", weight: 400 }, { id: "b", weight: 1200 }, { id: "c", weight: 300 }];
  assert.deepEqual([...chargeToLargest(trip, 40)], [["a", 0], ["b", 40], ["c", 0]]);
  // A tie goes to the first one listed.
  assert.deepEqual([...chargeToLargest([{ id: "x", weight: 500 }, { id: "y", weight: 500 }], 40)], [["x", 40], ["y", 0]]);
  assert.deepEqual([...chargeToLargest([], 40)], []);
});

test("a shipment uses the newest rate table that starts on or before its date", () => {
  const starts = [new Date("2026-01-01"), new Date("2026-09-01"), new Date("2026-10-01")];
  assert.equal(dayText(tableFor(starts, new Date("2026-10-15"))!), "2026-10-01");
  assert.equal(dayText(tableFor(starts, new Date("2026-10-01"))!), "2026-10-01");
  assert.equal(dayText(tableFor(starts, new Date("2026-09-30"))!), "2026-09-01");
  assert.equal(tableFor(starts, new Date("2025-12-31")), null);
  assert.equal(tableFor([], new Date("2026-10-15")), null);
});

test("table names, modes and provider rules", () => {
  assert.equal(tableLabel(new Date("2026-10-01")), "From Oct 2026");
  assert.equal(costModeFrom("tiered"), "tiered");
  assert.equal(costModeFrom("per_trip"), "per_trip");
  assert.equal(costModeFrom("anything"), "manual");
  const provider = { pickupMode: "per_trip", pickupTripCost: 40, pickupBaseCost: null, pickupBasePallets: null, pickupStepCost: null, pickupStepPallets: null, transferMode: "manual", transferTripCost: null, transferBaseCost: null, transferBasePallets: null, transferStepCost: null, transferStepPallets: null };
  assert.equal(ruleCost(ruleOf(provider, "pickup"), 3), 40);
  assert.equal(ruleCost(ruleOf(provider, "transfer"), 3), null);
});
