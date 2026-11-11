import assert from "node:assert/strict";
import test from "node:test";
import { diffGuiaValues, manualEdits, manualKeysOf, parseDismissed, sameNumber } from "@/lib/guias/guia-manual";
import type { GuiaValues } from "@/lib/guias/extract";
import { applyReceiptsToGuia } from "@/lib/guias/wr";

const blank: GuiaValues = {
  client: "", shipper: "", shipperAddress: "", consignee: "", consigneeAddress: "", notify: "", notifyAddress: "", origin: "", destination: "",
  flightNumber: "", flightDate: "", pieces: "", chargeableKg: "", rate: "", grossKg: "", goods: "", handling: "", aesItn: "", hawb: "",
  dg: "", unNumbers: "", bup: "", bupItems: "", lithiumPi: "", issuingCompany: "ack",
};

/** One receipt: 5 pieces and 536.2 kg, with no measures, so its volume weight is 0 and the chargeable weight is 536.2. */
const receipt = (dangerousGood: string | null = null) => ({
  client: "ACME", shipperName: "ACME", shipperAddress: "1 MAIN ST", consigneeName: null, consigneeAddress: null, dangerousGood,
  lines: [{ pieces: 5, length: null, width: null, height: null, weightKg: 536.2, description: "ELECTRONICS" }],
});

test("a draft with a chargeable weight typed by hand keeps it and gets a notice with both values", () => {
  const current = { ...blank, client: "ACME", pieces: "2", grossKg: "600", chargeableKg: "638" };
  const result = applyReceiptsToGuia(current, [receipt()], manualKeysOf({ chargeableManual: true }));
  assert.equal(result.values.chargeableKg, "638");
  assert.deepEqual(result.conflicts, [{ field: "chargeableKg", guia: "638", wr: "536.2" }]);
  // The numbers nobody typed still follow the receipt.
  assert.equal(result.values.pieces, "5");
  assert.equal(result.values.grossKg, "536.2");
  assert.deepEqual(result.changed.sort(), ["goods", "grossKg", "pieces", "shipper", "shipperAddress"]);
});

test("a manual number that already agrees with the receipt gives no notice", () => {
  const current = { ...blank, chargeableKg: "536.20" };
  const result = applyReceiptsToGuia(current, [receipt()], manualKeysOf({ chargeableManual: true }));
  assert.deepEqual(result.conflicts, []);
});

test("a guía with nothing typed by hand takes the pieces and the weights of the receipt", () => {
  const result = applyReceiptsToGuia({ ...blank, pieces: "1", grossKg: "10", chargeableKg: "10" }, [receipt()], manualKeysOf({}));
  assert.equal(result.values.pieces, "5");
  assert.equal(result.values.grossKg, "536.2");
  assert.equal(result.values.chargeableKg, "536.2");
  assert.deepEqual(result.conflicts, []);
});

test("a receipt with HAZMAT leaves Dangerous Goods as it was and only suggests it", () => {
  const result = applyReceiptsToGuia({ ...blank, client: "ACME" }, [receipt("HAZMAT - UN 3481")], manualKeysOf({}));
  assert.equal(result.values.dg, "");
  assert.equal(result.values.unNumbers, "");
  assert.ok(!result.changed.includes("dg") && !result.changed.includes("unNumbers"));
  assert.deepEqual(result.dangerousGoods, { text: "HAZMAT - UN 3481", unNumbers: ["UN3481"] });
  // Already declared with that UN: nothing to suggest.
  assert.equal(applyReceiptsToGuia({ ...blank, dg: "1", unNumbers: "UN3481" }, [receipt("HAZMAT - UN 3481")], manualKeysOf({})).dangerousGoods, null);
  // No hazmat on the receipt: no suggestion.
  assert.equal(applyReceiptsToGuia(blank, [receipt()], manualKeysOf({})).dangerousGoods, null);
});

test("only the numbers typed by hand are marked, and clearing a number is not a manual edit", () => {
  const before = { ...blank, pieces: "2", grossKg: "100", chargeableKg: "120", goods: "A" };
  assert.deepEqual(manualEdits(before, { ...before, chargeableKg: "638", goods: "B" }), ["chargeableKg"]);
  assert.deepEqual(manualEdits(before, { ...before, pieces: "2.00", grossKg: "100.0" }), []);
  assert.deepEqual(manualEdits(before, { ...before, chargeableKg: "" }), []);
  assert.deepEqual(diffGuiaValues(before, { ...before, chargeableKg: "638", goods: "B" }).map((change) => [change.field, change.oldValue, change.newValue]), [
    ["chargeableKg", "120", "638"],
    ["goods", "A", "B"],
  ]);
  assert.equal(sameNumber("1,200.50", 1200.5), true);
  assert.equal(sameNumber("", ""), true);
  assert.equal(sameNumber("", "0"), false);
  assert.deepEqual(parseDismissed('{"chargeableKg":"536.2"}'), { chargeableKg: "536.2" });
  assert.deepEqual(parseDismissed("not json"), {});
});

type Writes = { document: Array<Record<string, unknown>>; line: Array<Record<string, unknown>>; log: Array<Record<string, unknown>> };

/**
 * A stand-in for the database that records what the sync writes. The database client is created once, the first time
 * the sync is imported, so the stand-in is installed once and each test only swaps the guía and the receipts in it.
 */
