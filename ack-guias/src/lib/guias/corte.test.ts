import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { renderCorteAwb, renderCorteDo, renderCorteTsa, renderLithiumLetter } from "@/lib/guias/corte";
import type { GuiaRecord } from "@/lib/guias/files";
import type { CompanyView } from "./company-profile";

function company(agentKey: "ack" | "kope", overrides: Partial<CompanyView> = {}): CompanyView {
  const ack = agentKey === "ack";
  return {
    agentKey,
    brandName: ack ? "ACK Logistics" : "Kope Logistics",
    letterheadName: ack ? "ACK LOGISTICS" : "KOPE LOGISTICS INC.",
    address: ack
      ? "6550 NW 97TH AVE, SUITE 220, DORAL, FL 33178, UNITED STATES"
      : "6550 NW 97TH AVE, SUITE 220, DORAL, FL 33178, UNITED STATES",
    phone: ack ? "+1 (305) 915-3461" : "+1 (786) 719-0590",
    fax: ack ? "" : "+1 (305) 503-9451",
    opsEmail: ack ? "andres.alvarado@ackfreight.com" : "info@kopelogistics.com",
    contactName: "",
    contactTitle: "",
    termsUrl: "",
    tsaIacId: ack ? "" : "SE1701005",
    ccsfId: "",
    warehouseName: "",
    warehouseAddress: "",
    signerName: ack ? "Andres Alvarado" : "Levy Martinez",
    signerTitle: "",
    logo: null,
    logoMime: null,
    ...overrides,
  };
}

function guia(agentKey: "ack" | "kope"): GuiaRecord {
  return {
    agentKey,
    awb: "729-95048310",
    prefix: "729",
    serial: "95048310",
    status: "issued",
    shipperName: "PINTO INTERNATIONAL LOGISTICS",
    shipperAddress: "8298 NW 68TH ST, MIAMI, FL 33166, UNITED STATES",
    consigneeName: "PINTOPAQ SRL",
    consigneeAddress: "CALLE LEOVILDA DEL VILLAR NO. 4 SANTO DOMINGO ESTE, SANTO DOMINGO, DOMINICAN REPUBLIC",
    carrierName: "AVIANCA CARGO",
    carrierAddress: "AEROVIAS DEL CONTINENTE AMERICANO S.A.\nMIAMI, FL, UNITED STATES",
    departure: "MIA",
    destination: "SDQ",
    destCountry: "DOMINICAN REPUBLIC",
    flightNumber: "AV",
    flightDate: "2026-10-20",
    executedOn: "Oct/19/2026",
    executedAt: "MIAMI",
    currency: "USD",
    chgsCode: "PP",
    declaredCarriage: "NVC",
    declaredCustoms: "NVD",
    hawb: "",
    accountingInfo: "",
    handling: "",
    weightCharge: 3986.5,
    truckerName: "RL SERVICES TRANSPORT",
    driverName: "",
    seal: "",
    agent: {
      legalName: agentKey === "ack" ? "ACK TEAM LLC" : "KOPE LOGISTICS INC.",
      iataCode: agentKey === "ack" ? "SE1701005" : "01108240000",
      accountNo: agentKey === "ack" ? "A2939-US-MIA-MIA" : null,
      city: "Miami",
    },
    lines: [
      {
        pieces: 44,
        grossWeight: 2345,
        kgLb: "K",
        chargeableWeight: 2345,
        rate: 1.7,
        total: 3986.5,
        nature: "COURIER MATERIAL, COURIER XL, NO EEI AS PER SEC 30.37(a) FTSR, LITHIUM ION BATTERIES IN COMPLIANCE WITH SECTION II OF PI966 - 11 PCS",
        sortOrder: 0,
      },
    ],
  } as unknown as GuiaRecord;
}

