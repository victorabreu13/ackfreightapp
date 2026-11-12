import assert from "node:assert/strict";
import test from "node:test";
import { ROUNDED_GUIA_FIELDS, roundUp, roundUpOrNull, roundUpText } from "@/lib/guias/round-up";

test("a number with decimals goes up to the next whole number and a whole number stays", () => {
  assert.equal(roundUp(54.2), 55);
  assert.equal(roundUp(54.01), 55);
  assert.equal(roundUp(54.99), 55);
  assert.equal(roundUp(54), 54);
  assert.equal(roundUp(54.0000001), 54);
  assert.equal(roundUp(0.3), 1);
});

test("an empty value stays empty", () => {
  assert.equal(roundUpOrNull(null), null);
  assert.equal(roundUpOrNull(12.4), 13);
  assert.equal(roundUpText(""), "");
  assert.equal(roundUpText("abc"), "abc");
});

test("what a form field holds is rounded the same way, with thousands separators", () => {
  assert.equal(roundUpText("536.2"), "537");
  assert.equal(roundUpText("54.00"), "54");
  assert.equal(roundUpText("1,200.50"), "1201");
  assert.equal(roundUpText(" 40.2 "), "41");
});

test("only the pieces and the weights of a guía follow the rule, not the rate", () => {
  assert.ok(ROUNDED_GUIA_FIELDS.has("chargeableKg") && ROUNDED_GUIA_FIELDS.has("grossKg") && ROUNDED_GUIA_FIELDS.has("pieces"));
  assert.ok(!ROUNDED_GUIA_FIELDS.has("rate"));
});
