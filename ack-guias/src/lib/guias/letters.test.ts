import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import zlib from "node:zlib";
import { guiaFileName, loadedForGuia, renderGuiaPdf, type GuiaPrintOptions, type GuiaRecord } from "@/lib/guias/files";
import { ccsfLetter, deliveryOrder, labels, pickupOrder, tsaLetter } from "@/lib/sheets/documents";
import { ccsfAlternateLetter, tsaUnknownLetter, type ExtraLetter } from "@/lib/sheets/extra-letters";
import { identityFor, kopeIdentity, normalizeTrucker } from "@/lib/sheets/layout";
import { KOPE_LOGO_PNG } from "@/lib/sheets/kope-logo";
import type { CompanyView } from "./company-profile";

function company(overrides: Partial<CompanyView> = {}): CompanyView {
  return {
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
    ...overrides,
  };
}

function extra(overrides: Partial<ExtraLetter> = {}): ExtraLetter {
  return {
    agentKey: "kope",
    identity: kopeIdentity(),
    logo: KOPE_LOGO_PNG,
    legAwb: "369-11444436",
    destination: "BOG",
    shipperName: "GWEN TRADING CORP",
    flightDate: "2026-10-13",
    trucker: "ACK TEAM LLC",
    seal: "",
    driver: "",
    signerName: "Hector Zambrano",
    documentDate: new Date("2026-10-14T16:00:00.000Z"),
    ...overrides,
  };
}

