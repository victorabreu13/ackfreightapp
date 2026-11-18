import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { renderAwbPdf, type AwbPdfModel } from "@/lib/awb/pdf";
import { awbDate, flightDateLine, guiaPdfOverlay, routingTo } from "./awb-face";

test("the guía face fills routing, flight, country, notify, and AS ARRANGED", () => {
  assert.equal(routingTo("MIA"), "MIA");
  assert.equal(routingTo("Bogota"), "BOG");
  assert.equal(routingTo("Doral FL"), "");
  assert.equal(awbDate("20 Oct 2026"), "Oct/20/2026");
  assert.equal(awbDate("2026-10-07"), "Oct/07/2026");
  assert.equal(flightDateLine("LA401", "20 Oct 2026"), "LA401 Oct/20/2026");
  assert.equal(flightDateLine("", ""), "");
  const face = guiaPdfOverlay({
    destination: "BOG",
    carrierName: "LATAM AIRLINES GROUP",
    flightNumber: "LA401",
    flightDate: "20 Oct 2026",
    notifyName: "Andres Alvarado",
    notifyAddress: "Doral FL",
    status: "issued",
    executedOn: "Oct/17/2026",
    updatedAt: new Date("2026-10-17T18:00:00.000Z"),
  });
  assert.equal(face.to1, "BOG");
  assert.equal(face.by1, "LATAM AIRLINES GROUP");
  assert.equal(face.destCountry, "COLOMBIA");
  assert.equal(face.flightDate, "LA401 Oct/20/2026");
  assert.equal(face.executedOn, "Oct/17/2026");
  assert.equal(face.notifyParty, "Andres Alvarado, Doral FL");
  assert.equal(face.asArranged, true);
  assert.equal(guiaPdfOverlay({ ...blankFace(), carrierName: "ISSUING CARRIER" }).by1, "");
});

test("the AWB face prints notify, destination country, flight, and AS ARRANGED", async () => {
  const face = guiaPdfOverlay({
    destination: "BOG",
    carrierName: "ATLAS AIR",
    flightNumber: "LA401",
    flightDate: "20 Oct 2026",
    notifyName: "Andres Alvarado",
    notifyAddress: "",
    status: "issued",
    executedOn: "Oct/17/2026",
    updatedAt: new Date("2026-10-17T18:00:00.000Z"),
  });
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
    shipperName: "LAMAR CARGO",
    shipperAddress: "BOGOTA",
    shipperAccount: "",
    consigneeName: "KOPE LOGISTICS",
    consigneeAddress: "DORAL",
    consigneeAccount: "",
    carrierName: "ATLAS AIR",
    carrierAddress: "MIAMI",
    accountNo: "",
    referenceNumber: "",
    departure: "MIA",
    to1: face.to1,
    by1: face.by1,
    to2: "",
    by2: "",
    to3: "",
    by3: "",
    currency: "USD",
    chgsCode: "PP",
    wtVal: "PPD",
    otherPpc: "PPD",
    declaredCarriage: "NVD",
    declaredCustoms: "NCV",
    destination: "BOG",
    flightDate: face.flightDate,
    insurance: "",
    handling: "keep cool",
    notifyParty: face.notifyParty,
    asArranged: true,
    sci: "",
    destCountry: face.destCountry,
    otherChargesText: "",
    accountingInfo: "",
    lines: [{ pieces: 12, grossWeight: 310, kgLb: "K", chargeableWeight: 340, nature: "textiles" }],
    weightCharge: null,
    valuationCharge: null,
    taxCharge: null,
    otherDueAgent: null,
    otherDueCarrier: null,
    shipperSignature: "KOPE LOGISTICS INC.",
    executedOn: face.executedOn,
    executedAt: "MIA",
    carrierSignature: "KOPE LOGISTICS INC.",
  };
  const text = pdfPage(await renderAwbPdf(model), 1);
  assert.match(text, /Notify\s+Andres Alvarado/);
  assert.match(text, /COLOMBIA/);
  assert.match(text, /LA401 Oct\/20\/2026/);
  assert.match(text, /AS ARRANGED/);
  assert.match(text, /Oct\/17\/2026/);
  assert.match(text, /BOG/);
  assert.match(text, /340\.00/);
  const doubled = pdfPage(
    await renderAwbPdf({
      ...model,
      handling: "NOTIFY: Andres Alvarado\nkeep cool",
    }),
    1,
  );
  assert.equal(doubled.match(/Andres Alvarado/g)?.length, 1);
  assert.match(doubled, /keep cool/);
  const named = pdfPage(
    await renderAwbPdf({
      ...model,
      notifyParty: "AERO ASOCIADOS DE CARGA S.A, SERGIO BETANCOURT / TEL. 316 018 3113",
      handling: "NOTIFY: AERO ASOCIADOS DE CARGA S.A / SERGIO BETANCOURT / TEL. 316 018 3113\nkeep cool",
    }),
    1,
  );
  assert.equal(named.match(/AERO ASOCIADOS DE CARGA S\.A/g)?.length, 1);
  assert.equal(named.match(/SERGIO BETANCOURT/g)?.length, 1);
  assert.equal(named.match(/316 018 3113/g)?.length, 1);
  assert.match(named, /keep cool/);
  assert.doesNotMatch(named, /NOTIFY:/);
});

function blankFace() {
  return {
    destination: "",
    carrierName: null,
    flightNumber: null,
    flightDate: null,
    notifyName: null,
    notifyAddress: null,
    status: "draft",
    executedOn: null,
    updatedAt: new Date("2026-10-17T18:00:00.000Z"),
  };
}

function pdfPage(pdf: Buffer, page: number): string {
  const dir = mkdtempSync(join(tmpdir(), "guia-face-"));
  const file = join(dir, "awb.pdf");
  writeFileSync(file, pdf);
  const result = spawnSync("pdftotext", ["-f", String(page), "-l", String(page), "-raw", file, "-"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.replace(/\s+/g, " ");
}
