import assert from "node:assert/strict";
import test from "node:test";
import { airlineOfAwb, cents, jobCost, linesFor, matchProvider, NO_RULES, totalsOf, tripShares, uldsFromBup, uldText, type ClientRules, type EngineInput } from "@/lib/guias/acct-engine";

const pacifiko: ClientRules = { kopeHandlingPct: 10, kopeInCost: true, pickupPerKg: 0.15, handlingPerKg: 0.2, transferPerKg: 0.15, chargeBasis: "gross", insuranceCostPct: 0.35, insuranceSoldPct: 0.5, awbFee: 50, flatSellPerKg: null };
const justine: ClientRules = { ...NO_RULES, pickupPerKg: 0.1, handlingPerKg: 0.1, transferPerKg: 0.1, awbFee: 45 };
const minimums = { pickup: 75, handling: 75, transfer: 75 };

const base = (over: Partial<EngineInput>): EngineInput => ({
  rules: pacifiko, gross: 504.5, chw: 600.17, cargoValue: 0, lane: { cost: 1.12, sell: 1.58 }, ulds: [{ type: "DQF", qty: 1 }], uldHandling: { DQF: 45, FQA: 35, PAG: 50, LOOSE: 0 },
  minimums, pickupCost: 50, transferCost: 50, aes: 0, ...over,
});

test("cents rounds a half cent up the way the Sheet did", () => {
  assert.equal(cents(75.675), 75.68);
  assert.equal(cents(0.15 * 504.5), 75.68);
  assert.equal(cents(1.005), 1.01);
  assert.equal(cents(2.5), 2.5);
});

test("PACIFIKO: pickup, handling and transfer on the gross weight, from a real November shipment", () => {
  const lines = linesFor(base({}));
  assert.equal(lines.airCost, 672.19);
  assert.equal(lines.airSold, 948.27);
  assert.equal(lines.pickupSold, 75.68);
  assert.equal(lines.handlingSold, 100.9);
  assert.equal(lines.transferSold, 75.68);
  assert.equal(lines.awbFee, 50);
  assert.equal(lines.kopeHandling, 60.02);
  const totals = totalsOf(lines, true);
  // Cost: air 672.19, pickup 50, handling 45, transfer 50, Kope 60.02.
  assert.equal(totals.costTotal, 877.21);
  assert.equal(totals.invoiced, 1250.53);
  assert.equal(totals.profit, 373.32);
});

test("the minimum of $75 applies when the charge by weight is less", () => {
  const small = linesFor(base({ gross: 151, chw: 261.31 }));
  assert.equal(small.pickupSold, 75);
  assert.equal(small.handlingSold, 75);
  assert.equal(small.transferSold, 75);
  const big = linesFor(base({ gross: 1018, chw: 1550.36 }));
  assert.equal(big.pickupSold, 152.7);
  assert.equal(big.handlingSold, 203.6);
});

test("JUSTINE is charged on the chargeable weight, and a client with no rate pays none of the three", () => {
  const lines = linesFor(base({ rules: justine, gross: 1705.05, chw: 1859.83, lane: null }));
  assert.equal(lines.pickupSold, 185.98);
  assert.equal(lines.handlingSold, 185.98);
  assert.equal(lines.transferSold, 185.98);
  assert.equal(lines.awbFee, 45);
  const none = linesFor(base({ rules: NO_RULES }));
  assert.equal(none.pickupSold, 0);
  assert.equal(none.handlingSold, 0);
  assert.equal(none.transferSold, 0);
});

test("a flat sell rate takes the place of the rate table, and the insurance follows the cargo value", () => {
  const flat = linesFor(base({ rules: { ...NO_RULES, flatSellPerKg: 2.45 }, chw: 1000, lane: { cost: 2.1, sell: 2.3 } }));
  assert.equal(flat.airSold, 2450);
  assert.equal(flat.airCost, 2100);
  const insured = linesFor(base({ cargoValue: 32334.13 }));
  assert.equal(insured.insuranceCost, 113.17);
  assert.equal(insured.insuranceSold, 161.67);
});

