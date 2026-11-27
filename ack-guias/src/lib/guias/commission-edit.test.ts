import assert from "node:assert/strict";
import test from "node:test";
import { isManual, overrideFromInvoice, parseAmount, planShipmentEdit, type EditInput, type ShipmentAmounts } from "@/lib/guias/commission-edit";

const current: ShipmentAmounts = {
  airCost: 672.19, airSold: 948.27, pickupCost: 50, pickupSold: 75.68, handlingCost: 45, handlingSold: 100.9, transferCost: 50, transferSold: 75.68,
  kopeHandling: 60.02, kopeInCost: true, insuranceCost: 0, insuranceSold: 0, aes: 0, awbFee: 50, invoicedOverride: null, invoiceNo: null, note: null, manualFields: null,
};
const splits = [
  { id: "a", pct: 35 },
  { id: "b", pct: 65 },
];
const same = (over: Partial<EditInput> = {}): EditInput => ({
  amounts: {}, kopeInCost: true, invoicedOverride: "", invoiceNo: "", note: "", splits: [{ id: "a", pct: "35" }, { id: "b", pct: "65" }], ...over,
});

test("parseAmount reads money the way people type it", () => {
  assert.equal(parseAmount("1,234.5"), 1234.5);
  assert.equal(parseAmount("$75"), 75);
  assert.equal(parseAmount("-20"), -20);
  assert.equal(parseAmount(""), 0);
  assert.equal(parseAmount("12abc"), null);
  assert.equal(parseAmount("99999999999"), null);
});

test("correcting one rubro recalculates the totals and remembers what was typed by hand", () => {
  const plan = planShipmentEdit(current, splits, same({ amounts: { pickupCost: "80" } }));
  assert.ok(!("error" in plan));
  if ("error" in plan) return;
  assert.equal(plan.data.pickupCost, 80);
  assert.equal(plan.data.manualFields, "pickupCost");
  // The cost went up by 30, so the profit went down by 30.
  const before = planShipmentEdit(current, splits, same());
  assert.ok(!("error" in before));
  if ("error" in before) return;
  assert.equal(Math.round((before.totals.profit - plan.totals.profit) * 100) / 100, 30);
  assert.deepEqual(plan.changed, ["pickupCost"]);
  assert.ok(isManual(plan.data.manualFields as string, "pickupCost"));
  assert.ok(!isManual(plan.data.manualFields as string, "transferCost"));
});

test("an invoice total typed by hand replaces the sum, and blank takes it away", () => {
  const typed = planShipmentEdit(current, splits, same({ invoicedOverride: "1500" }));
  assert.ok(!("error" in typed));
  if ("error" in typed) return;
  assert.equal(typed.totals.invoiced, 1500);
  const cleared = planShipmentEdit({ ...current, invoicedOverride: 1500 }, splits, same());
  assert.ok(!("error" in cleared));
  if ("error" in cleared) return;
  assert.equal(cleared.data.invoicedOverride, null);
});

test("kope handling stops counting as cost when it is unchecked", () => {
  const on = planShipmentEdit(current, splits, same());
  const off = planShipmentEdit(current, splits, same({ kopeInCost: false }));
  assert.ok(!("error" in on) && !("error" in off));
  if ("error" in on || "error" in off) return;
  assert.equal(Math.round((off.totals.profit - on.totals.profit) * 100) / 100, 60.02);
});

test("percentages change, and more than 100% together is refused", () => {
  const plan = planShipmentEdit(current, splits, same({ splits: [{ id: "a", pct: "40" }, { id: "b", pct: "60" }] }));
  assert.ok(!("error" in plan));
  if ("error" in plan) return;
  assert.deepEqual(plan.splitUpdates, [{ id: "a", pct: 40 }, { id: "b", pct: 60 }]);
  const over = planShipmentEdit(current, splits, same({ splits: [{ id: "a", pct: "50" }, { id: "b", pct: "60" }] }));
  assert.ok("error" in over);
  const bad = planShipmentEdit(current, splits, same({ splits: [{ id: "a", pct: "abc" }, { id: "b", pct: "60" }] }));
  assert.ok("error" in bad);
});

test("a typed amount that is not a number is refused, and the fields not sent keep what they have", () => {
  const bad = planShipmentEdit(current, splits, same({ amounts: { airCost: "x" } }));
  assert.ok("error" in bad && /Air freight cost/.test(bad.error));
  const kept = planShipmentEdit(current, splits, same({ amounts: { airSold: "1000" } }));
  assert.ok(!("error" in kept));
  if ("error" in kept) return;
  assert.equal(kept.data.airCost, 672.19);
  assert.equal(kept.data.airSold, 1000);
});

test("charges added to the invoice become the invoiced total, and an invoice that is just the sum holds nothing by hand", () => {
  assert.equal(overrideFromInvoice(614.7, 864.7), 864.7);
  assert.equal(overrideFromInvoice(614.7, 614.7), null);
  assert.equal(overrideFromInvoice(614.7, 614.700001), null);
  // The profit follows: the invoiced total minus the cost.
  const plan = planShipmentEdit(current, splits, same({ invoicedOverride: "1500" }));
  assert.ok(!("error" in plan));
  if ("error" in plan) return;
  assert.equal(plan.totals.profit, Math.round((1500 - plan.totals.costTotal) * 100) / 100);
});
