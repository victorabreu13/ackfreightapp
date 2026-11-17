import assert from "node:assert/strict";
import test from "node:test";
import type { CompanyView } from "@/lib/guias/company-profile";

// The renderer never touches the database, so a stand-in keeps this test independent of it.
(globalThis as { prisma?: unknown }).prisma = {};

const company: CompanyView = {
  agentKey: "ack",
  brandName: "ACK Freight",
  letterheadName: "ACK TEAM LLC",
  address: "6550 NW 97TH AVE, SUITE 220, DORAL, FL 33178, UNITED STATES",
  phone: "+1 (305) 915-3461",
  fax: "",
  opsEmail: "ops@ackfreight.com",
  contactName: "",
  contactTitle: "",
  termsUrl: "",
  tsaIacId: "",
  ccsfId: "",
  warehouseName: "",
  warehouseAddress: "",
  signerName: "Victor Abreu",
  signerTitle: "",
  logo: null,
  logoMime: null,
};

test("a house air waybill is the 12-page air waybill with the HAWB number, and a draft is one page", async () => {
  const { sampleGuia, samplePrintOptions } = await import("@/lib/guias/templates");
  const { renderHouseAwb } = await import("@/lib/guias/house-pdf");
  const master = sampleGuia();
  const house = { ...sampleGuia(), id: "house-1", product: "house", awb: "", prefix: "", serial: "", hawb: "ACK-000123", carrierName: null, carrierAddress: null, flightNumber: null, flightDate: null };
  const options = samplePrintOptions("team@ackfreight.com", "Team");
  const pdf = await renderHouseAwb(house, master, company, options);
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.equal((pdf.toString("latin1").match(/\/Type \/Page\b(?!s)/g) ?? []).length, 12);
  const draft = await renderHouseAwb(house, master, company, { ...options, draft: true });
  assert.equal((draft.toString("latin1").match(/\/Type \/Page\b(?!s)/g) ?? []).length, 1);
  // Without a master it still prints: the route and the airline come from the house itself.
  const alone = await renderHouseAwb(house, null, company, { ...options, draft: true });
  assert.equal(alone.subarray(0, 5).toString("latin1"), "%PDF-");
});
