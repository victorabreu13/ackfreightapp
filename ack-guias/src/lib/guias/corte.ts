import { readFileSync } from "node:fs";
import { join } from "node:path";
import bwipjs from "bwip-js/node";
import PDFDocument from "pdfkit";
import { cityForAirport, codeForPlace, countryForAirport } from "@/lib/awb/airports";
import { tsaIacFor, type CompanyView } from "@/lib/guias/company-profile";
import { DG_HANDLING_LINE, lithiumSectionIIStatement } from "@/lib/guias/dg";
import type { GuiaPrintOptions, GuiaRecord } from "@/lib/guias/files";
import { formatFlightDate, sheetDate, signerName } from "@/lib/sheets/layout";
import { KOPE_LOGO_PNG } from "@/lib/sheets/kope-logo";

/**
 * Guías corte layouts, ported from the handmade reportlab set for AWB 729-95048310
 * (make.py, make_full.py, make_do.py, make_form.py). Coordinates are that file's
 * top-of-page measurements. Text uses the standard Helvetica fonts so the company
 * name and address stay selectable. The sheet renderer in documents.ts is not used here.
 */

const assets = join(process.cwd(), "src/lib/guias/assets");
const ACK_LOGO_PNG = readFileSync(join(assets, "ack-logo.png"));
const CONDITIONS_PNG = readFileSync(join(assets, "cond200.png"));
const LITHIUM_FORM_PNG = readFileSync(join(assets, "form-clean.png"));

const CYAN = "#00d1db";
const GREY = "#737373";
const RULE = "#000000";

const COPY_LABELS = [
  "ORIGINAL 1 (ISSUING CARRIER)",
  "ORIGINAL 2 (CONSIGNEE)",
  "ORIGINAL 3 (SHIPPER)",
  "COPY 4 (DELIVERY RECEIPT)",
  "COPY 5 (EXTRA COPY)",
  "COPY 6 (EXTRA COPY)",
] as const;

const DRAFT_LABEL = "DRAFT - NOT A VALID AIR WAYBILL";

const AGREEMENT = [
  "It is agreed that the goods described herein are accepted in apparent good order and condition",
  "(except as noted) for carriage SUBJECT TO THE CONDITIONS OF CONTRACT ON THE",
  "REVERSE HEREOF. ALL GOODS MAY BE CARRIED BY ANY OTHER MEANS INCLUDING",
  "ROAD OR ANY OTHER CARRIER UNLESS SPECIFIC CONTRARY INSTRUCTIONS ARE",
  "GIVEN HEREON BY THE SHIPPER, AND SHIPPER AGREES THAT THE SHIPMENT MAY BE",
  "CARRIED VIA INTERMEDIATE STOPPING PLACES WHICH THE CARRIER DEEMS",
  "APPROPRIATE. THE SHIPPER'S ATTENTION IS DRAWN TO THE NOTICE CONCERNING",
  "CARRIER'S LIMITATION OF LIABILITY. Shipper may increase such limitation of liability by",
  "declaring a higher value for carriage and paying a supplemental charge if required.",
];

const EXPORT_LINES = [
  "These commodities technology or software were exported from the United States in accordance with the Export",
  "Administration Regulations. Diversion contrary to U.S. law is prohibited.",
];

type Doc = PDFKit.PDFDocument;

function pdf(size: "LETTER" | [number, number], draw: (doc: Doc) => void | Promise<void>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size, margin: 0 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    Promise.resolve(draw(doc))
      .then(() => doc.end())
      .catch(reject);
  });
}

/** WinAnsi-safe text. Standard Helvetica cannot carry a custom Unicode cmap, which is what turned names into "<dD>>". */
export function plain(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/[^\n\r\t\x20-\x7e\u00a0-\u00ff]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function headName(company: CompanyView): string {
  return plain(company.letterheadName || company.brandName || "");
}

function t(doc: Doc, x: number, y: number, text: string, size = 6, font = "Helvetica", color = "#000000") {
  const value = plain(text);
  if (!value) return;
  doc.fillColor(color).font(font).fontSize(size).text(value, x, y, { baseline: "alphabetic", lineBreak: false });
}

function tc(doc: Doc, x: number, y: number, text: string, size = 6, font = "Helvetica", color = "#000000") {
  const value = plain(text);
  if (!value) return;
  doc.font(font).fontSize(size);
  const width = doc.widthOfString(value);
  t(doc, x - width / 2, y, value, size, font, color);
}

function tr(doc: Doc, x: number, y: number, text: string, size = 6, font = "Helvetica", color = "#000000") {
  const value = plain(text);
  if (!value) return;
  doc.font(font).fontSize(size);
  const width = doc.widthOfString(value);
  t(doc, x - width, y, value, size, font, color);
}

function lines(doc: Doc, x: number, y: number, rows: string[], size = 8.5, lead = 10, font = "Helvetica") {
  rows.forEach((row, index) => t(doc, x, y + index * lead, row, size, font));
}

function rule(doc: Doc, x1: number, y1: number, x2: number, y2 = y1) {
  doc.save().moveTo(x1, y1).lineTo(x2, y2).lineWidth(0.6).strokeColor(RULE).stroke().restore();
}

function box(doc: Doc, x1: number, y1: number, x2: number, y2: number, fill?: string) {
  const width = x2 - x1;
  const height = y2 - y1;
  if (fill) doc.save().fillColor(fill).rect(x1, y1, width, height).fill().restore();
  doc.save().lineWidth(0.6).strokeColor(RULE).rect(x1, y1, width, height).stroke().restore();
}

export function companyLogo(company: CompanyView): Buffer {
  if (company.logo && company.logo.length > 0) return Buffer.from(company.logo);
  return company.agentKey === "ack" ? ACK_LOGO_PNG : KOPE_LOGO_PNG;
}

function headerAddress(address: string): string[] {
  const raw = plain(address);
  const multiline = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (multiline.length > 1) return multiline;
  const countryMatch = raw.match(/^(.*?)(?:,|\s)+((?:UNITED STATES|USA))\s*$/i);
  const country = countryMatch ? "UNITED STATES" : "";
  const body = (countryMatch ? countryMatch[1] : raw).replace(/,\s*$/, "").trim();
  const parts = body.split(/\s*,\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) return [body, country].filter(Boolean);
  if (parts.length === 2) return [parts[0], parts[1], country].filter(Boolean);
  const street = `${parts.slice(0, 2).join(", ")},`;
  const city = `${parts.slice(2).join(", ")}${country ? "," : ""}`;
  return [street, city, country].filter(Boolean);
}

function wrap(text: string, size: number, width: number): string[] {
  const source = plain(text);
  if (!source) return [];
  const max = Math.max(12, Math.floor(width / (size * 0.56)));
  const rows: string[] = [];
  for (const paragraph of source.split(/\n/)) {
    let current = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = current ? `${current} ${word}` : word;
      if (current && next.length > max) {
        rows.push(current);
        current = word;
      } else current = next;
    }
    if (current) rows.push(current);
  }
  return rows;
}

