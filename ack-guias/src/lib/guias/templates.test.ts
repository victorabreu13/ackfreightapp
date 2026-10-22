import assert from "node:assert/strict";
import test from "node:test";
import { GUIA_FILE_KINDS, renderGuiaPdf } from "@/lib/guias/files";
import type { CompanyView } from "@/lib/guias/company-profile";
import { guiaTemplates, isTemplateKind, sampleGuia, samplePrintOptions } from "@/lib/guias/templates";

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
  termsUrl: "https://www.ackfreight.com/",
  tsaIacId: "",
  ccsfId: "",
  warehouseName: "",
  warehouseAddress: "",
  signerName: "Victor Abreu",
  signerTitle: "",
  logo: null,
  logoMime: null,
};

test("the template list covers every document kind once", () => {
  const kinds = guiaTemplates().map((template) => template.kind);
  assert.deepEqual(kinds, [...GUIA_FILE_KINDS]);
  for (const template of guiaTemplates()) assert.ok(template.name && template.purpose && template.fileName.includes("{AWB}"), template.kind);
  assert.equal(isTemplateKind("awb"), true);
  assert.equal(isTemplateKind("nope"), false);
});

test("every template draws a PDF from the sample guía", async () => {
  for (const kind of GUIA_FILE_KINDS) {
    const pdf = await renderGuiaPdf(kind, sampleGuia(), company, samplePrintOptions("team@ackfreight.com", "Team"));
    assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-", kind);
  }
});
