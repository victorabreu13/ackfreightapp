import assert from "node:assert/strict";
import test from "node:test";
import { isManual, parseAmount, planShipmentEdit, soldFromInvoiceLines, type EditInput, type ShipmentAmounts } from "@/lib/guias/commission-edit";

const current: ShipmentAmounts = {
  airCost: 672.19, airSold: 948.27, pickupCost: 50, pickupSold: 75.68, handlingCost: 45, handlingSold: 100.9, transferCost: 50, transferSold: 75.68,
  kopeHandling: 60.02, otherCost: 0, otherSold: 0, kopeInCost: true, insuranceCost: 0, insuranceSold: 0, aes: 0, awbFee: 50, invoicedOverride: null, invoiceNo: null, note: null, manualFields: null,
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

test("the lines of the invoice go to their rubros, and a charge with no rubro goes to the other charges", () => {
  // The invoice of AGRO-INDUSTRIAL CENTER: handling and transfer billed together, the air freight at its own price.
  const sold = soldFromInvoiceLines([
    { product: "PICKUP", amount: 75 },
    { product: "HANDLING", amount: 75 },
    { product: "AIRFREIGHT", amount: 350 },
    { product: "AWB", amount: 50 },
  ]);
  assert.deepEqual(sold, { airSold: 350, pickupSold: 75, handlingSold: 75, transferSold: 0, insuranceSold: 0, aes: 0, awbFee: 50, otherSold: 0 });
  // A DGD and its inspection are other charges, and the lines of a product add up.
  const extra = soldFromInvoiceLines([
    { product: "airport transfer", amount: 75 },
    { product: "DGD", amount: 125 },
    { product: "DGDI", amount: 125 },
    { product: "PICKUP", amount: 40 },
    { product: "PICKUP", amount: 35.5 },
  ]);
  assert.equal(extra.transferSold, 75);
  assert.equal(extra.otherSold, 250);
  assert.equal(extra.pickupSold, 75.5);
});

test("the other charges count in the totals, and what they cost takes from the profit", () => {
  const withOther = { ...current, otherSold: 250, otherCost: 100 };
  const base = planShipmentEdit(current, splits, same());
  const plan = planShipmentEdit(withOther, splits, same({ amounts: { otherSold: "250", otherCost: "100" } }));
  assert.ok(!("error" in base) && !("error" in plan));
  if ("error" in base || "error" in plan) return;
  assert.equal(Math.round((plan.totals.invoiced - base.totals.invoiced) * 100) / 100, 250);
  assert.equal(Math.round((plan.totals.profit - base.totals.profit) * 100) / 100, 150);
});
