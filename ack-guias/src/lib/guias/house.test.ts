import assert from "node:assert/strict";
import test from "node:test";
import { applyHousesToMaster, houseDismissKey, houseNumber, houseTotals, splitHouseNumber } from "@/lib/guias/house";
import { manualKeysOf } from "@/lib/guias/guia-manual";

test("house numbers are ACK and six digits, in order", () => {
  assert.equal(houseNumber(1), "ACK-000001");
  assert.equal(houseNumber(123), "ACK-000123");
  assert.equal(houseNumber(1234567), "ACK-1234567");
});

test("a house number splits into its letters and its digits for the top of the air waybill", () => {
  assert.deepEqual(splitHouseNumber("ACK-000123"), { prefix: "ACK", serial: "000123" });
  assert.deepEqual(splitHouseNumber("ack 000123"), { prefix: "ACK", serial: "000123" });
  assert.deepEqual(splitHouseNumber("H44110"), { prefix: "H", serial: "44110" });
  assert.deepEqual(splitHouseNumber("44110"), { prefix: "", serial: "44110" });
  assert.deepEqual(splitHouseNumber("ABC"), { prefix: "", serial: "ABC" });
});

test("the houses of a master add up, a house with no chargeable weight bills on its gross weight, and decimals go up", () => {
  const houses = [
    { lines: [{ pieces: 2, grossWeight: 100.2, chargeableWeight: 120 }] },
    { lines: [{ pieces: 3, grossWeight: 50, chargeableWeight: null }] },
    { lines: [] },
  ];
  assert.deepEqual(houseTotals(houses), { pieces: 5, grossKg: 151, chargeableKg: 170 });
  assert.deepEqual(houseTotals([]), { pieces: 0, grossKg: 0, chargeableKg: 0 });
});

const current = { pieces: "2", grossKg: "100", chargeableKg: "638" };
const totals = { pieces: 5, grossKg: 151, chargeableKg: 170 };

test("a master with nothing typed by hand takes the totals of its houses", () => {
  const result = applyHousesToMaster(current, totals, manualKeysOf({}));
  assert.deepEqual(result.values, { pieces: "5", grossKg: "151", chargeableKg: "170" });
  assert.deepEqual(result.changed, ["pieces", "grossKg", "chargeableKg"]);
  assert.deepEqual(result.conflicts, []);
});

test("a number typed by hand stays and comes back as a conflict with both values", () => {
  const result = applyHousesToMaster(current, totals, manualKeysOf({ chargeableManual: true }));
  assert.equal(result.values.chargeableKg, "638");
  assert.deepEqual(result.conflicts, [{ field: "chargeableKg", guia: "638", houses: "170" }]);
  assert.deepEqual(result.changed, ["pieces", "grossKg"]);
});

test("a typed number that already agrees with the houses gives no notice, and no houses changes nothing", () => {
  assert.deepEqual(applyHousesToMaster({ ...current, chargeableKg: "170.00" }, totals, manualKeysOf({ chargeableManual: true })).conflicts, []);
  const none = applyHousesToMaster(current, { pieces: 0, grossKg: 0, chargeableKg: 0 }, manualKeysOf({}));
  assert.deepEqual(none.changed, []);
  assert.deepEqual(none.values, current);
});

test("keeping the master number is remembered apart from the warehouse receipts", () => {
  assert.equal(houseDismissKey("chargeableKg"), "house:chargeableKg");
});