const state: { guia: Record<string, unknown>; receipts: unknown[]; writes: Writes } = { guia: {}, receipts: [], writes: { document: [], line: [], log: [] } };
(globalThis as { prisma?: unknown }).prisma = {
  airWaybillDocument: {
    findFirst: async () => state.guia,
    findUnique: async () => state.guia,
    update: async ({ data }: { data: Record<string, unknown> }) => void state.writes.document.push(data),
  },
  warehouseReceipt: { findMany: async () => state.receipts },
  awbGoodsLine: {
    update: async ({ data }: { data: Record<string, unknown> }) => void state.writes.line.push(data),
    create: async ({ data }: { data: Record<string, unknown> }) => void state.writes.line.push(data),
  },
  guiaChangeLog: { createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => void state.writes.log.push(...data) },
};

function fakeDatabase(guia: Record<string, unknown>, receipts: unknown[]): Writes {
  state.guia = guia;
  state.receipts = receipts;
  state.writes = { document: [], line: [], log: [] };
  return state.writes;
}

const draftGuia = (over: Record<string, unknown> = {}) => ({
  id: "guia-1", product: "guia", status: "draft", agentKey: "ack", clientLabel: "ACME", guiaClient: null, shipperName: "ACME", shipperAddress: "1 MAIN ST",
  consigneeName: null, consigneeAddress: null, notifyName: null, notifyAddress: null, departure: "MIA", destination: "GUA", flightNumber: null, flightDate: null,
  handling: null, aesItn: null, hawb: null, dgDeclarable: false, unNumbers: null, bup: false, bupItems: null, lithiumPi: null, packageType: null,
  piecesManual: false, grossManual: false, chargeableManual: false, wrDismissed: null,
  lines: [{ id: "line-1", pieces: 2, grossWeight: 600, chargeableWeight: 638, rate: null, nature: "ELECTRONICS" }],
  ...over,
});

const dbReceipt = (dangerousGood: string | null = null) => ({
  clientLabel: "ACME", shipperName: "ACME", shipperAddress: "1 MAIN ST", consigneeName: null, consigneeAddress: null, dangerousGood,
  lines: [{ pieces: 5, packageType: null, length: null, width: null, height: null, weightKg: 536.2, description: "ELECTRONICS" }],
});

test("linking a receipt to a draft with a manual chargeable weight keeps 638 and writes the rest to the history", async () => {
  const writes = fakeDatabase(draftGuia({ chargeableManual: true }), [dbReceipt()]);
  const { syncGuiaFromReceipts } = await import("@/lib/guias/wr-sync");
  const result = await syncGuiaFromReceipts("guia-1", "team@ackfreight.com");
  assert.deepEqual(result.changed.sort(), ["grossKg", "pieces"]);
  assert.deepEqual(writes.line, [{ pieces: 5, grossWeight: 536.2 }]);
  assert.deepEqual(writes.log.map((entry) => [entry.field, entry.oldValue, entry.newValue, entry.source, entry.changedBy]), [
    ["pieces", "2", "5", "receipt", "team@ackfreight.com"],
    ["grossKg", "600", "536.2", "receipt", "team@ackfreight.com"],
  ]);
});

test("linking a receipt with HAZMAT writes nothing to Dangerous Goods", async () => {
  const writes = fakeDatabase(draftGuia({ piecesManual: true, grossManual: true, chargeableManual: true }), [dbReceipt("HAZMAT - UN 3481")]);
  const { syncGuiaFromReceipts } = await import("@/lib/guias/wr-sync");
  const result = await syncGuiaFromReceipts("guia-1", "team@ackfreight.com");
  assert.deepEqual(result.changed, []);
  assert.ok(writes.document.every((data) => !("dgDeclarable" in data) && !("unNumbers" in data)));
  assert.deepEqual(writes.line, []);
});

test("a reset takes the receipt values again, clears the mark and says so in the history", async () => {
  const writes = fakeDatabase(draftGuia({ chargeableManual: true, wrDismissed: '{"chargeableKg":"536.2"}' }), [dbReceipt()]);
  const { syncGuiaFromReceipts } = await import("@/lib/guias/wr-sync");
  await syncGuiaFromReceipts("guia-1", "team@ackfreight.com", { source: "reset", reset: ["chargeableKg"] });
  assert.deepEqual(writes.document[0], { piecesManual: false, grossManual: false, chargeableManual: false, wrDismissed: null });
  assert.ok(writes.line.some((data) => data.chargeableWeight === 536.2));
  assert.ok(writes.log.some((entry) => entry.field === "chargeableKg" && entry.oldValue === "638" && entry.newValue === "536.2" && entry.source === "reset"));
});

test("linking a receipt to an issued guía changes nothing", async () => {
  const writes = fakeDatabase(draftGuia({ status: "issued" }), [dbReceipt("HAZMAT - UN 3481")]);
  const { syncGuiaFromReceipts } = await import("@/lib/guias/wr-sync");
  const result = await syncGuiaFromReceipts("guia-1", "team@ackfreight.com");
  assert.deepEqual(result, { changed: [], skipped: true });
  // A reset on an issued guía does not clear its marks either.
  const reset = await syncGuiaFromReceipts("guia-1", "team@ackfreight.com", { source: "reset", reset: "all" });
  assert.equal(reset.skipped, true);
  assert.deepEqual(writes, { document: [], line: [], log: [] });
});
