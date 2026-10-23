import assert from "node:assert/strict";
import test from "node:test";
import { goodsForPrint, handlingForPrint, NO_EEI_GOODS, unRequiresCargoAircraftOnly } from "@/lib/guias/corte";
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
  assert.ok(!withDg.includes("NO EEI"));
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
  assert.ok(!text.includes("NO EEI"));
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

test("with no AES ITN the NO EEI exemption goes in the Nature of Goods, not in Handling Information", () => {
  const line = (nature: string) => [{ nature, sortOrder: 0 }];
  assert.equal(goodsForPrint(line("WIDGETS PMC 40106 R7=01 PC"), ""), `WIDGETS ${NO_EEI_GOODS} PMC 40106 R7=01 PC`);
  assert.equal(goodsForPrint(line("WIDGETS"), null), `WIDGETS ${NO_EEI_GOODS}`);
  assert.equal(goodsForPrint(line("WIDGETS PMC 40106 R7=01 PC"), "X20261021165293"), "WIDGETS PMC 40106 R7=01 PC");
  assert.equal(goodsForPrint(line(`WIDGETS ${NO_EEI_GOODS} PMC 40106`), ""), `WIDGETS ${NO_EEI_GOODS} PMC 40106`);
  assert.equal(goodsForPrint([], ""), "");
  assert.ok(!handlingForPrint("", "", false).includes("NO EEI"));
  assert.ok(handlingForPrint("", "X20261021165293", false).endsWith("AES ITN: X20261021165293"));
});

const lines = (text: string) => text.split("\n");

test("Handling Information says the DGD line once and Cargo Aircraft Only only when a UN number requires it", () => {
  const typed = "DANGEROUS GOODS AS PER ATTACHED SHIPPER'S DECLARATION\nCARGO AIRCRAFT ONLY\nNotificar a pmorales@pacifiko.com\nDangerous Goods as per associated DGD";
  // UN1950 flies on passenger aircraft in the table, UN3480 does not.
  assert.deepEqual(lines(handlingForPrint(typed, "", true, null, "UN1950")), ["Notificar a pmorales@pacifiko.com", "Dangerous Goods as per associated DGD"]);
  assert.deepEqual(lines(handlingForPrint(typed, "", true, null, "UN3480")), ["Notificar a pmorales@pacifiko.com", "Dangerous Goods as per associated DGD", "CARGO AIRCRAFT ONLY"]);
  // A UN number that is not in the table, or none at all, keeps what was typed.
  assert.ok(lines(handlingForPrint(typed, "", true, null, "UN3556")).includes("CARGO AIRCRAFT ONLY"));
  assert.deepEqual(lines(handlingForPrint("KEEP DRY\nCARGO AIRCRAFT ONLY", "", false, null, null)), ["KEEP DRY", "CARGO AIRCRAFT ONLY"]);
  assert.deepEqual(lines(handlingForPrint("KEEP DRY", "", false, null, "UN3480")), ["KEEP DRY", "CARGO AIRCRAFT ONLY"]);
  assert.equal(unRequiresCargoAircraftOnly("UN1950, UN3480"), true);
  assert.equal(unRequiresCargoAircraftOnly(""), false);
});

