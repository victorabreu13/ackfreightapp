import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ACK_LATAM_EN, ACK_LATAM_ES, KOPE_ATLAS_EN, paragraphs } from "./conditions";
import { renderAwbPdf, type AwbPdfModel } from "./pdf";

function pdfPage(pdf: Buffer, page: number): string {
  const dir = mkdtempSync(join(tmpdir(), "awb-pdf-"));
  const file = join(dir, "awb.pdf");
  writeFileSync(file, pdf);
  const result = spawnSync("pdftotext", ["-f", String(page), "-l", String(page), "-raw", file, "-"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.replace(/\s+/g, " ").replace(/\s*\/\s*/g, "/");
}

function norm(text: string): string {
  return text.replace(/\s+/g, " ").replace(/\s*\/\s*/g, "/").trim();
}

function assertEveryParagraph(haystack: string, source: string) {
  const page = norm(haystack);
  for (const paragraph of paragraphs(source)) {
    const needle = norm(paragraph);
    assert.ok(page.includes(needle), `missing paragraph: ${needle.slice(0, 90)}`);
  }
}

const model: AwbPdfModel = {
  awb: "369-11441102",
  prefix: "369",
  serial: "11441102",
  agent: {
    legalName: "KOPE LOGISTICS INC.",
    address: "6550 NW 97TH AVE",
    phone: null,
    city: "Miami",
    iataCode: "01108240000",
    accountNo: null,
    conditions: "en",
    copyLabel: null,
  },
  shipperName: "GWEN TRADING CORP",
  shipperAddress: "NEWPORT BEACH",
  shipperAccount: "",
  consigneeName: "COLOCAR CARGO LOGISTICS S.A.S",
  consigneeAddress: "BOGOTA",
  consigneeAccount: "",
  carrierName: "ATLAS AIR",
  carrierAddress: "MIAMI",
  accountNo: "",
  referenceNumber: "",
  departure: "Miami",
  to1: "BOG",
  by1: "ATLAS AIR",
  to2: "",
  by2: "",
  to3: "",
  by3: "",
  currency: "USD",
  chgsCode: "PP",
  wtVal: "PPD",
  otherPpc: "PPD",
  declaredCarriage: "NVC",
  declaredCustoms: "NVD",
  destination: "Bogota",
  flightDate: "- Oct/04/2026",
  insurance: "MAX FREE",
  handling: "NOTIFY",
  sci: "",
  destCountry: "COLOMBIA",
  otherChargesText: "",
  accountingInfo: "FREIGHT PREPAID",
  lines: [{ pieces: 1, grossWeight: 1, kgLb: "K", chargeableWeight: 1, rate: 1, total: 1, nature: "GOODS" }],
  weightCharge: 1,
  valuationCharge: 0,
  taxCharge: 0,
  otherDueAgent: 0,
  otherDueCarrier: 0,
  shipperSignature: "KOPE LOGISTICS INC.",
  executedOn: "Oct/02/2026",
  executedAt: "Miami",
  carrierSignature: "KOPE LOGISTICS INC.",
};

test("the Kope conditions page contains every verbatim paragraph", async () => {
  const text = pdfPage(await renderAwbPdf(model), 2);
  assertEveryParagraph(text, KOPE_ATLAS_EN);
  assert.match(text, /each Carrier/);
  assert.match(text, /NOTICE CONCERNING CARRIERS' LIMITATION OF LIABILITY/);
});

test("the ACK conditions page contains every English and Spanish paragraph", async () => {
  const text = pdfPage(
    await renderAwbPdf({
      ...model,
      agent: { ...model.agent, conditions: "bilingual", copyLabel: "Original 2 (for Consignee) - Pink" },
    }),
    2,
  );
  assertEveryParagraph(text, ACK_LATAM_EN);
  assertEveryParagraph(text, ACK_LATAM_ES);
  assert.match(text, /eachCarrier/);
  assert.match(text, /pos su actos/);
  assert.match(text, /Todos lo derechos/);
  assert.match(text, /En expedidor/);
  assert.match(text, /7\.2\.3/);
  assert.match(text, /IATA Res600b Dec\/2024/);
});
