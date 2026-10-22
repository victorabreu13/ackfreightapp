import assert from "node:assert/strict";
import test from "node:test";
import { handlingForPrint, NO_EEI_LINE } from "@/lib/guias/corte";
import { DG_HANDLING_LINE, formatUnNumbers, hasLithiumUn, parseUnNumbers } from "@/lib/guias/dg";

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
