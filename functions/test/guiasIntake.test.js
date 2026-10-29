const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { matchCustomer, normalizeName, requestDocId, sniffFile, validateGuiasPayload } = require("../guiasIntake");

const base = {
  externalId: "PU-0007",
  kind: "pickup",
  clientName: "Ivi Logistics",
  from: "Shipper Inc, 100 NW 1st St",
  to: "ACK Warehouse",
  tripDate: "2026-10-30",
  pickupTime: "14:30",
  awbLines: [{ awbNumber: "PU-0007", qtyPieces: 3, kilograms: 120.5 }],
};

describe("ACK Guías trip request intake", () => {
  it("accepts a good payload and fills the blanks", () => {
    const r = validateGuiasPayload(base);
    assert.equal(r.ok, true);
    assert.equal(r.value.personRequesting, "ACK Guías");
    assert.equal(r.value.awbLines[0].type, "Loose");
    assert.equal(r.value.awbLines[0].qtyPieces, 3);
    assert.equal(r.value.awbLines[0].kilograms, 120.5);
  });

  it("rejects missing or bad fields", () => {
    assert.equal(validateGuiasPayload({ ...base, externalId: "" }).ok, false);
    assert.equal(validateGuiasPayload({ ...base, externalId: "../../x" }).ok, false);
    assert.equal(validateGuiasPayload({ ...base, kind: "other" }).ok, false);
    assert.equal(validateGuiasPayload({ ...base, clientName: "", clientEmail: "" }).ok, false);
    assert.equal(validateGuiasPayload({ ...base, from: "" }).ok, false);
    assert.equal(validateGuiasPayload({ ...base, tripDate: "2026-02-30" }).ok, false);
    assert.equal(validateGuiasPayload({ ...base, pickupTime: "25:00" }).ok, false);
    assert.equal(validateGuiasPayload({ ...base, awbLines: [] }).ok, false);
    assert.equal(validateGuiasPayload({ ...base, awbLines: Array.from({ length: 11 }, () => ({ awbNumber: "1" })) }).ok, false);
    assert.equal(validateGuiasPayload(null).ok, false);
  });

  it("keeps only valid document slots and bounds the size", () => {
    const docs = [
      { slot: "awb", name: "a.pdf", contentBase64: "AAAA" },
      { slot: "evil", name: "b.pdf", contentBase64: "AAAA" },
      { slot: "do", name: "c.pdf", contentBase64: "" },
    ];
    const r = validateGuiasPayload({ ...base, awbLines: [{ awbNumber: "1", documents: docs }] });
    assert.deepEqual(r.value.awbLines[0].documents.map((d) => d.slot), ["awb"]);
    const huge = [{ slot: "awb", name: "x.pdf", contentBase64: "A".repeat(8000001) }];
    assert.equal(validateGuiasPayload({ ...base, awbLines: [{ awbNumber: "1", documents: huge }] }).ok, false);
  });

  it("unknown unit types become Loose; hazmat details only count for hazmat", () => {
    const r = validateGuiasPayload({ ...base, awbLines: [{ awbNumber: "1", type: "ZZZ", unNumber: "UN3481" }, { awbNumber: "2", type: "PMC", hazmat: true, unNumber: "UN3481" }] });
    assert.equal(r.value.awbLines[0].type, "Loose");
    assert.equal(r.value.awbLines[0].unNumber, "");
    assert.equal(r.value.awbLines[1].type, "PMC");
    assert.equal(r.value.awbLines[1].unNumber, "UN3481");
  });

  it("finds the customer by email, else by name, and never guesses between two", () => {
    const customers = [
      { id: "c1", data: { name: "Ivi Logistics", email: "ops@ivi.com" } },
      { id: "c2", data: { name: "Kope Logistics", email: "kope@x.com" } },
      { id: "c3", data: { name: "IVI-logistics", email: "other@ivi.com" } },
    ];
    assert.equal(matchCustomer(customers, { email: "OPS@ivi.com", name: "x" }).customer.id, "c1");
    assert.equal(matchCustomer(customers, { name: "kope logistics" }).customer.id, "c2");
    assert.equal(matchCustomer(customers, { name: "Ivi Logistics" }).ok, false); // c1 and c3 both match
    assert.equal(matchCustomer(customers, { name: "Nobody" }).ok, false);
    assert.equal(normalizeName(" IVI-Logistics "), "ivilogistics");
  });

  it("builds a stable, safe document id and recognizes file types", () => {
    assert.equal(requestDocId("pickup", "PU-0007"), "guias_pickup_PU-0007");
    assert.equal(requestDocId("delivery", "a/b c"), "guias_delivery_a_b_c");
    assert.equal(sniffFile(Buffer.from("%PDF-1.7")), "pdf");
    assert.equal(sniffFile(Buffer.from([0x89, 0x50, 0x4e, 0x47])), "png");
    assert.equal(sniffFile(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "jpg");
    assert.equal(sniffFile(Buffer.from("<script>")), null);
  });
});
