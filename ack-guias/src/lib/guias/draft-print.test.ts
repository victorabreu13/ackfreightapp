import assert from "node:assert/strict";
import test from "node:test";
import type { CompanyView } from "@/lib/guias/company-profile";
import { renderGuiaPdf, type GuiaRecord } from "@/lib/guias/files";
import { sampleGuia, samplePrintOptions } from "@/lib/guias/templates";

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

const pages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type \/Page\b(?!s)/g) ?? []).length;
const options = samplePrintOptions("team@ackfreight.com", "Team");

/** A guía that has no AWB number yet. */
function draftGuia(): GuiaRecord {
  return { ...sampleGuia(), status: "draft", awb: "", prefix: "", serial: "" } as GuiaRecord;
}

async function failure(run: Promise<unknown>): Promise<{ status?: number; message: string }> {
  try {
    await run;
  } catch (error) {
    return { status: (error as { status?: number }).status, message: (error as Error).message };
  }
  assert.fail("expected the render to fail");
}

test("an issued AWB is still 12 pages and a draft copy is one page", async () => {
  const issued = await renderGuiaPdf("awb", sampleGuia(), company, options);
  assert.equal(pages(issued), 12);
  const draft = await renderGuiaPdf("awb", draftGuia(), company, { ...options, draft: true });
  assert.equal(pages(draft), 1);
  assert.equal(draft.subarray(0, 5).toString("latin1"), "%PDF-");
});

test("the AWB and labels still wait for the number unless a draft is asked for", async () => {
  assert.equal((await failure(renderGuiaPdf("awb", draftGuia(), company, options))).status, 409);
  assert.equal((await failure(renderGuiaPdf("labels", draftGuia(), company, options))).status, 409);
});

test("labels print before issuing when the AWB number is typed, and it must pass mod 7", async () => {
  const labels = await renderGuiaPdf("labels", draftGuia(), company, { ...options, draft: true, labelAwb: "045-55219415" });
  assert.equal(pages(labels), 2);
  const missing = await failure(renderGuiaPdf("labels", draftGuia(), company, { ...options, draft: true, labelAwb: "" }));
  assert.equal(missing.status, 400);
  const bad = await failure(renderGuiaPdf("labels", draftGuia(), company, { ...options, draft: true, labelAwb: "045-55219416" }));
  assert.equal(bad.status, 400);
  assert.match(bad.message, /mod-7/);
});