/** Exemption added to the Nature of Goods, never to Handling Information, when the guía has no AES ITN. */
export const NO_EEI_GOODS = "NO EEI REQ 30.37A";

export function aesItnToken(value: string | null | undefined): string {
  return plain(value).replace(/^AES\s*ITN\s*:\s*/i, "").trim();
}

/**
 * User handling, unchanged, plus the DGD line when the guía carries dangerous goods and the ITN line when there
 * is an ITN. Nothing is moved out of goods.
 */
export function handlingForPrint(
  entered: string | null | undefined,
  aesItn: string | null | undefined,
  dangerousGoods = false,
  lithiumPi: string | null | undefined = null,
): string {
  const user = plain(entered);
  const base = user || EXPORT_LINES.join("\n");
  const token = aesItnToken(aesItn);
  const dg = dangerousGoods && !base.toLowerCase().includes(DG_HANDLING_LINE.toLowerCase()) ? `\n${DG_HANDLING_LINE}` : "";
  const statement = lithiumSectionIIStatement(lithiumPi);
  const lithium = statement && !base.toLowerCase().includes(statement.toLowerCase()) ? `\n${statement}` : "";
  return `${base}${dg}${lithium}${token ? `\nAES ITN: ${token}` : ""}`;
}

/**
 * The goods as entered. With no AES ITN the exemption is added: just before the PMC code when the goods carry one,
 * as the team types it, otherwise at the end. Goods that already say NO EEI are left alone.
 */
export function goodsForPrint(lines: Array<{ nature?: string | null; sortOrder?: number }>, aesItn?: string | null): string {
  const goods = [...lines]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((line) => plain(line.nature))
    .filter(Boolean)
    .join("\n");
  if (!goods || aesItnToken(aesItn) || /NO\s+EEI/i.test(goods) || /AES\s*ITN/i.test(goods)) return goods;
  const pmc = [...goods.matchAll(/\s+PMC\s*\d/g)].pop();
  if (pmc?.index != null) return `${goods.slice(0, pmc.index)} ${NO_EEI_GOODS}${goods.slice(pmc.index)}`;
  return `${goods} ${NO_EEI_GOODS}`;
}

function wrapMeasured(doc: Doc, text: string, size: number, width: number, font: string): string[] {
  const source = plain(text);
  if (!source || width <= 0) return [];
  doc.font(font).fontSize(size);
  const rows: string[] = [];
  const piecesOf = (word: string): string[] => {
    if (doc.widthOfString(word) <= width) return [word];
    const parts: string[] = [];
    let chunk = "";
    for (const ch of word) {
      const next = chunk + ch;
      if (chunk && doc.widthOfString(next) > width) {
        parts.push(chunk);
        chunk = ch;
      } else chunk = next;
    }
    if (chunk) parts.push(chunk);
    return parts.length ? parts : [word];
  };
  for (const paragraph of source.split(/\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      rows.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      for (const piece of piecesOf(word)) {
        const next = current ? `${current} ${piece}` : piece;
        if (current && doc.widthOfString(next) > width) {
          rows.push(current);
          current = piece;
        } else current = next;
      }
    }
    if (current) rows.push(current);
  }
  return rows;
}

function blockFits(lineCount: number, lead: number, span: number): boolean {
  if (lineCount <= 1) return true;
  return (lineCount - 1) * lead <= span + 0.05;
}

/**
 * Wrap into the box. Prefer maxSize. Step down to about 5pt, then smaller only
 * so a full box still prints every character.
 */
export function fitBlock(
  doc: Doc,
  text: string,
  box: { width: number; height: number; maxSize: number; leadRatio?: number; font?: string },
): { lines: string[]; size: number; lead: number } {
  const font = box.font ?? "Helvetica";
  const leadRatio = box.leadRatio ?? 1.2;
  const clean = plain(text);
  const leadFor = (size: number) => Math.max(size * leadRatio, size + 0.2);
  if (!clean) return { lines: [], size: box.maxSize, lead: leadFor(box.maxSize) };
  let chosen = {
    lines: wrapMeasured(doc, clean, box.maxSize, box.width, font),
    size: box.maxSize,
    lead: leadFor(box.maxSize),
  };
  if (blockFits(chosen.lines.length, chosen.lead, box.height)) return chosen;
  for (let size = box.maxSize - 0.2; size >= 2.4; size -= 0.2) {
    const rounded = Math.round(size * 10) / 10;
    const lead = leadFor(rounded);
    const lines = wrapMeasured(doc, clean, rounded, box.width, font);
    chosen = { lines, size: rounded, lead };
    if (blockFits(lines.length, lead, box.height)) return chosen;
  }
  return chosen;
}

