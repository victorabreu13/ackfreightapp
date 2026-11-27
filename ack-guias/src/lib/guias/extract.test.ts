import assert from "node:assert/strict";
import test from "node:test";
import { extractGuia, fromAiPayload, rulesExtract } from "./extract";

const SAMPLE = `From: maria@lamar.example
Client: LAMAR
Shipper: Lamar Cargo
123 Export Road, Bogota
Consignee: ACME Logistics
6550 NW 97th Ave, Doral FL
Notify: Andres Alvarado
Origin: BOG
Destination: MIA
Flight: LA401
Date: 20 Oct 2026
Pieces: 12
Chargeable kg: 340
Gross: 310
Goods: textiles
Handling: keep cool
Issuing company: ACK TEAM LLC
`;

test("rules keep chargeable kg and leave gross as information", () => {
  const extracted = rulesExtract(SAMPLE);
  assert.equal(extracted.values.client, "LAMAR");
  assert.equal(extracted.values.shipper, "Lamar Cargo");
  assert.equal(extracted.values.shipperAddress, "123 Export Road, Bogota");
  assert.equal(extracted.values.consignee, "ACME Logistics");
  assert.equal(extracted.values.pieces, "12");
  assert.equal(extracted.values.chargeableKg, "340");
  assert.equal(extracted.values.grossKg, "310");
  assert.equal(extracted.values.goods, "textiles");
  assert.equal(extracted.values.issuingCompany, "ack");
  assert.equal(extracted.review.includes("chargeableKg"), false);
  assert.equal(extracted.snippets.chargeableKg?.includes("340"), true);
});

test("uncertain and invented AI values are dropped", () => {
  const extracted = fromAiPayload(SAMPLE, {
    fields: {
      client: { value: "LAMAR", uncertain: false, snippet: "Client: LAMAR" },
      consignee: { value: "Invented Consignee", uncertain: false, snippet: "made up" },
      pieces: { value: "12", uncertain: true, snippet: "Pieces: 12" },
      chargeableKg: { value: "999", uncertain: false, snippet: "Chargeable kg: 999" },
      goods: { value: "textiles", uncertain: false, snippet: "Goods: textiles" },
    },
  });
  assert.equal(extracted.values.client, "LAMAR");
  assert.equal(extracted.values.consignee, "");
  assert.equal(extracted.values.pieces, "");
  assert.equal(extracted.values.chargeableKg, "");
  assert.equal(extracted.values.goods, "textiles");
  assert.equal(extracted.review.includes("consignee"), true);
  assert.equal(extracted.review.includes("pieces"), true);
});

const IVI_EMAIL = [
  "Dear Team,",
  "Please kindly see below entry pre-alert:",
  "MAWB: 999-96759246",
  "Shipping Units: 117 PKGS",
  "Weight: 2493 KG",
  "Pieces: 2823 (HAWB PCS)",
  "Flight Number: CA1165",
  "ETD PVG: 2026-10-07 08:30 (Local time)",
  "ETA MIA: 2026-10-07 13:55 (Local time)",
].join("\n");

test("an IVI email uses shipping units, weight, and flight number, and ignores the HAWB piece count", () => {
  const extracted = rulesExtract(IVI_EMAIL);
  assert.equal(extracted.values.pieces, "117");
  assert.equal(extracted.values.grossKg, "2493");
  assert.equal(extracted.values.chargeableKg, "");
  assert.equal(extracted.values.flightNumber, "CA1165");
  assert.equal(extracted.values.origin, "PVG");
  assert.equal(extracted.values.destination, "");
  assert.equal(extracted.review.includes("destination"), true);
  assert.equal(extracted.values.flightDate, "2026-10-07");
  assert.equal(extracted.values.hawb, "");
  assert.equal(extracted.review.includes("pieces"), false);
  assert.equal(extracted.review.includes("chargeableKg"), true);
  assert.equal(extracted.review.includes("shipper"), true);
  assert.equal(extracted.review.includes("goods"), true);
  assert.equal(rulesExtract("Shipping Units: 67 PKGS\nPieces: 2823 (HAWB PCS)").values.pieces, "67");
  assert.equal(rulesExtract("Pieces: 2823 (HAWB PCS)").values.pieces, "");
  assert.equal(rulesExtract("Pieces: about 12").values.pieces, "");
  assert.equal(rulesExtract("Pieces: about 12").review.includes("pieces"), true);
  assert.equal(rulesExtract("HAWB: H44110\nShipping Units: 67 PKGS").values.hawb, "H44110");
});

test("an AES ITN label fills the field and a goods line that mentions an ITN stays in goods", () => {
  const labeled = rulesExtract("Goods: ELECTRONICS AES ITN: X1 PMC 40106 R7=01 PC\nAES ITN: X20261021165293\nHandling: notify pacifiko");
  assert.equal(labeled.values.goods, "ELECTRONICS AES ITN: X1 PMC 40106 R7=01 PC");
  assert.equal(labeled.values.aesItn, "X20261021165293");
  assert.equal(labeled.values.handling, "notify pacifiko");
  const embedded = rulesExtract("Goods: ELECTRONICS / ACCESORIES AES ITN: X20261021165293 PMC 40106 R7=01 PC");
  assert.equal(embedded.values.goods, "ELECTRONICS / ACCESORIES AES ITN: X20261021165293 PMC 40106 R7=01 PC");
  assert.equal(embedded.values.aesItn, "");
});

test("without an AI complete function the label reader is used", async () => {
  const extracted = await extractGuia(SAMPLE, null);
  assert.equal(extracted.source, "rules");
  assert.match(extracted.note ?? "", /No AI key/);
  assert.equal(extracted.values.chargeableKg, "340");
});
