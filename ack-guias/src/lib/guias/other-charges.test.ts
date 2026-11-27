import assert from "node:assert/strict";
import test from "node:test";
import { cleanOtherCharges, MAX_OTHER_CHARGES, otherChargesTotal, parseOtherCharges, serializeOtherCharges } from "@/lib/guias/other-charges";

test("other charges keep their description and amount, drop empty rows and add up to the cent", () => {
  const rows = [{ description: " DG  Charge ", amount: "150" }, { description: "", amount: "" }, { description: "Fuel", amount: "$1,200.505" }, { description: "", amount: "12.1" }];
  const clean = cleanOtherCharges(rows);
  assert.deepEqual(clean.map((row) => row.description), ["DG Charge", "Fuel", ""]);
  assert.equal(clean[0].amount, 150);
  assert.equal(otherChargesTotal([{ description: "A", amount: 0.1 }, { description: "B", amount: 0.2 }]), 0.3);
  assert.equal(otherChargesTotal([]), 0);
});

test("other charges are stored as text and read back, and bad text reads as none", () => {
  assert.equal(serializeOtherCharges([{ description: "", amount: "" }]), "");
  const stored = serializeOtherCharges([{ description: "DG Charge", amount: "150" }]);
  assert.deepEqual(parseOtherCharges(stored), [{ description: "DG Charge", amount: 150 }]);
  assert.deepEqual(parseOtherCharges("not json"), []);
  assert.deepEqual(parseOtherCharges(null), []);
  assert.deepEqual(parseOtherCharges('{"a":1}'), []);
  const many = Array.from({ length: 12 }, (_, index) => ({ description: `C${index}`, amount: 1 }));
  assert.equal(cleanOtherCharges(many).length, MAX_OTHER_CHARGES);
});
