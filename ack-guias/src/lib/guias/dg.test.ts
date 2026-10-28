import assert from "node:assert/strict";
import test from "node:test";
import { aesItnList, bupItemList, goodsForPrint, handlingForPrint, NO_EEI_GOODS, unRequiresCargoAircraftOnly } from "@/lib/guias/corte";
import { DG_HANDLING_LINE, formatUnNumbers, hasLithiumTypes, hasLithiumUn, isLithiumPi, LITHIUM_BOX_CENTER, LITHIUM_TYPES, lithiumSectionIIStatement, lithiumSectionIIStatements, onlyLithiumUn, parseLithiumTypes, parseUnNumbers } from "@/lib/guias/dg";

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
  assert.ok(!handlingForPrint("", false).includes(DG_HANDLING_LINE));
  const withDg = handlingForPrint("", true);
  assert.ok(withDg.includes(DG_HANDLING_LINE));
  assert.ok(!withDg.includes("NO EEI"));
  const typed = handlingForPrint(`KEEP DRY\n${DG_HANDLING_LINE}`, true);
  assert.equal(typed.split(DG_HANDLING_LINE).length - 1, 1);
  assert.ok(!typed.includes("AES ITN"));
});

test("Section II lithium batteries have no DGD line, and the AWB names the packing instruction in the goods", () => {
  assert.equal(lithiumSectionIIStatement("967"), "Lithium ion batteries in compliance with Section II of PI967");
  assert.equal(lithiumSectionIIStatement("970"), "Lithium metal batteries in compliance with Section II of PI970");
  assert.equal(lithiumSectionIIStatement(""), "");
  assert.equal(lithiumSectionIIStatement("999"), "");
  // The statements are in the Nature of Goods and not in Handling Information.
  assert.ok(!handlingForPrint("", false).includes("Section II"));
  const goods = goodsForPrint([{ nature: "LAPTOPS", sortOrder: 0 }], "", "967");
  assert.ok(goods.includes("Lithium ion batteries in compliance with Section II of PI967"));
  assert.ok(!goods.includes(DG_HANDLING_LINE));
  assert.ok(!goodsForPrint([{ nature: "LAPTOPS", sortOrder: 0 }], "", null).includes("Section II"));
});

test("a UN list of only lithium batteries is recognised so the form can warn", () => {
  assert.equal(onlyLithiumUn("UN3481, UN3091"), true);
  assert.equal(onlyLithiumUn("UN3481, UN1950"), false);
  assert.equal(onlyLithiumUn(""), false);
  assert.equal(isLithiumPi("967"), true);
  assert.equal(isLithiumPi("971"), false);
});

test("the AES ITN prints in the Nature of Goods after the last line, and with no ITN the NO EEI exemption goes there instead", () => {
  const line = (nature: string) => [{ nature, sortOrder: 0 }];
  assert.equal(goodsForPrint(line("WIDGETS PMC 40106 R7=01 PC"), ""), `WIDGETS ${NO_EEI_GOODS} PMC 40106 R7=01 PC`);
  assert.equal(goodsForPrint(line("WIDGETS"), null), `WIDGETS ${NO_EEI_GOODS}`);
  assert.equal(goodsForPrint(line("WIDGETS PMC 40106 R7=01 PC"), "X20261021165293"), "WIDGETS PMC 40106 R7=01 PC\nITN: X20261021165293");
  const several = "X20261023351371, X20261023351509, X20261023351662, X20261023351717";
  assert.equal(goodsForPrint([{ nature: "WIDGETS", sortOrder: 0 }, { nature: "PI967 PMC 40106", sortOrder: 1 }], `AES ITN: ${several}`), "WIDGETS\nPI967 PMC 40106\nITN: X20261023351371\nX20261023351509\nX20261023351662\nX20261023351717");
  // Typed with AES in front of each number, the word is dropped: ITN: appears once and only the numbers follow.
  const typed = "AES X20261023351371, AES X20261023351509, AES ITN: X20261023351662, ITN: X20261023351717";
  assert.equal(goodsForPrint(line("PI967"), typed), "PI967\nITN: X20261023351371\nX20261023351509\nX20261023351662\nX20261023351717");
  assert.deepEqual(aesItnList("x1; X2\nX1,  AES ITN: X3 ,"), ["x1", "X2", "X3"]);
  assert.equal(goodsForPrint(line("WIDGETS AES ITN: X1 PMC 40106"), "X1, X2"), "WIDGETS AES ITN: X1 PMC 40106\nITN: X2");
  assert.equal(goodsForPrint(line("WIDGETS AES ITN: X20261021165293 PMC 40106"), "X20261021165293"), "WIDGETS AES ITN: X20261021165293 PMC 40106");
  assert.ok(!goodsForPrint(line("WIDGETS"), "X20261021165293").includes("NO EEI"));
  assert.equal(goodsForPrint(line(`WIDGETS ${NO_EEI_GOODS} PMC 40106`), ""), `WIDGETS ${NO_EEI_GOODS} PMC 40106`);
  assert.equal(goodsForPrint([], ""), "");
  assert.ok(!handlingForPrint("", false).includes("NO EEI"));
  assert.ok(!handlingForPrint("", false).includes("AES ITN"));
});

