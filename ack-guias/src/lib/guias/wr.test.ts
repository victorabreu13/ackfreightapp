import assert from "node:assert/strict";
import test from "node:test";
import type { GuiaValues } from "@/lib/guias/extract";
import { applyReceiptsToGuia, lineVolumeM3, lineVolumeWeightKg, pickupNumber, receiptNumber, receiptTotals } from "@/lib/guias/wr";

const blank: GuiaValues = {
  client: "", shipper: "", shipperAddress: "", consignee: "", consigneeAddress: "", notify: "", notifyAddress: "", origin: "", destination: "",
  flightNumber: "", flightDate: "", pieces: "", chargeableKg: "", rate: "", grossKg: "", goods: "", handling: "", aesItn: "", hawb: "",
  dg: "", unNumbers: "", bup: "", bupItems: "", lithiumPi: "", issuingCompany: "ack",
};

test("receipt and pickup numbers", () => {
  assert.equal(receiptNumber(5499), "K5499");
  assert.equal(pickupNumber(7), "PU-0007");
});

test("the volume and the volume weight of a unit match the reference receipt K5499", () => {
  const first = { pieces: 4, length: 40.2, width: 33.9, height: 50.4, weightKg: 117.5 };
  const second = { pieces: 3, length: 37.4, width: 35.8, height: 48.4, weightKg: 152 };
  assert.equal(lineVolumeM3(first), 1.13);
  assert.equal(lineVolumeWeightKg(first), 187.59);
  assert.equal(lineVolumeM3(second), 1.06);
  assert.equal(lineVolumeWeightKg(second), 176.99);
  assert.deepEqual(receiptTotals([first, second]), { pieces: 7, weightKg: 269.5, volumeM3: 2.19, volumeWeightKg: 364.58, chargeableKg: 364.58 });
  assert.deepEqual(receiptTotals([]), { pieces: 0, weightKg: 0, volumeM3: 0, volumeWeightKg: 0, chargeableKg: 0 });
  assert.equal(lineVolumeM3({ length: null, width: 10, height: 10 }), 0);
});

test("the receipts of a guía add up and fill only what the guía left empty", () => {
  const receipts = [
    { client: "PACIFIKO, LLC", shipperName: "PACIFIKO, LLC", shipperAddress: "8504 NW 70th St", consigneeName: "Pacifiko Fulfillment", consigneeAddress: "GUATEMALA", dangerousGood: "HAZMAT - UN 3481", lines: [{ pieces: 4, length: 40.2, width: 33.9, height: 50.4, weightKg: 117.5, description: "ELECTRONICS" }] },
    { lines: [{ pieces: 3, length: 37.4, width: 35.8, height: 48.4, weightKg: 152, description: "ELECTRONICS" }] },
  ];
  const fed = applyReceiptsToGuia(blank, receipts);
  assert.equal(fed.values.pieces, "7");
  assert.equal(fed.values.grossKg, "269.5");
  assert.equal(fed.values.chargeableKg, "364.58");
  assert.equal(fed.values.goods, "ELECTRONICS");
  assert.equal(fed.values.shipper, "PACIFIKO, LLC");
  assert.equal(fed.values.dg, "1");
  assert.equal(fed.values.unNumbers, "UN3481");
  // What the guía already has stays, but the numbers follow the receipts.
  const kept = applyReceiptsToGuia({ ...blank, shipper: "OTHER", pieces: "99", goods: "TYPED", dg: "", unNumbers: "UN1950" }, receipts);
  assert.equal(kept.values.shipper, "OTHER");
  assert.equal(kept.values.goods, "TYPED");
  assert.equal(kept.values.unNumbers, "UN1950");
  assert.equal(kept.values.pieces, "7");
  assert.deepEqual(applyReceiptsToGuia(blank, []).changed, []);
});

test("the receipt PDF has the receipt and the cargo acceptance checklist", async () => {
  const { renderWarehouseReceipt } = await import("@/lib/guias/wr-pdf");
  const company = { letterheadName: "ACK LOGISTICS", address: "6550 NW 97TH AVE, SUITE 220, DORAL, FL 33178, UNITED STATES", phone: "+1 (305) 915-3461", fax: "", termsUrl: "" } as never;
  const pdf = await renderWarehouseReceipt(
    {
      seq: 5500, receivedAt: new Date("2026-10-29T18:00:00Z"), warehouse: "Warehouse 2 - Site 1", receivedBy: "Andres", shipperName: "ACME", shipperAddress: "1 MAIN ST", consigneeName: null, consigneeAddress: null,
      carrier: null, driver: "YUNIOR", driverLicense: null, supplier: null, invoiceNumber: null, poNumber: null, pickupNumber: null, trackingNumber: "045-56631396", proNumber: null,
      htPallet: false, palletType: null, dangerousGood: "HAZMAT - UN 3481", sealedDrum: null, notes: null,
      lines: [{ pieces: 2, packageType: "PLT", length: 40, width: 30, height: 20, weightKg: 100, location: "KF2", description: "ELECTRONICS", notes: null, pcTracking: null }],
    },
    company,
  );
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.equal((pdf.toString("latin1").match(/\/Type \/Page\b(?!s)/g) ?? []).length, 2);
});

test("a driver is the same whatever the spelling of the name or the carrier", async () => {
  const { driverKey } = await import("@/lib/guias/drivers");
  assert.equal(driverKey("Kay Air Delivery."), driverKey("KAY AIR  DELIVERY"));
  assert.equal(driverKey("José Pérez"), "JOSE PEREZ");
  assert.equal(driverKey(null), "");
});