function pdfText(pdf: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), "interno-"));
  const file = join(dir, "doc.pdf");
  writeFileSync(file, pdf);
  const result = spawnSync("pdftotext", ["-raw", file, "-"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.replace(/\s+/g, " ");
}

function contentStream(pdf: Buffer): string {
  const streams: Buffer[] = [];
  const marker = Buffer.from("stream\n");
  let cursor = 0;
  while (cursor < pdf.length) {
    const start = pdf.indexOf(marker, cursor);
    if (start < 0) break;
    const dataStart = start + marker.length;
    const end = pdf.indexOf("endstream", dataStart);
    if (end < 0) break;
    let raw = pdf.subarray(dataStart, end);
    if (raw[raw.length - 1] === 10) raw = raw.subarray(0, raw.length - 1);
    try {
      streams.push(zlib.inflateSync(raw));
    } catch {
      streams.push(raw);
    }
    cursor = end + 9;
  }
  return Buffer.concat(streams).toString("latin1");
}

function pageInfo(pdf: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), "interno-info-"));
  const file = join(dir, "doc.pdf");
  writeFileSync(file, pdf);
  const result = spawnSync("pdfinfo", [file], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function imageWidths(pdf: Buffer): number[] {
  const dir = mkdtempSync(join(tmpdir(), "interno-img-"));
  const file = join(dir, "doc.pdf");
  writeFileSync(file, pdf);
  const result = spawnSync("pdfimages", ["-list", file], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter((cols) => cols[2] === "image")
    .map((cols) => Number(cols[3]));
}

function sameDocument(guiaPdf: Buffer, originalPdf: Buffer) {
  assert.equal(pdfText(guiaPdf), pdfText(originalPdf));
  const guiaInfo = pageInfo(guiaPdf);
  const originalInfo = pageInfo(originalPdf);
  assert.equal(guiaInfo.match(/Pages:\s+\d+/)?.[0], originalInfo.match(/Pages:\s+\d+/)?.[0]);
  assert.equal(guiaInfo.match(/Page size:\s+.*/)?.[0], originalInfo.match(/Page size:\s+.*/)?.[0]);
}

test("file names use the sheet names, and master labels use the master AWB", () => {
  assert.equal(guiaFileName("awb", "810-51043801"), "810-51043801 - GUIA MADRE.pdf");
  assert.equal(guiaFileName("awb", ""), "DRAFT - GUIA MADRE.pdf");
  assert.equal(guiaFileName("pickup", "045-55219415", "160-18211955"), "PICKUP ORDER 160-18211955.pdf");
  assert.equal(guiaFileName("labels", "045-55219415"), "LABELS 045-55219415.pdf");
  assert.equal(guiaFileName("labels", "045-55219415", "160-18211955", { masterLabel: true }), "MASTER-LABELS 160-18211955.pdf");
  assert.equal(guiaFileName("tsa-unknown", "369-10297980"), "TSA_UNKNOWN_369-10297980.pdf");
  assert.equal(guiaFileName("ccsf-alternate", "369-10298466"), "369-10298466_CCSP.pdf");
  assert.equal(guiaFileName("lithium", "729-95048310"), "FORM_LithiumBatteryLetter_729-95048310.pdf");
});

test("Guías sheet documents match the original functions", async () => {
  const record = {
    id: "guia-test",
    agentKey: "ack",
    awb: "045-55219415",
    prefix: "045",
    serial: "55219415",
    status: "issued",
    product: "guia",
    hawb: "H44110",
    carrierName: "LATAM",
    destination: "BOG",
    departure: "MIA",
    shipperName: "GWEN TRADING CORP",
    shipperAddress: "1300 DOVE ST STE 205 NEWPORT BEACH, CA 92660, UNITED STATES",
    consigneeName: "COLOCAR CARGO LOGISTICS S.A.S",
    consigneeAddress: "CALLE 26 92 32",
    clientLabel: "IVI Logistics",
    flightNumber: "LA401",
    flightDate: "2026-10-21",
    truckerName: "KAY AIR DELIVERY MIA LLC",
    truckerPhone: "(305) 555-0199",
    seal: "A61652",
    driverName: "Luis Perez",
    lines: [{ id: "line", documentId: "guia-test", pieces: 2, chargeableWeight: 1820, grossWeight: 1666, nature: "BUP", kgLb: "K", sortOrder: 0 }],
    agent: { key: "ack", legalName: "ACK TEAM LLC" },
    createdAt: new Date("2026-10-17T12:00:00.000Z"),
    updatedAt: new Date("2026-10-17T12:00:00.000Z"),
  } as unknown as GuiaRecord;
  const options: GuiaPrintOptions = {
    email: "hector.zambrano@kopelogistics.com",
    name: "Hector Zambrano",
    trucker: "KAY AIR DELIVERY MIA LLC",
    driver: "Luis Perez",
    seal: "A61652",
    now: new Date("2026-10-17T18:00:00.000Z"),
  };
  const RealDate = Date;
  const fixed = new Date("2026-10-17T18:30:00.000Z");
  class FrozenDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(fixed.getTime());
      else super(...(args as ConstructorParameters<typeof RealDate>));
    }
    static now() {
      return fixed.getTime();
    }
  }
  globalThis.Date = FrozenDate as DateConstructor;
  try {
    const loaded = await loadedForGuia(record, company(), options);
    const opts = { email: options.email, trucker: "KAY AIR DELIVERY MIA LLC", driver: "Luis Perez", seal: "A61652" };
    const deliveryGuia = await renderGuiaPdf("delivery", record, company(), options);
    const deliveryText = pdfText(deliveryGuia);
    assert.match(deliveryText, /DELIVERY ORDER \(DO\) - EXPORT/);
    assert.match(deliveryText, /ACK TEAM LLC/);
    assert.match(deliveryText, /045-55219415/);
    assert.match(deliveryText, /KAY AIR DELIVERY MIA LLC/);
    assert.match(deliveryText, /GWEN TRADING CORP/);
    assert.match(deliveryText, /COLOCAR CARGO LOGISTICS/);
    assert.match(deliveryText, /Driver Name:/);
    assert.match(deliveryText, /Luis Perez/);
    assert.match(pageInfo(deliveryGuia), /575 x 768/);
    const deliveryOriginal = pdfText(await deliveryOrder(loaded, opts));
    assert.match(deliveryOriginal, /LATAM AIRLINES CARGO \(MIA\)/);
    assert.match(deliveryOriginal, /1801 NW 66 AVENUE BLDG 709,/);
    assert.match(deliveryOriginal, /Phone: \(305\) 993-8568/);
    assert.match(deliveryOriginal, /2469 SW 23RD TER, MIAMI, FL/);

    const pickupGuia = await renderGuiaPdf("pickup", record, company(), options);
    const pickupSheet = await pickupOrder(loaded, opts);
    const pickupText = pdfText(pickupGuia);
    assert.match(pickupText, /PICK UP ORDER/);
    assert.match(pickupText, /KPU-55219415/);
    assert.match(pickupText, /Pickup information/);
    assert.match(pickupText, /Delivery information/);
    assert.match(pickupText, /ACK TEAM LLC/);
    assert.match(pickupText, /GWEN TRADING CORP/);
    assert.match(pickupText, /COLOCAR CARGO LOGISTICS/);
    assert.match(pickupText, /045-55219415/);
    assert.match(pickupText, /Luis Perez/);
    assert.match(pickupText, /\(305\) 555-0199/);
    assert.doesNotMatch(pickupText, /DELIVERY ORDER/);
    assert.match(pageInfo(pickupGuia), /612 x 792/);
    assert.equal(imageWidths(pickupGuia).includes(1958), true);
    assert.match(pdfText(pickupSheet), /KOPE LOGISTICS INC\./);
    assert.match(pdfText(pickupSheet), /KPU-55219415/);
    assert.equal(imageWidths(pickupSheet).includes(1958), false);

    const tsaGuia = await renderGuiaPdf("tsa", record, company(), options);
    const tsaText = pdfText(tsaGuia);
    assert.match(tsaText, /INDIRECT AIR CARRIER WRITTEN CERTIFICATION FOR A PASSENGER AIR CARRIER/);
    assert.match(tsaText, /ACK TEAM LLC/);
    assert.match(tsaText, /6550 NW 97TH AVE, SUITE 220, DORAL, FL 33178, UNITED STATES/);
    assert.match(tsaText, /SE2508006/);
    assert.doesNotMatch(tsaText, /SE1701005/);
    assert.doesNotMatch(tsaText, /<dD>>/);
    assert.match(tsaText, /Destination:\s+Bogota/);
    assert.match(tsaText, /1,540\.105\(b\)/);
    assert.match(tsaText, /49C\.F\.R\./);
    assert.match(tsaText, /Unathorized/);
    assert.match(tsaText, /Goverment/);
    const tsaOriginal = pdfText(await tsaLetter(loaded, opts));
    assert.match(tsaOriginal, /KOPE LOGISTICS INC\./);
    assert.match(tsaOriginal, /Destination:\s+BOG/);

    const ccsfGuia = await renderGuiaPdf("ccsp", record, company(), options);
    const ccsfSheet = await ccsfLetter(loaded, opts);
    const ccsfText = pdfText(ccsfGuia);
    assert.match(ccsfText, /CCSSSF CERTIFICATE OF TENDER TO A CARGO CARRIER/);
    // The CCSF is always Kope's certificate, even for an ACK guía.
    assert.match(ccsfText, /KOPE LOGISTICS INC\./);
    assert.doesNotMatch(ccsfText, /ACK TEAM LLC/);
    assert.match(ccsfText, /Unkown Shipper/);
    assert.match(ccsfText, /fradulent/);
    assert.match(ccsfText, /SEAL #/);
    assert.match(ccsfText, /A61652/);
    assert.match(ccsfText, /KAY AIR DELIVERY MIA LLC/);
    assert.match(ccsfText, /Luis Perez/);
    assert.match(ccsfText, /045-55219415/);
    assert.match(ccsfText, /SE1701005/);
    assert.doesNotMatch(ccsfText, /SE2508006/);
    assert.match(ccsfText, /6450 NW 97TH/);
    assert.match(ccsfText, /MIA\.C\.05\.20\.2025\.582/);
    assert.match(ccsfText, /PH\. 786-719-0590/);
    assert.doesNotMatch(ccsfText, /NOT SET/);
    assert.match(pageInfo(ccsfGuia), /612 x 792/);
    assert.match(pdfText(ccsfSheet), /KOPE LOGISTICS INC\./);
    assert.match(pdfText(ccsfSheet), /understands/);

    const ccspGuia = await renderGuiaPdf("ccsf-alternate", record, company(), options);
    const ccspText = pdfText(ccspGuia);
    assert.match(ccspText, /INDIRECT AIR CARRIER CERTIFICATION FOR CCSF CARGO/);
    assert.match(ccspText, /ACK TEAM LLC/);
    assert.match(ccspText, /SE2508006/);
    assert.doesNotMatch(ccspText, /SE1701005/);
    assert.doesNotMatch(ccspText, /6450 NW 97TH/);
    assert.match(ccspText, /conjuction/);
    assert.match(ccspText, /A61652/);
    assert.match(ccspText, /KAY AIR DELIVERY MIA LLC/);
    assert.doesNotMatch(ccspText, /NOT SET/);
    assert.match(pageInfo(ccspGuia), /612 x 792/);

    const legGuia = await renderGuiaPdf("labels", record, company(), options);
    const sheetLeg = await labels(loaded, "leg");
    const legText = pdfText(legGuia);
    assert.match(legText, /ACK TEAM LLC/);
    assert.match(legText, /6550 NW 97TH AVE, SUITE 220/);
    assert.match(legText, /Tel: \+1 \(305\) 915-3461/);
    assert.doesNotMatch(legText, /KOPE LOGISTICS INC/);
    assert.match(legText, /045-55219415/);
    assert.doesNotMatch(legText, /INBOUND /);
    assert.match(legText, /BOG/);
    assert.match(legText, /Magaya Cargo System\. www\.magaya\.com/);
    assert.match(legText, /MASTER WAY BILL NUMBER/);
    assert.match(pageInfo(legGuia), /Pages:\s+2/);
    assert.match(pageInfo(legGuia), /612 x 792/);
    assert.equal(imageWidths(legGuia).includes(1958), true);
    assert.match(pdfText(sheetLeg), /KOPE LOGISTICS INC\./);
    assert.doesNotMatch(pdfText(sheetLeg), /Magaya Cargo System/);
    assert.equal(imageWidths(sheetLeg).includes(1958), false);
    assert.equal(imageWidths(sheetLeg).includes(440), false);
    assert.match(pageInfo(sheetLeg), /288 x 432/);
    const kopeLeg = await renderGuiaPdf(
      "labels",
      record,
      company({
        agentKey: "kope",
        letterheadName: "KOPE LOGISTICS INC.",
        brandName: "Kope Logistics",
        address: "6550 NW 97TH AVE, SUITE 220\nDORAL, FL 33178.\nUNITED STATES",
        phone: "+1 (786) 719-0590",
        fax: "+1 (305) 503-9451",
      }),
      options,
    );
    const kopeText = pdfText(kopeLeg);
    assert.match(kopeText, /KOPE LOGISTICS INC\./);
    assert.match(kopeText, /6550 NW 97TH AVE, SUITE 220/);
    assert.match(kopeText, /DORAL, FL 33178\./);
    assert.match(kopeText, /UNITED STATES/);
    assert.match(kopeText, /Tel: \+1 \(786\) 719-0590, Fax: \+1 \(305\) 503-9451/);
    assert.match(kopeText, /Magaya Cargo System\. www\.magaya\.com/);
    assert.equal(imageWidths(kopeLeg).includes(440), false);
    assert.equal(imageWidths(kopeLeg).includes(1958), false);
    assert.match(pageInfo(kopeLeg), /612 x 792/);

    const linePieces = await renderGuiaPdf(
      "labels",
      { ...record, lines: [{ ...record.lines[0], pieces: 4 }] },
      company(),
      options,
    );
    assert.match(pageInfo(linePieces), /Pages:\s+4/);

    const masterOptions = { ...options, masterLabel: true };
    const masterLoaded = await loadedForGuia(record, company(), masterOptions);
    const masterGuia = await renderGuiaPdf("labels", record, company(), masterOptions);
    const sheetMaster = await labels(masterLoaded, "master");
    const masterText = pdfText(masterGuia);
    assert.match(masterText, /ACK TEAM LLC/);
    assert.match(masterText, /045-55219415/);
    assert.match(masterText, /MIA/);
    assert.doesNotMatch(masterText, /INBOUND/);
    assert.match(masterText, /Magaya Cargo System/);
    assert.match(pageInfo(masterGuia), /612 x 792/);
    assert.equal(imageWidths(masterGuia).includes(1958), true);
    assert.match(pdfText(sheetMaster), /KOPE LOGISTICS INC\./);
    assert.equal(imageWidths(sheetMaster).includes(1958), false);
    assert.match(pageInfo(sheetMaster), /288 x 432/);

    const missingRecord = {
      ...record,
      consigneeName: "",
      consigneeAddress: "",
      lines: [{ id: "line", documentId: "guia-test", pieces: 1, chargeableWeight: 10, grossWeight: 10, nature: "Courier", kgLb: "K", sortOrder: 0 }],
    } as unknown as GuiaRecord;
    const missing = await renderGuiaPdf("labels", missingRecord, company(), { ...options, masterLabel: false });
    const missingOriginal = await labels(await loadedForGuia(missingRecord, company(), options), "leg");
    assert.match(pdfText(missing), /CONSIGNEE MISSING/);
    assert.match(pdfText(missing), /ACK TEAM LLC/);
    assert.match(pdfText(missing), /Magaya Cargo System/);
    assert.match(pdfText(missingOriginal), /CONSIGNEE MISSING/);
    assert.match(pdfText(missingOriginal), /KOPE LOGISTICS INC\./);
    assert.match(contentStream(missing), /0\.7254901960784313 0\.10980392156862745 0\.10980392156862745 scn/);
    assert.match(pageInfo(missing), /612 x 792/);
    assert.match(pageInfo(missingOriginal), /288 x 432/);
  } finally {
    globalThis.Date = RealDate;
  }
});

test("trucker names are uppercased and not expanded", async () => {
  assert.equal(normalizeTrucker("ack team"), "ACK TEAM");
  assert.equal(normalizeTrucker("joe trucking co"), "JOE TRUCKING CO");
  assert.equal(normalizeTrucker("  Ack Team LLC  "), "ACK TEAM LLC");
  assert.equal(normalizeTrucker("kay air"), "KAY AIR");
  assert.equal(normalizeTrucker(null), "");
  assert.equal(normalizeTrucker("   "), "");
  assert.equal(normalizeTrucker("a".repeat(130)).length, 120);
  const loaded = {
    awb: "160-18211955",
    dest: "BOG",
    origin: "MIA",
    pcs: 1,
    kgs: 10,
    chw: 10,
    build: null,
    flightNumber: null,
    eta: null,
    etd: null,
    consignee: null,
    legs: [],
    airWaybills: [],
    client: { name: "IVI Logistics", code: "IVI", awbParties: [] },
  } as unknown as Parameters<typeof deliveryOrder>[0];
  for (const input of ["ack team", "joe trucking co"] as const) {
    const printed = normalizeTrucker(input);
    const opts = { trucker: printed, email: "andres.alvarado@kopelogistics.com" };
    const docs = [
      await deliveryOrder(loaded, opts),
      await pickupOrder(loaded, opts),
      await ccsfLetter(loaded, opts),
      await tsaLetter(loaded, opts),
    ];
    for (const pdf of docs) {
      const text = pdfText(pdf);
      assert.match(text, new RegExp(printed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      if (input === "ack team") assert.doesNotMatch(text, /ACK TEAM LLC/);
    }
  }
});

test("TSA unknown and CCSF alternate letters keep the handmade wording", async () => {
  const kope = extra({ seal: "A61630", driver: "Luis Perez" });
  const unknown = pdfText(await tsaUnknownLetter(kope));
  const alternate = pdfText(await ccsfAlternateLetter(kope));
  assert.match(unknown, /INDIRECT AIR CARRIER WRITTEN CERTIFICATION FOR AN ALL CARGO AIRCRAFT ONLY/);
  assert.match(unknown, /UNKNOWN SHIPPER not exempted by TSA/);
  assert.match(unknown, /ONLY ON ALL-CARGO AIRCRAFT/);
  assert.match(unknown, /SE1701005/);
  assert.match(unknown, /49 CFR Part 1,540\.103\(b\)/);
  assert.doesNotMatch(unknown, /Part 1540\.103/);
  assert.match(unknown, /Printed Name and Signature of IAC Employee: Hector Zambrano/);
  assert.match(unknown, /tendering cargo: ACK TEAM LLC/);
  assert.match(unknown, /Origin: Miami/);
  assert.match(unknown, /Destination: Bogota/);
  assert.match(unknown, /Departure Date: Oct\/13\/26/);
  assert.match(unknown, /Master Airway Bill No\.: 369-11444436/);
  assert.match(unknown, /This records contains sensitive information/);
  assert.match(unknown, /No\. part of this training may be disclosure/);
  assert.doesNotMatch(unknown, /Known Shipper/);
  assert.doesNotMatch(unknown, /NOT SET/);

  assert.match(alternate, /CCSF CERTIFICATE OF TENDER TO A CARGO CARRIER/);
  assert.match(alternate, /KOPE LOGISTICS INC is in compliance/);
  assert.match(alternate, /certified cargo screening standard security program \(CCSSSP\)/);
  assert.match(alternate, /MIA\.C\.05\.20\.2025\.582, DSA2-6450/);
  assert.match(alternate, /6450 NW 97TH AVE, SUITE 130 Doral, FL 33178/);
  assert.match(alternate, /ACK TEAM LLC \| Luis Perez/);
  assert.doesNotMatch(alternate, /CCSSSF/);
  assert.doesNotMatch(alternate, /NOT SET/);

  const ack = extra({ agentKey: "ack", identity: identityFor("ack", company()), logo: null });
  const ackUnknown = pdfText(await tsaUnknownLetter(ack));
  const ackAlternate = pdfText(await ccsfAlternateLetter(ack));
  assert.match(ackUnknown, /ACK TEAM LLC is in compliance/);
  assert.match(ackUnknown, /SE2508006/);
  assert.match(ackUnknown, /SUITE 220/);
  assert.doesNotMatch(ackUnknown, /SE1701005/);
  assert.doesNotMatch(ackUnknown, /NOT SET/);
  assert.match(ackAlternate, /ACK TEAM LLC is in compliance/);
  assert.match(ackAlternate, /SE2508006/);
  assert.match(ackAlternate, /SUITE 220/);
  assert.match(ackAlternate, /CCSSSP/);
  assert.doesNotMatch(ackAlternate, /SE1701005/);
  assert.doesNotMatch(ackAlternate, /DSA2-6450/);
  assert.doesNotMatch(ackAlternate, /MIA\.C\.05\.20\.2025\.582/);
  assert.doesNotMatch(ackAlternate, /6450 NW 97TH/);
});