function drawFitted(
  doc: Doc,
  x: number,
  y: number,
  text: string,
  width: number,
  span: number,
  maxSize: number,
  leadRatio = 1.2,
) {
  const fit = fitBlock(doc, text, { width, height: span, maxSize, leadRatio });
  fit.lines.forEach((row, index) => t(doc, x, y + index * fit.lead, row, fit.size));
}

function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return value.toFixed(2);
}

function kg(value: number): string {
  return `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
}

function airlineCode(flightNumber: string | null | undefined, carrier: string): string {
  const flight = plain(flightNumber).toUpperCase();
  const fromFlight = flight.match(/^[A-Z]{2}/)?.[0] ?? "";
  if (fromFlight) return fromFlight;
  const token = plain(carrier).toUpperCase().match(/\b([A-Z]{2})\b/);
  return token?.[1] ?? "";
}

const EXTRA_CITIES: Record<string, string> = {
  SDQ: "Santo Domingo",
  PUJ: "Punta Cana",
  SCL: "Santiago",
  GRU: "Sao Paulo",
  EZE: "Buenos Aires",
  GIG: "Rio de Janeiro",
};

function cityName(code: string): string {
  const known = cityForAirport(code);
  if (known && known.toUpperCase() !== code) return known;
  return EXTRA_CITIES[code] ?? known;
}

function placeLabel(value: string | null | undefined): string {
  const code = codeForPlace(value ?? "");
  const city = cityName(code);
  if (/^[A-Z]{3}$/.test(code) && city && city.toUpperCase() !== code) return `${city.toUpperCase()} (${code})`;
  return plain(value).toUpperCase();
}

function sentenceName(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => {
      const bare = word.replace(/[^A-Za-z]/g, "");
      if (bare.length > 0 && bare.length <= 4 && bare === bare.toUpperCase()) return word;
      const lower = word.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function drawLogo(doc: Doc, logo: Buffer, x: number, y: number, width: number, height?: number) {
  try {
    doc.image(logo, x, y, height ? { width, height } : { width });
  } catch {
    /* A missing logo does not drop the letter. The name is still real text. */
  }
}

export async function renderCorteAwb(document: GuiaRecord, company: CompanyView, options: GuiaPrintOptions): Promise<Buffer> {
  const digits = `${document.prefix}${document.serial}`.replace(/\D/g, "") || document.awb.replace(/\D/g, "");
  const barcode = digits ? await bwipjs.toBuffer({ bcid: "code128", text: digits, scale: 2, height: 10, includetext: false }) : null;
  const name = headName(company);
  const address = headerAddress(company.address);
  const phone = plain(company.phone);
  const email = plain(company.opsEmail);
  const origin = codeForPlace(document.departure || "MIA") || "MIA";
  const destCode = codeForPlace(document.destination || "");
  const carrier = plain(document.carrierName);
  const code = airlineCode(document.flightNumber, carrier);
  const carrierShown = carrier && code && !carrier.toUpperCase().includes(`(${code})`) ? `${carrier} (${code})` : carrier;
  const carrierText = [carrier, plain(document.carrierAddress)].filter(Boolean).join("\n");
  const flightDate = formatFlightDate(document.flightDate);
  const flightCell = [code || plain(document.flightNumber).toUpperCase(), flightDate].filter(Boolean).join(" / ");
  const executed = plain(document.executedOn) || sheetDate(options.now ?? new Date());
  const place = plain(document.executedAt) || (origin === "MIA" ? "MIAMI" : placeLabel(origin));
  const country = plain(document.destCountry) || countryForAirport(destCode);
  const goods = document.lines.length
    ? [...document.lines].sort((a, b) => a.sortOrder - b.sortOrder)
    : [];
  const first = goods[0];
  const pieces = first?.pieces ?? null;
  const gross = first?.grossWeight ?? null;
  const chargeable = first?.chargeableWeight ?? gross;
  const rate = first?.rate ?? null;
  const lineTotal = first?.total ?? (rate != null && chargeable != null ? rate * chargeable : null);
  const prepaid = (document.chgsCode || "PP").toUpperCase().startsWith("C") ? "" : money(document.weightCharge ?? lineTotal);
  const natureText = goodsForPrint(goods, document.aesItn);
  const handlingText = handlingForPrint(document.handling, document.aesItn, document.dgDeclarable, document.lithiumPi);
  const accounting = plain(document.accountingInfo) || ((document.chgsCode || "PP").toUpperCase().startsWith("C") ? "FREIGHT COLLECT" : "FREIGHT PREPAID");
  const tel = [phone ? `TEL: ${phone}` : "", email].filter(Boolean).join("   ");
  const countryLine = address.find((line) => /UNITED STATES/i.test(line)) ?? "";
  const bodyLines = address.filter((line) => line !== countryLine);
  const agentLines = [name, bodyLines.join(" ").replace(/,\s*$/, "") + (countryLine ? "," : ""), countryLine].map((line) => line.trim()).filter(Boolean);

  return pdf("LETTER", (doc) => {
    doc.info.Title = `AWB ${document.awb || "DRAFT"}`;
    doc.info.Author = name || "Kope Guías";
    // A draft is one marked copy of the face, with no conditions page.
    const draft = Boolean(options.draft);
    const customerCopy = !draft && Boolean(options.customerCopy);
    const copies: readonly string[] = draft ? [DRAFT_LABEL] : customerCopy ? [COPY_LABELS[2]] : COPY_LABELS;
    const totalPages = draft ? 1 : customerCopy ? 2 : 12;
    copies.forEach((label, index) => {
      if (index > 0) doc.addPage({ size: "LETTER", margin: 0 });
      drawAwbFace(doc, {
        barcode,
        prefix: document.prefix,
        serial: document.serial,
        origin,
        shipperName: plain(document.shipperName),
        shipperAddress: plain(document.shipperAddress),
        consigneeName: plain(document.consigneeName),
        consigneeAddress: plain(document.consigneeAddress),
        carrierText,
        carrierShown,
        agentLines,
        tel,
        iata: plain(document.agent?.iataCode),
        account: plain(document.accountNo || document.agent?.accountNo),
        departure: placeLabel(document.departure || origin),
        to: destCode,
        flightCell,
        currency: plain(document.currency) || "USD",
        carriage: plain(document.declaredCarriage) || "NVC",
        customs: plain(document.declaredCustoms) || "NVD",
        destination: placeLabel(document.destination),
        insurance: plain(document.insurance) || "MAX FREE",
        handlingText,
        country,
        pieces: pieces == null ? "" : String(pieces),
        gross: money(gross),
        kgLb: plain(first?.kgLb) || "K",
        chargeable: money(chargeable),
        rate: money(rate),
        total: money(lineTotal),
        natureText,
        prepaid,
        accounting,
        signature: name,
        executed,
        place,
        label,
        page: index * 2 + 1,
        pages: totalPages,
        draft,
      });
      if (draft) return;
      doc.addPage({ size: "LETTER", margin: 0 });
      doc.image(CONDITIONS_PNG, 0, 0, { width: 612, height: 792 });
      doc.save().fillColor("#ffffff").rect(536, 779, 76, 13).fill().restore();
      tr(doc, 582, 788, `Page ${index * 2 + 2} of ${totalPages}`, 8, "Helvetica-Bold");
    });
  });
}

type Face = {
  barcode: Buffer | null;
  prefix: string;
  serial: string;
  origin: string;
  shipperName: string;
  shipperAddress: string;
  consigneeName: string;
  consigneeAddress: string;
  carrierText: string;
  carrierShown: string;
  agentLines: string[];
  tel: string;
  iata: string;
  account: string;
  departure: string;
  to: string;
  flightCell: string;
  currency: string;
  carriage: string;
  customs: string;
  destination: string;
  insurance: string;
  handlingText: string;
  country: string;
  pieces: string;
  gross: string;
  kgLb: string;
  chargeable: string;
  rate: string;
  total: string;
  natureText: string;
  prepaid: string;
  accounting: string;
  signature: string;
  executed: string;
  place: string;
  label: string;
  page: number;
  pages: number;
  draft: boolean;
};

function drawAwbFace(doc: Doc, face: Face) {
  const L = 30;
  const R = 582;
  const M = 315;
  doc.lineWidth(0.6);
  t(doc, L, 26, face.prefix, 11);
  rule(doc, 58, 14, 58, 30);
  t(doc, 64, 26, face.origin, 11);
  rule(doc, 90, 14, 90, 30);
  t(doc, 96, 26, face.serial, 11);
  if (face.barcode) doc.image(face.barcode, 250, 12, { height: 20 });
  t(doc, 450, 26, face.prefix, 11);
  t(doc, 480, 26, face.serial, 11);

  box(doc, L, 34, M, 150);
  box(doc, M, 34, R, 150);
  t(doc, L + 2, 40, "Shipper's Name and Address", 5.5);
  box(doc, 200, 34, M, 44);
  t(doc, 204, 40, "Shipper's Account Number", 5.5);
  drawFitted(doc, L + 4, 54, face.shipperName, M - L - 12, 0, 8.5, 1.05);
  drawFitted(doc, L + 4, 66, face.shipperAddress, M - L - 12, 26, 6.5);
  t(doc, M + 3, 41, "Not Negotiable", 5.5);
  t(doc, M + 3, 58, "Air Waybill", 13, "Helvetica-Bold");
  t(doc, M + 3, 70, "Issued By", 5.5);
  drawFitted(doc, M + 95, 48, face.carrierText, R - (M + 95) - 6, 28, 7);
  rule(doc, M, 84, R, 84);
  t(doc, M + 3, 91, "Copies 1, 2 and 3 of this Air Waybill are originals and have the same validity", 5.5);
  rule(doc, L, 96, R, 96);

  t(doc, L + 2, 102, "Consignee's Name and Address", 5.5);
  box(doc, 200, 96, M, 106, CYAN);
  t(doc, 204, 102, "Consignee's Account Number", 5.5);
  drawFitted(doc, L + 4, 116, face.consigneeName, M - L - 12, 0, 8.5, 1.05);
  drawFitted(doc, L + 4, 128, face.consigneeAddress, M - L - 12, 18, 6.5);
  lines(doc, M + 3, 103, AGREEMENT, 5.3, 5.6);

  box(doc, L, 150, M, 205);
  t(doc, L + 2, 156, "Issuing Carrier's Agent Name and City", 5.5);
  lines(doc, L + 4, 168, face.agentLines, 7.5, 9);
  t(doc, L + 4, 197, face.tel, 6.5);
  box(doc, M, 150, R, 226);
  t(doc, M + 3, 156, "Accounting Information", 5.5);
  drawFitted(doc, M + 3, 180, face.accounting, R - M - 8, 40, 9);
  box(doc, L, 205, 170, 226);
  box(doc, 170, 205, M, 226);
  t(doc, L + 2, 212, "Agent's IATA Code", 7, "Helvetica-Bold");
  t(doc, L + 2, 222, face.iata, 8);
  t(doc, 173, 212, "Account No.", 7);
  t(doc, 173, 222, face.account, 8);
  box(doc, L, 226, M, 245);
  t(doc, L + 2, 232, "Airport of Departure (Addr. of First Carrier) and Requested Routing", 5.5);
  t(doc, L + 4, 242, face.departure, 9);
  box(doc, M, 226, R, 245);
  t(doc, M + 3, 232, "Reference Number", 5.5);
  t(doc, 450, 232, "Optional Shipping Information", 5.5);

  box(doc, L, 245, R, 264);
  for (const x of [52, 240, 262, 284, 306, M, 348, 370, 415, 500]) rule(doc, x, 245, x, 264);
  t(doc, L + 2, 251, "To", 5.5);
  t(doc, L + 3, 262, face.to, 9);
  t(doc, 55, 251, "By First Carrier", 5.5);
  t(doc, 55, 262, face.carrierShown, 9);
  for (const [x, label] of [[243, "to"], [265, "by"], [287, "to"], [309, "by"]] as const) t(doc, x, 251, label, 5.5);
  t(doc, M + 2, 251, "Currency", 5);
  t(doc, M + 3, 262, face.currency, 8);
  t(doc, 350, 251, "CHGS", 4.5);
  t(doc, 352, 262, "PP", 8);
  t(doc, 372, 251, "WT/VAL  Other", 4.5);
  t(doc, 372, 262, "PP    PP", 7);
  t(doc, 418, 251, "Declared Value for Carriage", 5);
  tc(doc, 457, 262, face.carriage, 8);
  t(doc, 503, 251, "Declared Value for Customs", 5);
  tc(doc, 541, 262, face.customs, 8);

  box(doc, L, 264, R, 284);
  box(doc, L, 264, 150, 284, CYAN);
  for (const x of [150, 215, 250, M, 390]) rule(doc, x, 264, x, 284);
  tc(doc, 90, 270, "Airport of Destination", 5.5);
  t(doc, L + 3, 281, face.destination, 9, "Helvetica-Bold");
  t(doc, 152, 270, "Flight/Date", 5.5);
  t(doc, 152, 281, face.flightCell, 7);
  t(doc, 217, 270, "For Carrier Use", 5);
  t(doc, 252, 270, "Flight/Date", 5.5);
  t(doc, M + 3, 270, "Amount of Insurance", 5.5);
  t(doc, M + 3, 281, face.insurance, 9);
  lines(doc, 392, 269, ["INSURANCE - If carrier offers insurance, and such insurance is requested in", "accordance with the conditions thereof, indicate amount to be insured in", 'figures in box marked "Amount of Insurance".'], 4.3, 4.8);

  box(doc, L, 284, R, 322);
  t(doc, L + 2, 290, "Handling Information", 5.5);
  box(doc, 500, 298, R, 322);
  tc(doc, 541, 305, "SCI", 6);
  drawFitted(doc, L + 2, 300, face.handlingText, 278, 11, 4.5, 1.15);
  t(doc, 320, 318, face.country, 9);
  lines(doc, 445, 311, ["Diversion contrary to", "U.S. law prohibited"], 5.5, 6);

  box(doc, L, 322, R, 620);
  for (const x of [62, 122, 134, 142, 198, 206, 262, 300, 360, 435, 445]) rule(doc, x, 322, x, 620);
  for (const [a, b] of [[134, 142], [198, 206], [435, 445]] as const) box(doc, a, 322, b, 620, CYAN);
  rule(doc, L, 342, R, 342);
  rule(doc, L, 600, R, 600);
  tc(doc, 46, 330, "No. of", 5.5);
  tc(doc, 46, 337, "Pieces", 5.5);
  tc(doc, 92, 334, "Gross Weight", 5.5);
  tc(doc, 128, 330, "kg", 5);
  tc(doc, 128, 337, "lb", 5);
  tc(doc, 170, 329, "Rate Class", 5.5);
  rule(doc, 142, 331, 198, 331);
  tc(doc, 170, 337, "Commodity Item No.", 4.8);
  tc(doc, 234, 334, "Chargeable", 5.5);
  tc(doc, 234, 340, "Weight", 5.5);
  tc(doc, 280, 330, "Rate", 5.5);
  tc(doc, 330, 337, "Charge", 5.5);
  tc(doc, 397, 334, "Total", 5.5);
  tc(doc, 513, 330, "Nature and Quantity of Goods (incl. Dimensions or", 5.2);
  tc(doc, 513, 337, "Volume)", 5.2);
  t(doc, 36, 354, face.pieces, 9);
  t(doc, 66, 354, face.gross, 9);
  t(doc, 125, 354, face.kgLb, 9);
  t(doc, 209, 354, face.chargeable, 9);
  t(doc, 265, 354, face.rate, 9);
  t(doc, 365, 354, face.total, 9);
  drawFitted(doc, 448, 354, face.natureText, R - 448 - 4, 240, 7.2, 1.25);
  t(doc, 36, 613, face.pieces, 9);
  t(doc, 66, 613, face.gross, 9);
  t(doc, 125, 613, face.kgLb, 9);
  t(doc, 365, 613, face.total, 9);

  const rows: Array<[string | null, string, string | null, string]> = [
    ["Prepaid", "Weight Charge", "Collect", face.prepaid],
    [null, "Valuation Charge", null, ""],
    [null, "Tax", null, ""],
    [null, "Total Other Charges Due Agent", null, ""],
    [null, "Total Other Charges Due Carrier", null, ""],
  ];
  rows.forEach(([prepaidLabel, label, collect, value], index) => {
    const y = 620 + index * 30;
    box(doc, L, y, 148, y + 30);
    box(doc, 148, y, 266, y + 30);
    tc(doc, 148, y + 6, label, 5.5);
    if (prepaidLabel) {
      t(doc, L + 20, y + 6, prepaidLabel, 5.5);
      t(doc, 220, y + 6, collect ?? "", 5.5);
    }
    if (value) t(doc, L + 30, y + 20, value, 8);
  });
  box(doc, L, 720, 148, 750, CYAN);
  box(doc, 148, 720, 266, 750, CYAN);
  box(doc, L, 750, 148, 775);
  box(doc, 148, 750, 266, 775);
  tc(doc, 89, 756, "Total Prepaid", 5.5);
  tc(doc, 207, 756, "Total Collect", 5.5);
  if (face.prepaid) t(doc, L + 30, 770, face.prepaid, 9);
  box(doc, 266, 620, R, 775);
  t(doc, 269, 627, "Other Charges", 5.5);
  lines(doc, 269, 692, ["Shipper certifies that the particulars on the face hereof are correct and that insofar as any part of the consignment contains dangerous goods, such part", "is properly described by name and is in proper condition for carriage by air according to the applicable Dangerous Goods Regulations."], 4.3, 5);
  t(doc, 275, 718, face.signature, 9);
  t(doc, 275, 729, "Authorized Agent", 7.5);
  rule(doc, 266, 738, R, 738);
  tc(doc, 424, 745, "Signature of Shipper or his Agent", 5.5);
  t(doc, 280, 765, face.executed, 8);
  t(doc, 410, 765, face.place, 8);
  rule(doc, 266, 768, R, 768);
  t(doc, 270, 774, "Executed on (date)", 5);
  t(doc, 390, 774, "at (place)", 5);
  t(doc, 470, 774, "Signature of Issuing Carrier or its Agent", 5);
  box(doc, L, 775, 148, 790, CYAN);
  box(doc, 148, 775, 266, 790, CYAN);
  tc(doc, 89, 785, "Currency Conversion Rates", 5);
  tc(doc, 207, 785, "CC Charges in Dest. Currency", 5);
  t(doc, 300, 787, face.label, 8, "Helvetica-Bold");
  t(doc, 452, 787, `${face.prefix} ${face.serial}`, 8);
  tr(doc, 582, 788, `Page ${face.page} of ${face.pages}`, 7);
  if (face.draft) {
    doc.save();
    doc.fillColor("#6b7280").fillOpacity(0.16).font("Helvetica-Bold").fontSize(120);
    doc.rotate(-38, { origin: [306, 396] });
    doc.text("DRAFT", 120, 330, { lineBreak: false });
    doc.restore();
  }
}

export async function renderCorteDo(document: GuiaRecord, company: CompanyView, options: GuiaPrintOptions): Promise<Buffer> {
  const name = headName(company);
  const logo = companyLogo(company);
  const header = [name, ...headerAddress(company.address), company.phone.trim() ? `Phone: ${company.phone.trim()}` : "", company.opsEmail.trim() ? `Email: ${company.opsEmail.trim()}` : ""].filter(Boolean);
  const shipper = [plain(document.shipperName), ...headerAddress(document.shipperAddress ?? "")].filter(Boolean);
  const consignee = [plain(document.consigneeName), ...headerAddress(document.consigneeAddress ?? "")].filter(Boolean);
  const carrier = plain(document.carrierName);
  const origin = codeForPlace(document.departure || "MIA") || "MIA";
  const dest = codeForPlace(document.destination || "") || plain(document.destination).toUpperCase();
  const date = plain(document.executedOn) || sheetDate(options.now ?? new Date());
  const flightDate = formatFlightDate(document.flightDate);
  const flight = [plain(document.flightNumber).toUpperCase(), flightDate].filter(Boolean).join(" - ");
  const deliver = [carrier, ...deliverTo(origin, "")].filter(Boolean);
  const rows = [...document.lines].sort((a, b) => a.sortOrder - b.sortOrder);
  const pieces = rows.reduce((sum, row) => sum + (row.pieces ?? 0), 0);
  const gross = rows.reduce((sum, row) => sum + (row.grossWeight ?? 0), 0);
  const chargeable = rows.reduce((sum, row) => sum + (row.chargeableWeight ?? row.grossWeight ?? 0), 0);
  const description = rows.map((row) => plain(row.nature)).filter(Boolean).join(" / ");
  const trucker = plain(options.trucker ?? document.truckerName);
  const driver = plain(options.driver ?? document.driverName);
  const seal = plain(options.seal ?? document.seal);
  const awb = plain(document.awb);
  const remark = [`AWB ${awb}`, carrier, origin && dest ? `${origin}-${dest}` : "", flightDate ? `FLIGHT ${flightDate.toUpperCase()}` : ""].filter(Boolean).join(" - ");
  const brand = sentenceName(name);
  const terms = [
    "IMPORTANT NOTICE - TERMS AND CONDITIONS",
    `This delivery and all related services are subject to the ${brand} Standard Trading Terms and Conditions. By requesting, authorizing, or accepting delivery, the`,
    "Customer agrees to those terms, including payment obligations, liens, claim deadlines, release requirements, and limitations and exclusions of liability.",
    "",
    "It is required that each truck be equipped with DOT Emergency Response Guidebook, and the driver has been instructed in its use. This is to certify that the above named",
    "material are properly classified, described, packaged, marked and labeled and are in proper condition for transportation according to the applicable regulations of the DOT.",
    "",
    "This order is not valid until merchandise has been released and is available for delivery. Notify us at once if delivery cannot be delivered as instructed. NOTE: " + name,
    "is an agent only, and has no beneficial title in property.",
  ];
  const bill = [name, ...headerAddress(company.address).slice(0, 2).concat(headerAddress(company.address).length > 2 ? [headerAddress(company.address).slice(2).join(" ")] : []), company.phone.trim() ? `Phone: ${company.phone.trim()}` : "", company.opsEmail.trim() ? `Email: ${company.opsEmail.trim()}` : ""].filter(Boolean);

  return pdf([575, 768], (doc) => {
    doc.info.Title = `DO ${awb}`;
    drawLogo(doc, logo, 28, 21, 110, 47);
    header.forEach((line, index) => t(doc, 158, 18 + index * 9, line, 7));
    t(doc, 312, 25, "DELIVERY ORDER (DO) - EXPORT", 13, "Helvetica-Bold");
    t(doc, 410, 42, "File Number:", 7, "Helvetica", GREY);
    t(doc, 410, 54, awb, 7);
    t(doc, 410, 68, "Date:", 7, "Helvetica", GREY);
    t(doc, 410, 80, date, 7);
    const x = [28, 158, 292, 425];
    block(doc, x[0], 100, "Pickup From:", shipper);
    block(doc, x[1], 100, "Delivering Carrier:", trucker ? [trucker] : []);
    block(doc, x[2], 100, "Deliver To:", deliver);
    block(doc, x[3], 100, "Return To:", []);
    block(doc, x[0], 198, "Shipper (Name and Address):", shipper);
    block(doc, x[1], 198, "Consignee (Name and Address):", consignee);
    block(doc, x[3], 198, "Bill To Party:", bill);
    const grid = [
      [["BOL / AWB / Document Number:", awb], ["Carrier:", carrier], ["Port of Loading:", portOf(origin)], ["Departure Date:", flightDate]],
      [["House Number:", plain(document.hawb)], ["Flight / Voyage:", flight], ["Port of Discharge:", dest], ["Arrival Date:", ""]],
      [["Customer Reference:", ""], ["Booking Number:", awb], ["Final Destination:", dest], ["Seal No.", seal]],
    ];
    grid.forEach((row, rowIndex) => {
      row.forEach(([label, value], index) => block(doc, x[index], 292 + rowIndex * 27, label, value ? [value] : []));
    });
    doc.save().fillColor("#e6e6e6").rect(28, 368, 575 - 56, 22).fill().restore();
    t(doc, 36, 380, "Mark and Numbers", 7, "Helvetica", GREY);
    t(doc, 170, 380, "Pieces", 7, "Helvetica", GREY);
    t(doc, 325, 380, "Description", 7, "Helvetica", GREY);
    t(doc, 430, 380, "Gross Weight", 7, "Helvetica", GREY);
    t(doc, 492, 376, "Chargeable", 7, "Helvetica", GREY);
    t(doc, 492, 385, "Weight", 7, "Helvetica", GREY);
    t(doc, 170, 405, `${pieces} Pieces`, 7);
    t(doc, 220, 405, "PCS", 7);
    wrap(description, 7, 160).slice(0, 2).forEach((line, index) => t(doc, 260, 405 + index * 9, line, 7));
    tr(doc, 470, 405, kg(gross), 7);
    tr(doc, 546, 405, kg(chargeable), 7);
    t(doc, 28, 465, "TOTALS:", 10, "Helvetica-Bold");
    [["Total Pieces:", `${pieces} PCS`, ""], ["Total Weight:", kg(gross), kg(chargeable)]].forEach(([label, left, right], index) => {
      t(doc, 330, 465 + index * 10, label, 7, "Helvetica-Bold");
      tr(doc, 470, 465 + index * 10, left, 7);
      tr(doc, 546, 465 + index * 10, right, 7);
    });
    t(doc, 28, 520, "Special Instructions:", 7, "Helvetica", GREY);
    t(doc, 292, 520, "Remarks:", 7, "Helvetica", GREY);
    t(doc, 292, 530, remark, 7);
    terms.forEach((line, index) => t(doc, 28, 575 + index * 7, line, 4.8, index === 0 ? "Helvetica-Bold" : "Helvetica"));
    t(doc, 28, 655, "THE GOODS HEREIN DESCRIBED ARE ACCEPTED IN APPARENTLY GOOD ORDER AND CONDITION RECEIVED", 8.5);
    t(doc, 28, 672, "Prepared by:", 7, "Helvetica", GREY);
    rule(doc, 100, 680, 215, 680);
    tc(doc, 157, 690, name, 7);
    t(doc, 28, 712, "Driver Name:", 7, "Helvetica", GREY);
    rule(doc, 100, 714, 215, 714);
    if (driver) t(doc, 102, 712, driver, 7);
    t(doc, 292, 672, "CARRIER: D.O.", 7, "Helvetica", GREY);
    t(doc, 292, 684, "Received Signature:", 7, "Helvetica", GREY);
    rule(doc, 365, 686, 465, 686);
    t(doc, 475, 684, "Date:", 7, "Helvetica", GREY);
    rule(doc, 497, 686, 546, 686);
    t(doc, 292, 708, "CONSIGNEE: Freight", 7, "Helvetica", GREY);
    t(doc, 292, 720, "Received Signature:", 7, "Helvetica", GREY);
    rule(doc, 365, 722, 465, 722);
    t(doc, 475, 720, "Date:", 7, "Helvetica", GREY);
    rule(doc, 497, 722, 546, 722);
  });
}

function block(doc: Doc, x: number, y: number, label: string, rows: string[]) {
  t(doc, x, y, label, 7, "Helvetica", GREY);
  rows.forEach((row, index) => t(doc, x, y + 10 + index * 9, row, 7));
}

function deliverTo(origin: string, carrierAddress: string): string[] {
  const address = headerAddress(carrierAddress);
  if (address.length) return address;
  const code = codeForPlace(origin);
  if (code === "MIA") return ["MIAMI INTL AIRPORT (MIA)", "MIAMI, FL, UNITED STATES"];
  const city = cityName(code);
  const country = countryForAirport(code);
  if (/^[A-Z]{3}$/.test(code) && city && city.toUpperCase() !== code) {
    return [`${city.toUpperCase()} INTL AIRPORT (${code})`, country ? `${city.toUpperCase()}, ${country}` : ""].filter(Boolean);
  }
  return code ? [code] : [];
}

function portOf(origin: string): string {
  const code = codeForPlace(origin);
  if (code === "MIA") return "Miami, US (MIA)";
  const city = cityName(code);
  if (city && city.toUpperCase() !== code) return `${city} (${code})`;
  return code || origin;
}

export async function renderLithiumLetter(document: GuiaRecord, company: CompanyView, options: GuiaPrintOptions): Promise<Buffer> {
  const name = headName(company);
  const logo = companyLogo(company);
  const address = plain(company.address).replace(/\s+/g, " ");
  const phone = plain(company.phone);
  const footer = `${[name, phone].filter(Boolean).join("  ")}${address ? `  -  ${address}` : ""}`;
  const date = plain(document.executedOn) || sheetDate(options.now ?? new Date());
  const shipper = plain(document.shipperName);
  const shipperAddress = plain(document.shipperAddress).replace(/\s+/g, " ");
  return pdf([612, 792], (doc) => {
    doc.info.Title = `Lithium Battery Safety Document - AWB ${document.awb || "DRAFT"}`;
    doc.info.Author = name;
    doc.image(LITHIUM_FORM_PNG, 0, 0, { width: 612, height: 792 });
    drawLogo(doc, logo, 254, 23, 106, 45);
    t(doc, 178, 114, plain(document.awb), 11);
    t(doc, 56, 658, footer, 8.5);
    rule(doc, 54, 661, 530, 661);
    t(doc, 58, 701, shipper, 10);
    t(doc, 58, 719, shipperAddress, 10);
    t(doc, 404, 750, date, 11);
    tc(doc, 294, 770, name, 8);
    tc(doc, 66.5, 392, "X", 12, "Helvetica-Bold");
  });
}

/** Known-shipper IAC letter. Logo is an image. The name and address are standard Helvetica, not a subset font. */
export async function renderCorteTsa(document: GuiaRecord, company: CompanyView, options: GuiaPrintOptions): Promise<Buffer> {
  const name = headName(company);
  const tsa = tsaIacFor(company);
  const address = plain(company.address).replace(/\s*\n\s*/g, ", ");
  const footer = [address, company.phone.trim() ? `Tel: ${plain(company.phone)}` : "", company.fax.trim() ? `Fax: ${plain(company.fax)}` : ""].filter(Boolean).join(", ");
  const signer = signerName(options.name, options.email);
  const date = sheetDate(options.now ?? new Date());
  const departure = formatFlightDate(document.flightDate, "short");
  const trucker = plain(options.trucker ?? document.truckerName);
  const place = plain(document.destination);
  const code = codeForPlace(place);
  const city = cityForAirport(code);
  const dest = city && city !== code ? city : place;
  const logo = companyLogo(company);
  return pdf("LETTER", (doc) => {
    doc.info.Title = `TSA ${document.awb || "DRAFT"}`;
    const X = 50;
    const W = 512;
    drawLogo(doc, logo, 236, 30, 140);
    doc.fillColor("#000000").font("Helvetica-Bold").fontSize(13).text("INDIRECT AIR CARRIER WRITTEN CERTIFICATION FOR A\nPASSENGER AIR CARRIER", X, 118, { width: W, align: "center" });
    doc.font("Helvetica").fontSize(9).text(`${name} is in compliance with its TSA-approved security program and all applicable security directives. Our number assigned by TSA is ${tsa}. All cargo tendered in conjunction with this certification was either (1) accepted from a Known Shipper or an Unknown Shipper in accordance with TSA requirements specified in the Indirect Carrier Standard Security Program or (2) accepted under transfer from another aircraft operator, foreign air carrier, or IAC operating under a TSA-approved or accepted security program. The individual whose name appears below certifies that he or she is an employee or authorized representative of ${name} and understands that any fraudulent or false statement made in connection with this certification may subject this individual and ${name} to both (1) civil penalties under 49 CFR Part 1,540.105(b) and (2) fines and/or imprisonment of not more than 5 years under 18 U.S.C. 1001.`, X, 162, { width: W, align: "justify" });
    let y = doc.y + 22;
    const top = y - 8;
    const line = (labelText: string, value: string, x: number, width: number) => {
      doc.font("Helvetica").fontSize(9).fillColor("#000000").text(labelText, x, y, { lineBreak: false });
      const labelWidth = doc.widthOfString(labelText);
      doc.text(plain(value), x + labelWidth + 10, y, { lineBreak: false });
      doc.save().moveTo(x + labelWidth + 6, y + 11).lineTo(x + width, y + 11).lineWidth(0.6).strokeColor("#000000").stroke().restore();
    };
    line("Printed Name and Signature of IAC Employee:", signer, X + 8, 420);
    y += 26;
    line("Name of IAC or Authorized Agent's employee tendering cargo:", trucker, X + 8, 496);
    y += 26;
    line("Origin:", "Miami", X + 8, 230);
    line("Destination:", dest, X + 250, 250);
    y += 26;
    line("Date:", date, X + 8, 230);
    line("Departure Date:", departure, X + 250, 250);
    y += 26;
    line("Master Airway Bill No.:", plain(document.awb), X + 8, 300);
    y += 20;
    line("Number of items less than 16 oz.:", "0", X + 8, 250);
    y += 24;
    line("Name:", signer, X + 8, 260);
    doc.font("Helvetica").fontSize(9).text("certifies all consolidation of items weighing", X + 270, y, { lineBreak: false });
    y += 12;
    doc.text("less than 16 oz. have been 100 percent inspected in accordance with Section 3.2.1.C.", X + 8, y, { lineBreak: false });
    y += 24;
    line("Number of Known Shipper:", "1", X + 8, 250);
    y += 26;
    doc.font("Helvetica").fontSize(8.5).text("Warning: This record contains sensitive security information that is controlled under 49C.F.R. parts 15 and 1520. No part of this record may be disclosed to persons without a 'need to know', as defined in 49 C.F.R. parts 15 and 1520, except with the written permission of the administrator of the transportation security administration or the secretary of transportation. Unathorized release may result in civil penalty or other action. For U.S. Goverment Agencies, public disclosure is governed by 5 U.S.C. 552 and 49 C.F.R. parts 15 and 1520.", X + 8, y, { width: W - 16, align: "justify" });
    doc.save().lineWidth(0.8).strokeColor("#000000").rect(X, top, W, doc.y + 10 - top).stroke().restore();
    doc.font("Helvetica").fontSize(8.5).fillColor("#000000").text(name, X, 720, { width: W, align: "center", lineBreak: false });
    doc.font("Helvetica").fontSize(7.5).text(footer, X, 736, { width: W, align: "center" });
  });
}
