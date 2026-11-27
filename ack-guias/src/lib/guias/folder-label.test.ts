import assert from "node:assert/strict";
import test from "node:test";
import type { CompanyView } from "@/lib/guias/company-profile";
import { GUIA_FILE_KINDS, guiaFileName, PRINT_SEPARATELY, renderGuiaPdf, type GuiaRecord } from "@/lib/guias/files";
import { folderRoute } from "@/lib/guias/folder-label";
import { sampleGuia, samplePrintOptions } from "@/lib/guias/templates";

const company = {
  agentKey: "ack",
  brandName: "ACK Freight",
  letterheadName: "ACK TEAM LLC",
  address: "6550 NW 97TH AVE, SUITE 220, DORAL, FL 33178, UNITED STATES",
  phone: "",
  fax: "",
  opsEmail: "",
  contactName: "",
  contactTitle: "",
  termsUrl: "",
  tsaIacId: "",
  ccsfId: "",
  warehouseName: "",
  warehouseAddress: "",
  signerName: "Victor",
  signerTitle: "",
  logo: null,
  logoMime: null,
} as CompanyView;

test("the route is the departure and the destination airport", () => {
  assert.equal(folderRoute({ departure: "MIA", destination: "GUA" }), "MIA-GUA");
  assert.equal(folderRoute({ departure: "", destination: "EZE" }), "MIA-EZE");
  assert.equal(folderRoute({ departure: "MIA", destination: "" }), "MIA");
});

test("the folder label is a 4 x 6 in portrait page, and before issuing it takes a typed AWB number", async () => {
  const options = samplePrintOptions("team@ackfreight.com", "Team");
  const pdf = await renderGuiaPdf("folder-label", { ...sampleGuia(), awb: "045-54058362", destination: "EZE" } as GuiaRecord, company, options);
  const text = pdf.toString("latin1");
  assert.equal(text.slice(0, 5), "%PDF-");
  assert.match(text, /\/MediaBox \[0 0 288 432\]/);
  assert.equal((text.match(/\/Type \/Page\b(?!s)/g) ?? []).length, 1);
  const failure = async (record: GuiaRecord, extra: { labelAwb?: string } = {}) => {
    try {
      await renderGuiaPdf("folder-label", record, company, { ...options, ...extra });
    } catch (error) {
      return (error as { status?: number }).status;
    }
    return undefined;
  };
  const draft = { ...sampleGuia(), status: "draft", awb: "", prefix: "", serial: "" } as GuiaRecord;
  assert.equal(await failure(draft), 400);
  assert.equal(await failure(draft, { labelAwb: "045-55219416" }), 400);
  // Before issuing, the AWB number can be typed.
  const typed = await renderGuiaPdf("folder-label", draft, company, { ...options, draft: true, labelAwb: "045-55219415" });
  assert.equal(typed.subarray(0, 5).toString("latin1"), "%PDF-");
});

test("the labels are printed on their own, not with the document pack", () => {
  assert.deepEqual([...PRINT_SEPARATELY], ["labels", "folder-label"]);
  assert.ok(GUIA_FILE_KINDS.includes("folder-label"));
  assert.equal(guiaFileName("folder-label", "045-54058362"), "FOLDER LABEL 045-54058362.pdf");
});