function pdfText(pdf: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), "corte-"));
  const file = join(dir, "doc.pdf");
  writeFileSync(file, pdf);
  const result = spawnSync("pdftotext", ["-raw", file, "-"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.replace(/\s+/g, " ");
}

function pdfInfo(pdf: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), "corte-info-"));
  const file = join(dir, "doc.pdf");
  writeFileSync(file, pdf);
  const result = spawnSync("pdfinfo", [file], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

const now = new Date("2026-10-19T16:00:00.000Z");

test("the ACK AWB corte matches the 12-page reference wording", async () => {
  const pdf = await renderCorteAwb(guia("ack"), company("ack"), { email: "andres.alvarado@ackfreight.com", now });
  const text = pdfText(pdf);
  const info = pdfInfo(pdf);
  assert.match(info, /Pages:\s+12/);
  assert.match(info, /612 x 792/);
  assert.match(text, /PINTO INTERNATIONAL LOGISTICS/);
  assert.match(text, /PINTOPAQ SRL/);
  assert.match(text, /ACK LOGISTICS/);
  assert.match(text, /6550 NW 97TH AVE, SUITE 220/);
  assert.match(text, /SE1701005/);
  assert.match(text, /A2939-US-MIA-MIA/);
  assert.doesNotMatch(text, /SE2508006/);
  assert.match(text, /andres\.alvarado@ackfreight\.com/);
  assert.match(text, /FREIGHT PREPAID/);
  assert.match(text, /SANTO DOMINGO \(SDQ\)/);
  assert.match(text, /AV \/ Oct\/20\/2026/);
  assert.match(text, /3986\.50/);
  assert.match(text, /PI966/);
  assert.match(text, /ORIGINAL 1 \(ISSUING CARRIER\)/);
  assert.match(text, /ORIGINAL 2 \(CONSIGNEE\)/);
  assert.match(text, /ORIGINAL 3 \(SHIPPER\)/);
  assert.match(text, /COPY 4 \(DELIVERY RECEIPT\)/);
  assert.match(text, /COPY 6 \(EXTRA COPY\)/);
  assert.match(text, /Page 1 of 12/);
  assert.match(text, /Page 12 of 12/);
  assert.doesNotMatch(text, /KOPE LOGISTICS INC/);
});

test("a Kope guía uses the Kope letterhead on the same AWB form", async () => {
  const text = pdfText(await renderCorteAwb(guia("kope"), company("kope"), { email: "ops@kopelogistics.com", now }));
  assert.match(text, /KOPE LOGISTICS INC/);
  assert.match(text, /\+1 \(786\) 719-0590/);
  assert.match(text, /info@kopelogistics\.com/);
  assert.doesNotMatch(text, /ACK LOGISTICS/);
});

test("the delivery order uses the company header from the selector", async () => {
  const ack = pdfText(await renderCorteDo(guia("ack"), company("ack"), { email: "andres.alvarado@ackfreight.com", trucker: "RL SERVICES TRANSPORT", now }));
  assert.match(ack, /DELIVERY ORDER \(DO\) - EXPORT/);
  assert.match(ack, /ACK LOGISTICS/);
  assert.match(ack, /Phone: \+1 \(305\) 915-3461/);
  assert.match(ack, /Email: andres\.alvarado@ackfreight\.com/);
  assert.match(ack, /729-95048310/);
  assert.match(ack, /RL SERVICES TRANSPORT/);
  assert.match(ack, /PINTO INTERNATIONAL LOGISTICS/);
  assert.match(ack, /PINTOPAQ SRL/);
  assert.match(ack, /Miami, US \(MIA\)/);
  assert.match(ack, /NOTE: ACK LOGISTICS/);
  assert.match(pdfInfo(await renderCorteDo(guia("ack"), company("ack"), { email: "a@ackfreight.com", trucker: "RL SERVICES TRANSPORT", now })), /575 x 768/);
  const kope = pdfText(await renderCorteDo(guia("kope"), company("kope"), { email: "ops@kopelogistics.com", trucker: "JOE TRUCKING CO", driver: "Luis Perez", now }));
  assert.match(kope, /KOPE LOGISTICS INC/);
  assert.match(kope, /JOE TRUCKING CO/);
  assert.match(kope, /Luis Perez/);
  assert.doesNotMatch(kope, /ACK LOGISTICS/);
});

test("the lithium letter prints the company, shipper, and air waybill", async () => {
  const ack = pdfText(await renderLithiumLetter(guia("ack"), company("ack"), { email: "andres.alvarado@ackfreight.com", now }));
  assert.match(ack, /729-95048310/);
  assert.match(ack, /ACK LOGISTICS/);
  assert.match(ack, /\+1 \(305\) 915-3461/);
  assert.match(ack, /6550 NW 97TH AVE/);
  assert.match(ack, /PINTO INTERNATIONAL LOGISTICS/);
  assert.match(ack, /Oct\/19\/2026/);
  assert.match(pdfInfo(await renderLithiumLetter(guia("ack"), company("ack"), { email: "a@ackfreight.com", now })), /Pages:\s+1/);
  const kope = pdfText(await renderLithiumLetter(guia("kope"), company("kope"), { email: "ops@kopelogistics.com", now }));
  assert.match(kope, /KOPE LOGISTICS INC/);
  assert.doesNotMatch(kope, /ACK LOGISTICS/);
});

test("the TSA letter logo path still extracts the company name and address as text", async () => {
  const ackPdf = await renderCorteTsa(guia("ack"), company("ack"), { email: "andres.alvarado@ackfreight.com", name: "Andres Alvarado", trucker: "RL SERVICES TRANSPORT", now });
  const ack = pdfText(ackPdf);
  assert.match(ack, /ACK LOGISTICS/);
  assert.match(ack, /6550 NW 97TH AVE, SUITE 220, DORAL, FL 33178, UNITED STATES/);
  assert.match(ack, /SE2508006/);
  assert.doesNotMatch(ack, /SE1701005/);
  assert.match(ack, /Tel: \+1 \(305\) 915-3461/);
  assert.match(ack, /INDIRECT AIR CARRIER WRITTEN CERTIFICATION FOR A PASSENGER AIR CARRIER/);
  assert.doesNotMatch(ack, /<dD>>/);
  assert.doesNotMatch(ack, /ϲϰϱ/);
  const kope = pdfText(await renderCorteTsa(guia("kope"), company("kope"), { email: "ops@kopelogistics.com", name: "Levy Martinez", now }));
  assert.match(kope, /KOPE LOGISTICS INC/);
  assert.match(kope, /6550 NW 97TH AVE, SUITE 220, DORAL, FL 33178, UNITED STATES/);
  assert.match(kope, /SE1701005/);
  assert.doesNotMatch(kope, /SE2508006/);
  assert.match(kope, /Tel: \+1 \(786\) 719-0590/);
  assert.doesNotMatch(kope, /ACK LOGISTICS/);
});

const GOODS_045 =
  "ELECTRONICS / ACCESORIES LITHIUM ION BATTERIES IN COMPLIANCE WITH SECTION II OF PI967 LITHIUM METAL BATTERIES IN COMPLIANCE WITH SECTION II OF PI970 PMC 40106 R7=01 PC";
const PACIFIKO = "Notificar a pmorales@pacifiko. facturas_mia1@pacifiko.com + 1 305 540 7092 + 502 50873273";

function withNature(agentKey: "ack" | "kope", nature: string, extra: { handling?: string; aesItn?: string | null } = {}) {
  const base = guia(agentKey);
  return {
    ...base,
    awb: "045-53981966",
    prefix: "045",
    serial: "53981966",
    handling: extra.handling ?? "",
    aesItn: extra.aesItn ?? null,
    lines: [{ ...base.lines[0], nature }],
  } as unknown as GuiaRecord;
}

test("long nature of goods stays complete on the Kope and ACK air waybills", async () => {
  const tokens = Array.from({ length: 38 }, (_, index) => `GOODS-LINE-${String(index + 1).padStart(2, "0")} WIDE`);
  const nature = tokens.join("\n");
  for (const agentKey of ["ack", "kope"] as const) {
    const text = pdfText(await renderCorteAwb(withNature(agentKey, nature), company(agentKey), { email: "ops@example.com", now }));
    for (const token of tokens) assert.match(text, new RegExp(token));
  }
});

test("045-53981966 prints the goods and the Pacifiko line, and the ITN field, with no NO EEI line", async () => {
  const text = pdfText(
    await renderCorteAwb(withNature("ack", GOODS_045, { handling: PACIFIKO, aesItn: "X20261021165293" }), company("ack"), {
      email: "andres.alvarado@ackfreight.com",
      now,
    }),
  );
  assert.match(text, /ELECTRONICS \/ ACCESORIES/);
  assert.match(text, /PI967/);
  assert.match(text, /PI970/);
  assert.match(text, /PMC 40106 R7=01 PC/);
  assert.match(text, /pmorales@pacifiko/);
  assert.match(text, /facturas_mia1@pacifiko\.com/);
  assert.match(text, /AES ITN: X20261021165293/);
  assert.equal(text.match(/AES ITN: X20261021165293/g)?.length, 6);
  assert.doesNotMatch(text, /NO EEI/);
  assert.doesNotMatch(text, /NO EEI REQ 30\.37A PMC/);
});

test("goods that still contain an ITN phrase are not rewritten, and a blank ITN adds only the NO EEI line", async () => {
  const dirty = `${GOODS_045.replace(" PMC", " AES ITN: X20261021165293 PMC")}`;
  const kept = pdfText(
    await renderCorteAwb(withNature("ack", dirty, { handling: PACIFIKO, aesItn: "X20261021165293" }), company("ack"), {
      email: "andres.alvarado@ackfreight.com",
      now,
    }),
  );
  assert.match(kept, /PI970 AES ITN: X20261021165293 PMC 40106 R7=01 PC/);
  assert.doesNotMatch(kept, /NO EEI/);

  const open = pdfText(
    await renderCorteAwb(withNature("kope", "WIDGETS PMC 40106 R7=01 PC", { handling: PACIFIKO, aesItn: null }), company("kope"), {
      email: "ops@kopelogistics.com",
      now,
    }),
  );
  assert.match(open, /WIDGETS PMC 40106 R7=01 PC/);
  assert.match(open, /NO EEI REQ 30\.37\(a\)/);
  assert.match(open, /pmorales@pacifiko/);
  assert.doesNotMatch(open, /NO EEI REQ 30\.37A PMC/);
  assert.doesNotMatch(open, /WIDGETS NO EEI/);
});
