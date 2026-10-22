import assert from "node:assert/strict";
import test from "node:test";
import { handlingForPrint, NO_EEI_LINE } from "@/lib/guias/corte";
import { DG_HANDLING_LINE, formatUnNumbers, hasLithiumUn, isLithiumPi, lithiumSectionIIStatement, onlyLithiumUn, parseUnNumbers } from "@/lib/guias/dg";

test("UN numbers are read from however they are typed, once each", () => {
  assert.deepEqual(parseUnNumbers("UN3481, un1950 3481"), ["3481", "1950"]);
  assert.deepEqual(parseUnNumbers("ONU 3090 / N° 1203"), ["3090", "1203"]);
  assert.deepEqual(parseUnNumbers("12345"), []);
  assert.deepEqual(parseUnNumbers(""), []);
  assert.equal(formatUnNumbers("3481 1950"), "UN3481, UN1950");
  assert.equal(formatUnNumbers(null), "");
});

test("lithium battery UN numbers are recognised", () => {
  assert.equal(hasLithiumUn("UN3481"), true);
  assert.equal(hasLithiumUn("UN1950, UN3090"), true);
  assert.equal(hasLithiumUn("UN1950"), false);
});

test("Handling Information gets the DGD line only for dangerous goods, and only once", () => {
  assert.ok(!handlingForPrint("", "", false).includes(DG_HANDLING_LINE));
  const withDg = handlingForPrint("", "", true);
  assert.ok(withDg.includes(DG_HANDLING_LINE));
  assert.ok(withDg.endsWith(NO_EEI_LINE));
  const typed = handlingForPrint(`KEEP DRY\n${DG_HANDLING_LINE}`, "X20261021165293", true);
  assert.equal(typed.split(DG_HANDLING_LINE).length - 1, 1);
  assert.ok(typed.endsWith("AES ITN: X20261021165293"));
});

test("Section II lithium batteries have no DGD line, and the AWB names the packing instruction", () => {
  assert.equal(lithiumSectionIIStatement("967"), "Lithium ion batteries in compliance with Section II of PI967");
  assert.equal(lithiumSectionIIStatement("970"), "Lithium metal batteries in compliance with Section II of PI970");
  assert.equal(lithiumSectionIIStatement(""), "");
  assert.equal(lithiumSectionIIStatement("999"), "");
  const text = handlingForPrint("", "", false, "967");
  assert.ok(!text.includes(DG_HANDLING_LINE));
  assert.ok(text.includes("Lithium ion batteries in compliance with Section II of PI967"));
  assert.ok(text.endsWith(NO_EEI_LINE));
  const both = handlingForPrint("", "", true, "970");
  assert.ok(both.includes(DG_HANDLING_LINE) && both.includes("Section II of PI970"));
  assert.ok(handlingForPrint("", "", false, null).indexOf("Section II") < 0);
});

test("a UN list of only lithium batteries is recognised so the form can warn", () => {
  assert.equal(onlyLithiumUn("UN3481, UN3091"), true);
  assert.equal(onlyLithiumUn("UN3481, UN1950"), false);
  assert.equal(onlyLithiumUn(""), false);
  assert.equal(isLithiumPi("967"), true);
  assert.equal(isLithiumPi("971"), false);
});
