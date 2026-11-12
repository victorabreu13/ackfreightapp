import assert from "node:assert/strict";
import test from "node:test";
import { CONSIGNEE_MISSING, parseDraftConsignee, resolveLabelConsignee } from "./label-consignee";

const base = { which: "leg" as const, labelAwb: "369-11444440", clientName: "IVI Logistics" };

test("369-11444440 case: only a Kope AWB draft (not issued) → its consignee prints (was blank)", () => {
  const r = resolveLabelConsignee({ ...base, docs: [{ awb: "", status: "draft", consigneeName: "COLOCAR CARGO LOGISTICS S.A.S." }] });
  assert.deepEqual(r, { name: "COLOCAR CARGO LOGISTICS S.A.S.", source: "awbDraft", missing: false });
});

test("issued AWB for the label AWB wins over the draft", () => {
  const r = resolveLabelConsignee({ ...base, docs: [
    { awb: "", status: "draft", consigneeName: "COLOCAR" },
    { awb: "36911444440", status: "issued", consigneeName: "GROUNDFLEX SAS" },
  ] });
  assert.equal(r.name, "GROUNDFLEX SAS"); assert.equal(r.source, "issuedAwb");
});

test("no draft doc → Shipment.consignee from the team draft email, then client party", () => {
  assert.equal(resolveLabelConsignee({ ...base, docs: [], shipmentConsignee: " GROUNDFLEX  SAS " }).name, "GROUNDFLEX SAS");
  assert.equal(resolveLabelConsignee({ ...base, docs: [], partyConsignee: "COLOCAR" }).source, "clientParty");
});

test("nothing anywhere → CONSIGNEE MISSING, never blank (leg)", () => {
  const r = resolveLabelConsignee({ ...base, docs: [{ awb: "", status: "draft", consigneeName: "  " }] });
  assert.deepEqual(r, { name: CONSIGNEE_MISSING, source: "missing", missing: true });
});

test("master label keeps the client name as last resort", () => {
  assert.equal(resolveLabelConsignee({ ...base, which: "master", labelAwb: "999-96759972", docs: [] }).name, "IVI Logistics");
  assert.equal(resolveLabelConsignee({ ...base, which: "master", clientName: "", docs: [] }).missing, true);
});

test("parseDraftConsignee reads the team draft email and AWB face text", () => {
  assert.equal(parseDraftConsignee("SHIPPER: IVI\nCONSIGNEE: COLOCAR CARGO LOGISTICS S.A.S.\nNOTIFY: X"), "COLOCAR CARGO LOGISTICS S.A.S.");
  assert.equal(parseDraftConsignee("Hi team,\nCNEE: GROUNDFLEX SAS\nthanks"), "GROUNDFLEX SAS");
  // real "DRAFT 369-11444193.pdf" (pdftotext -layout), right column text must be cut off
  const face = [
    "Consignee Name and Address                                       Consignee's Account Number                       It is agreed that the goods",
    "                                                                                                                  (except as noted) for carriage",
    "COLOCAR CARGO LOGISTICS S.A.S                                                                                     REVERSE HEREOF, ALL GOODS",
    "CALLE25C#85C-27 BODEGA PRIMARIA",
  ].join("\n");
  assert.equal(parseDraftConsignee(face), "COLOCAR CARGO LOGISTICS S.A.S");
  assert.equal(parseDraftConsignee("Consignee Name and Address\n\nConsignee's Account Number\n\nCALLE25C"), null); // plain text: not trusted
  assert.equal(parseDraftConsignee("CONSIGNEE: \nNOTIFY: X"), null);
  assert.equal(parseDraftConsignee("CONSIGNEE: —"), null);
  assert.equal(parseDraftConsignee("The consignee (CNEE) on the MAWB still shows COLOCAR"), null);
  assert.equal(parseDraftConsignee(""), null);
});
