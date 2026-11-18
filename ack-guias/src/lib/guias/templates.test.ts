import assert from "node:assert/strict";
import test from "node:test";
import { GUIA_FILE_KINDS, renderGuiaPdf } from "@/lib/guias/files";
import type { CompanyView } from "@/lib/guias/company-profile";
import { guiaTemplates, isTemplateKind, sampleGuia, samplePrintOptions, templateFileName } from "@/lib/guias/templates";

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

test("template downloads are named by what they print", () => {
  assert.equal(templateFileName("ccsp"), "TEMPLATE-ccsf.pdf");
  assert.equal(templateFileName("ccsf-alternate"), "TEMPLATE-ccsp.pdf");
  assert.equal(templateFileName("awb"), "TEMPLATE-awb.pdf");
  assert.equal(templateFileName("tsa-unknown"), "TEMPLATE-tsa-unknown.pdf");
});

test("the CCSF and the CCSP print three copies, one page each", async () => {
  const pages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type \/Page\b(?!s)/g) ?? []).length;
  for (const kind of ["ccsp", "ccsf-alternate"] as const) {
    const pdf = await renderGuiaPdf(kind, sampleGuia(), company, samplePrintOptions("team@ackfreight.com", "Team"));
    assert.equal(pages(pdf), 3, kind);
  }
  const single = await renderGuiaPdf("tsa", sampleGuia(), company, samplePrintOptions("team@ackfreight.com", "Team"));
  assert.equal(pages(single), 1);
});

test("the saved signature is drawn on the lithium letter and the issued AWB, and never on a draft", async () => {
  // A 1 x 1 PNG is enough: the file only has to be an image PDFKit can embed.
  const signature = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const options = samplePrintOptions("team@ackfreight.com", "Team");
  const signed = { ...company, signature };
  const images = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Subtype \/Image/g) ?? []).length;
  const lithiumPlain = await renderGuiaPdf("lithium", sampleGuia(), company, options);
  const lithiumSigned = await renderGuiaPdf("lithium", sampleGuia(), signed, options);
  assert.ok(images(lithiumSigned) > images(lithiumPlain));
  const awbPlain = await renderGuiaPdf("awb", sampleGuia(), company, { ...options, customerCopy: true });
  const awbSigned = await renderGuiaPdf("awb", sampleGuia(), signed, { ...options, customerCopy: true });
  assert.ok(images(awbSigned) > images(awbPlain));
  const draftPlain = await renderGuiaPdf("awb", sampleGuia(), company, { ...options, draft: true });
  const draftSigned = await renderGuiaPdf("awb", sampleGuia(), signed, { ...options, draft: true });
  assert.equal(images(draftSigned), images(draftPlain));
});