const lines = (text: string) => text.split("\n");

test("Handling Information says the DGD line once and Cargo Aircraft Only only when a UN number requires it", () => {
  const typed = "DANGEROUS GOODS AS PER ATTACHED SHIPPER'S DECLARATION\nCARGO AIRCRAFT ONLY\nNotificar a pmorales@pacifiko.com\nDangerous Goods as per associated DGD";
  // UN1950 flies on passenger aircraft in the table, UN3480 does not.
  assert.deepEqual(lines(handlingForPrint(typed, true, "UN1950")), ["Notificar a pmorales@pacifiko.com", "Dangerous Goods as per associated DGD"]);
  assert.deepEqual(lines(handlingForPrint(typed, true, "UN3480")), ["Notificar a pmorales@pacifiko.com", "Dangerous Goods as per associated DGD", "CARGO AIRCRAFT ONLY"]);
  // A UN number that is not in the table, or none at all, keeps what was typed.
  assert.ok(lines(handlingForPrint(typed, true, "UN3556")).includes("CARGO AIRCRAFT ONLY"));
  assert.deepEqual(lines(handlingForPrint("KEEP DRY\nCARGO AIRCRAFT ONLY", false, null)), ["KEEP DRY", "CARGO AIRCRAFT ONLY"]);
  assert.deepEqual(lines(handlingForPrint("KEEP DRY", false, "UN3480")), ["KEEP DRY", "CARGO AIRCRAFT ONLY"]);
  assert.equal(unRequiresCargoAircraftOnly("UN1950, UN3480"), true);
  assert.equal(unRequiresCargoAircraftOnly(""), false);
});


test("the battery types checked on a guía are read from a comma list and keep the order of the document", () => {
  assert.deepEqual(parseLithiumTypes("970, 966 ,bogus,966,968IB"), ["966", "970", "968IB"]);
  assert.deepEqual(parseLithiumTypes(""), []);
  assert.deepEqual(parseLithiumTypes(null), []);
  assert.equal(isLithiumPi("965IB"), false);
  assert.equal(isLithiumPi("965IB,967"), true);
  assert.equal(hasLithiumTypes("968IB"), true);
  assert.deepEqual(lithiumSectionIIStatements("970,967,968IB"), [
    "Lithium ion batteries in compliance with Section II of PI967",
    "Lithium metal batteries in compliance with Section II of PI970",
  ]);
  assert.deepEqual(lithiumSectionIIStatements("965IB"), []);
  // One box on the letter for each type.
  assert.deepEqual(Object.keys(LITHIUM_BOX_CENTER).sort(), LITHIUM_TYPES.map((type) => type.code).sort());
});

test("the Nature of Goods runs description, lithium types, AES ITN and then the BUP elements, each on its own line", () => {
  const line = (nature: string) => [{ nature, sortOrder: 0 }];
  const printed = goodsForPrint(line("ELECTRONICS PMC 40106"), "AES X1, AES X2", "967,970", "ULD AKE 123 - 20 PCS, ULD PMC 456 - 15 PCS");
  assert.deepEqual(printed.split("\n"), [
    "ELECTRONICS PMC 40106",
    "Lithium ion batteries in compliance with Section II of PI967",
    "Lithium metal batteries in compliance with Section II of PI970",
    "ITN: X1",
    "X2",
    "ULD AKE 123 - 20 PCS",
    "ULD PMC 456 - 15 PCS",
  ]);
  // A statement the description already makes is not repeated, and Section IB has none.
  assert.equal(goodsForPrint(line("LITHIUM ION BATTERIES IN COMPLIANCE WITH SECTION II OF PI967"), "X1", "967,965IB"), "LITHIUM ION BATTERIES IN COMPLIANCE WITH SECTION II OF PI967\nITN: X1");
  // With no ITN the exemption goes before the PMC code, the BUP elements stay last.
  assert.equal(
    goodsForPrint(line("WIDGETS PMC 40106"), "", "970", "ULD A - 5 PCS"),
    `WIDGETS ${NO_EEI_GOODS} PMC 40106\nLithium metal batteries in compliance with Section II of PI970\nULD A - 5 PCS`,
  );
  assert.deepEqual(bupItemList("ULD A - 5 PCS,  ULD B - 6 PCS; \n ,ULD C"), ["ULD A - 5 PCS", "ULD B - 6 PCS", "ULD C"]);
  assert.equal(goodsForPrint(line("WIDGETS"), "X1", null, ""), "WIDGETS\nITN: X1");
});