test("Kope handling counts as cost only when the client says so, and an invoice typed by hand wins", () => {
  const lines = linesFor(base({}));
  assert.ok(totalsOf(lines, true).costTotal > totalsOf(lines, false).costTotal);
  assert.equal(totalsOf(lines, true, 5000).invoiced, 5000);
  assert.equal(totalsOf(lines, true, 5000).profit, 5000 - totalsOf(lines, true).costTotal);
});

test("handling is the ULDs times their price, and a loose shipment has none", () => {
  assert.equal(linesFor(base({ ulds: [{ type: "PAG", qty: 1 }, { type: "DQF", qty: 1 }] })).handlingCost, 95);
  assert.equal(linesFor(base({ ulds: [{ type: "FQA", qty: 2 }] })).handlingCost, 70);
  assert.equal(linesFor(base({ ulds: [] })).handlingCost, 0);
  assert.equal(linesFor(base({ ulds: [{ type: "XYZ", qty: 1 }] })).handlingCost, 0);
});

test("the airline comes from the AWB prefix and the provider from the name of the trucker", () => {
  assert.equal(airlineOfAwb("045-56632074"), "LATAM");
  assert.equal(airlineOfAwb("729-95967351"), "AVI");
  assert.equal(airlineOfAwb("810-51955024"), "AJT");
  assert.equal(airlineOfAwb("592-12345675"), "SUNR");
  assert.equal(airlineOfAwb("999-12345675"), null);
  const providers = [{ name: "ACK Team LLC", aliases: "ACK TEAM, ACK LOGISTICS" }, { name: "RL Services", aliases: "RL SERVICES, RL SERVICE" }];
  assert.equal(matchProvider("ACK TEAM LLC", providers), "ACK Team LLC");
  assert.equal(matchProvider("Ack Team Logistics.", providers), "ACK Team LLC");
  assert.equal(matchProvider("RL Services Inc", providers), "RL Services");
  assert.equal(matchProvider("r.l. services", providers), "RL Services");
  assert.equal(matchProvider("KAY AIR DELIVERY", providers), null);
  assert.equal(matchProvider("", providers), null);
});

test("the ULDs of a BUP are counted by type", () => {
  assert.deepEqual(uldsFromBup("AKE 12345 - 20 PCS, PMC 40106 - 15 PCS, AKE 77777 - 3 PCS"), [{ type: "AKE", qty: 2 }, { type: "PMC", qty: 1 }]);
  assert.deepEqual(uldsFromBup(""), []);
  assert.deepEqual(uldsFromBup(null), []);
  assert.equal(uldText([{ type: "PAG", qty: 1 }, { type: "DQF", qty: 1 }]), "1×PAG, 1×DQF");
  assert.equal(uldText([]), "Loose");
});

test("a trip is charged to the biggest shipment, and RL Services charges each shipment by its pallets", () => {
  const shares = tripShares([{ id: "a", chw: 400 }, { id: "b", chw: 1200 }, { id: "c", chw: 300 }], 40);
  assert.equal(shares.get("b"), 40);
  assert.equal(shares.get("a"), 0);
  const trip = { mode: "per_trip" as const, tripCost: 40, baseCost: null, basePallets: null, stepCost: null, stepPallets: null };
  const tiered = { mode: "tiered" as const, tripCost: null, baseCost: 50, basePallets: 4, stepCost: 10, stepPallets: 2 };
  assert.equal(jobCost(trip, 3, shares.get("b") ?? 0), 40);
  assert.equal(jobCost(trip, 3, shares.get("a") ?? 0), 0);
  assert.equal(jobCost(tiered, 7, 0), 70);
  assert.equal(jobCost(null, 7, 40), 0);
});
