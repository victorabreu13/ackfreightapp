import { readFileSync } from "node:fs";
import { join } from "node:path";
import bwipjs from "bwip-js/node";
import PDFDocument from "pdfkit";
import { tsaIacFor, type CompanyView } from "@/lib/guias/company-profile";
import { companyLogo, plain } from "@/lib/guias/corte";
import type { GuiaPrintOptions, GuiaRecord } from "@/lib/guias/files";
import { signerName } from "@/lib/sheets/layout";
import {
  LABEL_CAP,
  KOPE,
  kopeDate,
  labelConsigneeFor,
  magayaPieceCode,
  magayaTracking,
} from "@/lib/sheets/documents";

/**
 * Guías copies of the Magaya forms the 729 corte does not include.
 * Coordinates are top-of-page points measured from the real PDFs:
 * MAGAYA_LABELS (letter cargo label), Pickup_Orders_KPU2009, and the CCSSSF certificate.
 * The sheet functions in documents.ts stay on their own layouts.
 */

type Doc = PDFKit.PDFDocument;
type SheetLoaded = Parameters<typeof labelConsigneeFor>[0] & {
  awb: string;
  dest: string | null;
  pcs: number | null;
  kgs: number | null;
  chw: number | null;
  build: string | null;
  flightNumber: string | null;
  legs: Array<{ awb: string | null; hawb: string | null; flightNumber: string | null }>;
};

const GREY = "#6B7280";
const LIGHT = "#E5E7EB";
const RED = "#b91c1c";

function pdfBuffer(size: "LETTER" | [number, number], draw: (doc: Doc) => Promise<void> | void): Promise<Buffer> {
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

/** The CCSF and the CCSP are handed over in three copies, so the PDF repeats the same page three times. */
export const SECURITY_LETTER_COPIES = 3;

function pdfCopies(draw: (doc: Doc) => void): Promise<Buffer> {
  return pdfBuffer("LETTER", (doc) => {
    for (let copy = 0; copy < SECURITY_LETTER_COPIES; copy += 1) {
      if (copy > 0) doc.addPage({ size: "LETTER", margin: 0 });
      draw(doc);
    }
  });
}

function put(doc: Doc, text: string, x: number, y: number, size: number, font = "Helvetica", color = "#000000", width?: number) {
  const value = plain(text);
  if (!value) return;
  doc.fillColor(color).font(font).fontSize(size);
  if (width) doc.text(value, x, y, { width, height: size + 2, ellipsis: true, lineBreak: false });
  else doc.text(value, x, y, { lineBreak: false });
}

/** Alphabetic baseline, optional horizontal stretch. Captions on the Magaya label are stretched 1.156. */
function at(doc: Doc, text: string, x: number, y: number, size: number, font = "Helvetica", color = "#000000", stretch = 1) {
  const value = plain(text);
  if (!value) return;
  doc.save();
  doc.fillColor(color).font(font).fontSize(size);
  if (stretch !== 1) doc.transform(stretch, 0, 0, 1, 0, 0);
  doc.text(value, stretch === 1 ? x : x / stretch, y, { lineBreak: false, baseline: "alphabetic" });
  doc.restore();
}

function atCenter(doc: Doc, text: string, center: number, y: number, size: number, font = "Helvetica", stretch = 1) {
  const value = plain(text);
  if (!value) return;
  doc.font(font).fontSize(size);
  const width = doc.widthOfString(value) * stretch;
  at(doc, value, center - width / 2, y, size, font, "#000000", stretch);
}

function rule(doc: Doc, x1: number, y: number, x2: number, width = 0.6) {
  doc.save().moveTo(x1, y).lineTo(x2, y).lineWidth(width).strokeColor("#000000").stroke().restore();
}

function kopeDateTime(value: Date): string {
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: true }).format(value);
  return `${kopeDate(value)} ${time}`;
}

async function airlineName(awb: string): Promise<string> {
  const prefix = awb.replace(/\D/g, "").slice(0, 3);
  if (!prefix) return "";
  try {
    const { prisma } = await import("@/lib/db");
    const row = await prisma.airlinePrefix.findUnique({ where: { prefix }, select: { airline: true } });
    return (row?.airline ?? "").toUpperCase();
  } catch {
    return "";
  }
}

function addressLines(address: string): string[] {
  const raw = plain(address);
  if (!raw) return [];
  const broken = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (broken.length > 1) return broken.slice(0, 3);
  const parts = raw.split(/\s*,\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) return [raw];
  if (parts.length === 2) return parts;
  return [parts.slice(0, -2).join(", "), parts[parts.length - 2], parts[parts.length - 1]];
}

function telLine(company: CompanyView): string {
  const phone = plain(company.phone);
  const fax = plain(company.fax);
  return [phone ? `Tel: ${phone}` : "", fax ? `Fax: ${fax}` : ""].filter(Boolean).join(", ");
}

function headName(company: CompanyView): string {
  return plain(company.letterheadName || company.brandName);
}

function num(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value) || value === 0) return "";
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Letter-size Magaya cargo label. ACK draws the logo in the empty header; Kope matches the reference with no logo. */
export async function renderMagayaLabels(
  document: GuiaRecord,
  company: CompanyView,
  options: GuiaPrintOptions,
  loaded: SheetLoaded,
): Promise<Buffer> {
  const which = options.masterLabel ? "master" : "leg";
  const leg = loaded.legs[0];
  const awb = which === "leg" && leg?.awb ? leg.awb : loaded.awb;
  const fromLines = document.lines.reduce((sum, row) => sum + (row.pieces ?? 0), 0);
  const totalPieces = fromLines > 0 ? fromLines : (loaded.pcs ?? 1);
  const count = Math.max(1, Math.min(totalPieces, LABEL_CAP));
  const prefixCarrier = await airlineName(awb);
  const carrierSource = prefixCarrier || plain(document.carrierName);
  const carrier = carrierSource ? (carrierSource.includes("(") ? carrierSource : `${carrierSource} (MIA)`) : "";
  const resolved = labelConsigneeFor(loaded, which, awb);
  const dest = which === "leg" || !leg ? loaded.dest ?? "" : "MIA";
  const notes = [
    loaded.flightNumber ? `IN ${loaded.flightNumber}` : "",
    leg?.flightNumber ? `OUT ${leg.flightNumber}` : "",
    leg?.hawb ? `HAWB ${leg.hawb}` : "",
    which === "leg" && loaded.awb !== awb ? `INBOUND ${loaded.awb}` : "",
  ].filter(Boolean).join("   ");
  const trackingText = `*${magayaTracking(awb)}*`;
  const bar = { scale: 2, height: 10, includetext: false, paddingwidth: 0, paddingheight: 0 } as const;
  const trackingPng = await bwipjs.toBuffer({ bcid: "code39", text: magayaTracking(awb), ...bar });
  const logo = company.agentKey === "ack" ? companyLogo(company) : null;
  const name = headName(company);
  const lines = addressLines(company.address);
  const tel = telLine(company);

  return pdfBuffer([612, 792], async (doc) => {
    doc.info.Title = `LABELS ${awb}`;
    for (let piece = 1; piece <= count; piece += 1) {
      if (piece > 1) doc.addPage({ size: [612, 792], margin: 0 });
      const piecePng = await bwipjs.toBuffer({ bcid: "code39", text: magayaPieceCode(awb, piece), ...bar });
      at(doc, name, 19.32, 27.24, 14.19);
      lines.forEach((line, index) => at(doc, line, 20.64, 56.4 + index * 11.64, 10.22));
      at(doc, tel, 19.32, 117.96, 10.22);
      if (logo?.length) doc.image(logo, 400, 18, { fit: [190, 100], align: "right", valign: "center" });

      rule(doc, 4.27, 129.91, 607.96, 1);
      at(doc, "CARRIER", 11.76, 142.92, 10.88, "Helvetica", "#000000", 1.156);
      at(doc, carrier, 23.52, 158.16, 15.05);
      rule(doc, 4.27, 182.79, 607.96, 0.25);
      at(doc, "CONSIGNEE", 11.76, 194.28, 10.88, "Helvetica", "#000000", 1.156);
      at(doc, resolved.name, 24.96, 210.12, 15.05, resolved.missing ? "Helvetica-Bold" : "Helvetica", resolved.missing ? RED : "#000000");
      rule(doc, 3.76, 231.97, 607.72, 0.25);
      at(doc, "MASTER WAY BILL NUMBER", 15.12, 247.44, 10.88, "Helvetica", "#000000", 1.156);
      atCenter(doc, awb, 300, 274.44, 26.12);
      doc.image(piecePng, 223, 342, { width: 149, height: 43 });

      rule(doc, 3.26, 427.81, 606.96, 0.25);
      doc.save().moveTo(206.34, 427.81).lineTo(206.34, 513.33).moveTo(396.36, 427.81).lineTo(396.36, 513.33).lineWidth(0.25).strokeColor("#000000").stroke().restore();
      at(doc, "DESTINATION", 15.36, 440.28, 10.88, "Helvetica", "#000000", 1.156);
      at(doc, "PIECE", 213.84, 439.8, 10.88, "Helvetica", "#000000", 1.156);
      at(doc, "TOTAL PIECES", 413.88, 440.88, 10.88, "Helvetica", "#000000", 1.156);
      at(doc, dest, 8.28, 474.95, 36.05);
      atCenter(doc, String(piece), 301.35, 474.95, 36.05);
      atCenter(doc, String(count), 501.66, 474.95, 36.05);
      rule(doc, 3.76, 512.89, 607.72, 0.25);

      at(doc, "Tracking Number. (SystemID-Warehouse Receipt-ItemID)", 13.32, 527.04, 10.88, "Helvetica", "#000000", 1.156);
      doc.image(trackingPng, 180, 534, { width: 238, height: 43 });
      atCenter(doc, trackingText, 299, 591, 18, "Courier");
      rule(doc, 3.26, 690.68, 606.96, 0.25);
      at(doc, "NOTES", 15.36, 706.8, 10.88, "Helvetica", "#000000", 1.156);
      at(doc, notes, 15.36, 724, 12);
      at(doc, "Magaya Cargo System. www.magaya.com", 19.56, 784.68, 10.88, "Helvetica", "#000000", 1.156);
    }
  });
}

function block(doc: Doc, text: string, x: number, y: number, size: number, width: number, color = "#000000") {
  const value = plain(text);
  if (!value) return;
  doc.fillColor(color).font("Helvetica").fontSize(size).text(value, x, y, { width, height: 92 });
}

/** Magaya pick up order (KPU2009 / KPU1898). */
export async function renderMagayaPickup(
  document: GuiaRecord,
  company: CompanyView,
  options: GuiaPrintOptions,
  loaded: SheetLoaded,
): Promise<Buffer> {
  const awb = plain(document.awb) || loaded.awb;
  const master = plain(loaded.awb) || awb;
  const number = `KPU-${master.replace(/\D/g, "").slice(3, 11)}`;
  const when = kopeDateTime(options.now ?? new Date());
  const receivedBy = signerName(options.name, options.email);
  const trucker = plain(options.trucker ?? document.truckerName);
  const driver = plain(options.driver ?? document.driverName);
  const truckerPhone = plain(options.truckerPhone ?? document.truckerPhone);
  const logo = companyLogo(company);
  const name = headName(company);
  const lines = addressLines(company.address);
  const shipper = plain(document.shipperName);
  const shipperAddress = plain(document.shipperAddress);
  const consignee = plain(document.consigneeName);
  const consigneeAddress = plain(document.consigneeAddress);
  const airline = (await airlineName(awb)) || plain(document.carrierName);
  const origin = plain(document.departure) || "MIA";
  const warehouseName = plain(company.warehouseName);
  const warehouseAddress = plain(company.warehouseAddress);
  const deliveryLines = warehouseName || warehouseAddress
    ? [when, warehouseName, warehouseAddress, company.signerName.trim() ? `Contact: ${plain(company.signerName)}` : "", company.phone.trim() ? `Phone: ${plain(company.phone)}` : "", company.opsEmail.trim() ? `Email: ${plain(company.opsEmail)}` : ""]
    : airline
      ? [when, airline.includes("(") ? airline : `${airline} (${origin})`]
      : [when, consignee, consigneeAddress];
  const rows = goodsRows(document, loaded);
  const pieces = rows.reduce((sum, row) => sum + row.pcs, 0);
  const kilos = rows.reduce((sum, row) => sum + row.kg, 0);
  const chargeable = rows.reduce((sum, row) => sum + row.vkg, 0);
  const bar = await bwipjs.toBuffer({ bcid: "code128", text: number, scale: 2, height: 8 });
  const termsUrl = plain(company.termsUrl) || KOPE.termsUrl;
  const terms = `This pickup and all related services are subject to the ${name || "company"} Standard Trading Terms and Conditions available at ${termsUrl} and incorporated herein by reference. By requesting or authorizing the pickup, releasing the Goods, or tendering them to ${name || "the company"} or its provider, the Customer agrees to those terms, including payment obligations, liens, claim deadlines, and limitations and exclusions of liability. Carrier liability is not cargo insurance.`;

  return pdfBuffer("LETTER", (doc) => {
    doc.info.Title = `PICK UP ORDER ${number}`;
    if (logo?.length) doc.image(logo, 14, 15, { fit: [135, 70] });
    put(doc, name, 212, 16, 11, "Helvetica-Bold");
    put(doc, telLine(company), 212, 29, 7);
    lines.forEach((line, index) => put(doc, line, 212, 42 + index * 8, 7));
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#000000").text("PICK UP ORDER", 400, 24, { width: 196, align: "right", lineBreak: false });
    doc.font("Helvetica").fontSize(12).text(number, 400, 44, { width: 196, align: "right", lineBreak: false });
    doc.image(bar, 408, 58, { width: 188, height: 27 });

    put(doc, "Received by", 212, 84, 7);
    put(doc, receivedBy, 212, 94, 9);
    doc.font("Helvetica").fontSize(9).text(when, 400, 94, { width: 196, align: "right", lineBreak: false });
    rule(doc, 212, 108, 596, 0.4);

    put(doc, "Pickup information", 14, 114, 8, "Helvetica-Bold");
    put(doc, "Delivery information", 212, 114, 8, "Helvetica-Bold");
    put(doc, "Carrier", 410, 114, 8, "Helvetica-Bold");
    block(doc, [when, shipper, shipperAddress].filter(Boolean).join("\n"), 14, 124, 9, 185);
    block(doc, deliveryLines.filter(Boolean).join("\n"), 212, 124, 9, 185);
    put(doc, trucker, 410, 124, 9, "Helvetica", "#000000", 180);
    put(doc, "PRO number", 410, 142, 7, "Helvetica", GREY);
    put(doc, "Tracking number / AWB", 410, 169, 7, "Helvetica", GREY);
    put(doc, awb, 410, 180, 9);
    put(doc, "Supplier", 410, 196, 7, "Helvetica", GREY);
    if (truckerPhone) put(doc, `Phone: ${truckerPhone}`, 410, 206, 8);

    put(doc, "Shipper", 14, 223, 8, "Helvetica-Bold");
    put(doc, "Consignee", 212, 223, 8, "Helvetica-Bold");
    put(doc, "Charges", 412, 223, 8, "Helvetica-Bold");
    put(doc, shipper, 14, 233, 9, "Helvetica", "#000000", 180);
    put(doc, consignee, 212, 233, 9, "Helvetica", "#000000", 180);
    put(doc, "Driver / Driver License", 14, 251, 8, "Helvetica-Bold");
    put(doc, "Invoice number", 212, 251, 8, "Helvetica-Bold");
    put(doc, driver, 14, 262, 9);
    put(doc, "PO number", 212, 278, 8, "Helvetica-Bold");

    doc.save().fillColor(LIGHT).rect(14, 322, 584, 36).fill().restore();
    const head = (text: string, x: number, y: number) => put(doc, text, x, y, 7, "Helvetica", GREY);
    head("Pcs", 26, 328);
    head("Package", 51, 328);
    head("Dimensions", 118, 328);
    head("Description", 290, 328);
    head("Weight", 458, 328);
    head("Volume", 536, 328);
    head("Location", 40, 346);
    head("Invoice Number", 112, 346);
    head("Notes", 299, 346);
    head("Volume Weight", 520, 346);

    rows.slice(0, 8).forEach((row, index) => {
      const y = 369 + index * 24;
      put(doc, row.pcs ? String(row.pcs) : "", 24, y, 9);
      put(doc, row.description, 192, y, 9, "Helvetica", "#000000", 250);
      const weight = num(row.kg);
      if (weight) put(doc, `${weight} kg`, 458, y, 9);
      const vkg = num(row.vkg);
      if (vkg) put(doc, `${vkg} VKg`, 520, y + 12, 9);
    });

    put(doc, "Notes", 14, 650, 8, "Helvetica-Bold");
    put(doc, "Pieces", 379, 664, 7, "Helvetica", GREY);
    put(doc, "Weight", 450, 664, 7, "Helvetica", GREY);
    put(doc, "Volume", 530, 664, 7, "Helvetica", GREY);
    put(doc, pieces ? String(pieces) : "", 400, 676, 11);
    if (kilos) put(doc, `${num(kilos)} Kg`, 450, 676, 11);
    if (chargeable) put(doc, `${num(chargeable)} VKg`, 520, 690, 11);

    put(doc, "IMPORTANT NOTICE — TERMS AND CONDITIONS", 16, 714, 7, "Helvetica-Bold");
    doc.font("Helvetica").fontSize(6).fillColor("#000000").text(terms, 16, 724, { width: 580, height: 28 });
    rule(doc, 16, 752, 596, 0.4);
    put(doc, name, 22, 758, 9);
    const footerAddress = [lines.join(" "), plain(company.address)].filter(Boolean)[0] ?? "";
    doc.font("Helvetica").fontSize(9).text(footerAddress, 300, 758, { width: 292, align: "right", height: 12, ellipsis: true });
  });
}

type GoodsRow = { pcs: number; description: string; kg: number; vkg: number };

function goodsRows(document: GuiaRecord, loaded: { pcs: number | null; kgs: number | null; chw: number | null; build: string | null }): GoodsRow[] {
  const lines = [...document.lines].sort((a, b) => a.sortOrder - b.sortOrder).filter((line) => (line.pieces ?? 0) > 0 || (line.grossWeight ?? 0) > 0 || plain(line.nature));
  if (lines.length) {
    return lines.map((line) => ({
      pcs: line.pieces ?? 0,
      description: plain(line.nature),
      kg: line.grossWeight ?? 0,
      vkg: line.chargeableWeight ?? 0,
    }));
  }
  return [{ pcs: loaded.pcs ?? 0, description: plain(loaded.build), kg: loaded.kgs ?? 0, vkg: loaded.chw ?? 0 }];
}

type SecurityLetter = {
  title: string;
  fileTitle: string;
  paragraphs: string[];
  awb: string;
  date: string;
  signer: string;
  trucker: string;
  driver: string;
  seal: string;
  footer: string;
  /** Company logo drawn above the title. The text moves down to make room for it. */
  logo?: Buffer | null;
};

function securityLetter(letter: SecurityLetter): Promise<Buffer> {
  return pdfCopies((doc) => {
    doc.info.Title = letter.fileTitle;
    const X = 50;
    const W = 512;
    const dy = letter.logo?.length ? 68 : 0;
    /** With the logo the sections are spaced out a little so the page does not end with a blank block. */
    const k = dy ? 1.3 : 1;
    if (letter.logo?.length) {
      try {
        doc.image(letter.logo, 236, 28, { fit: [140, 60], align: "center" });
      } catch {
        /* A missing logo does not drop the certification. */
      }
    }
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#000000").text(letter.title, X, 36 + dy, { width: W, align: "center" });
    const filled = (value: string, x: number, y: number, width: number) => {
      if (value) doc.font("Helvetica").fontSize(9.5).fillColor("#000000").text(value, x + 6, y - 12, { width, lineBreak: false });
      rule(doc, x, y, x + width);
    };
    doc.font("Helvetica").fontSize(9).text("Date:", X, 78 + dy, { lineBreak: false });
    filled(letter.date, X + 26, 88 + dy, 110);
    doc.text("Air waybill, bill of lading, company inventory, or other internal shipping document number:", X, 104 + dy, { width: W });
    filled(letter.awb, X, 132 + dy, 160);
    const paragraph = (text: string) => {
      doc.font("Helvetica").fontSize(8.6).fillColor("#000000").text(text, X, doc.y + 10, { width: W, align: "justify" });
    };
    doc.y = 140 + dy;
    for (const text of letter.paragraphs) paragraph(text);
    let y = Math.max(doc.y + 26, dy ? 0 : 430);
    doc.font("Helvetica").fontSize(9).text("Check the applicable box below:", X, y, { lineBreak: false });
    y += 20 * k;
    doc.text("(X) Locked vehicle", X, y, { lineBreak: false });
    y += 18 * k;
    doc.text(`(${letter.seal ? "X" : "  "}) Tamper evident number seal. If used, write the number of the seal associated with this cargo shipment below:`, X, y, { width: W });
    y = doc.y + 16 * k;
    doc.text("SEAL #", X, y, { lineBreak: false });
    filled(letter.seal, X + 42, y + 9, 230);
    y += 26 * k;
    doc.text("If an escort is used, write the name of the escort associated with this cargo shipment below:", X, y, { lineBreak: false });
    y += 22 * k;
    rule(doc, X, y, X + 260);
    y += 14 * k;
    doc.text("Name and signature of employee or authorized representative attesting to the above certification:", X, y, { width: W });
    y += 22 * k;
    filled(letter.signer, X, y, 280);
    y += 12 * k;
    doc.text("Name of company and name of driver delivering the cargo shipment:", X, y, { width: W });
    y += 22 * k;
    filled(letter.trucker, X, y, 240);
    filled(letter.driver, X + 260, y, 230);
    y += 14 * k;
    doc.font("Helvetica").fontSize(8.6).text("Print name of the accepting entity's employee or authorized representative who is verifying that the seal number written above matches the seal number on the conveyance OR is verifying the government issued identification of the escort and ensuring the name matches the name written above OR is verifying that the cargo arrived in a locked conveyance. Accepting Employee or Authorized Representative:", X, y, { width: W });
    rule(doc, X, doc.y + 22, X + 280);
    doc.font("Helvetica").fontSize(8).fillColor("#000000").text(letter.footer, X, 748, { width: W, align: "center", lineBreak: false });
  });
}

function securityParts(document: GuiaRecord, company: CompanyView, options: GuiaPrintOptions) {
  const name = headName(company);
  const ack = company.agentKey === "ack";
  const ownFacility = plain(company.warehouseAddress);
  const office = plain(company.address);
  const footerFacility = ownFacility || (ack ? office : "6450 NW 97TH AVE, SUITE 130 DORAL, FL 33178");
  const phone = plain(company.phone) || (ack ? "" : KOPE.phone);
  return {
    name,
    tsa: tsaIacFor(company),
    ccsf: plain(company.ccsfId) || (ack ? "" : "MIA.C.05.20.2025.582"),
    facility: ownFacility || (ack ? office : "6450 NW 97TH AVE, STE 130, DORAL, FL 33178"),
    awb: plain(document.awb),
    date: kopeDate(options.now ?? new Date()),
    signer: signerName(options.name, options.email),
    trucker: plain(options.trucker ?? document.truckerName),
    driver: plain(options.driver ?? document.driverName),
    seal: plain(options.seal ?? document.seal),
    footer: [name, footerFacility, phone ? `PH. ${phone}` : ""].filter(Boolean).join(" | "),
  };
}

const ASSETS = join(process.cwd(), "src/lib/guias/assets");
const CCSF_REGULAR_FILE = readFileSync(join(ASSETS, "Carlito-Regular.woff"));
const CCSF_BOLD_FILE = readFileSync(join(ASSETS, "Carlito-Bold.woff"));
/** Kope logo in color, cropped to the artwork. */
const CCSF_LOGO_PNG = readFileSync(join(ASSETS, "kope-logo-color.png"));

const CCSF_REGULAR = "Carlito";
const CCSF_BOLD = "Carlito-Bold";
const CCSF_SIZE = 9;
const CCSF_PARAGRAPH_WIDTH = 466;
/** Facility as printed on the Kope CCSF reference (new address). KOPE_CCSF_FACILITY still overrides it. */
const CCSF_FACILITY = process.env.KOPE_CCSF_FACILITY?.trim() || "6450 NW 97TH AVE, SUITE 130 Doral, FL 33178";

type CcsfSeg = { text: string; bold?: boolean };

/** Splits runs into words. Runs that touch with no space between them stay in one word. */
function ccsfWords(runs: CcsfSeg[]): CcsfSeg[][] {
  const words: CcsfSeg[][] = [];
  let open = false;
  for (const run of runs) {
    for (const part of run.text.match(/\s+|\S+/g) ?? []) {
      if (/^\s/.test(part)) {
        open = false;
        if (part.includes("\n")) words.push([{ text: "\n" }]);
        continue;
      }
      if (open) words[words.length - 1].push({ text: part, bold: run.bold });
      else words.push([{ text: part, bold: run.bold }]);
      open = true;
    }
  }
  return words;
}

function ccsfSegWidth(doc: Doc, seg: CcsfSeg): number {
  return doc.font(seg.bold ? CCSF_BOLD : CCSF_REGULAR).fontSize(CCSF_SIZE).widthOfString(seg.text);
}

function ccsfWordWidth(doc: Doc, word: CcsfSeg[]): number {
  return word.reduce((sum, seg) => sum + ccsfSegWidth(doc, seg), 0);
}

function ccsfWrap(doc: Doc, runs: CcsfSeg[], width: number, firstIndent = 0): CcsfSeg[][][] {
  const space = doc.font(CCSF_REGULAR).fontSize(CCSF_SIZE).widthOfString(" ");
  const lines: CcsfSeg[][][] = [];
  let line: CcsfSeg[][] = [];
  let used = firstIndent;
  for (const word of ccsfWords(runs)) {
    if (word.length === 1 && word[0].text === "\n") {
      lines.push(line);
      line = [];
      used = 0;
      continue;
    }
    const w = ccsfWordWidth(doc, word);
    if (line.length && used + space + w > width) {
      lines.push(line);
      line = [];
      used = 0;
    }
    used += (line.length ? space : 0) + w;
    line.push(word);
  }
  if (line.length) lines.push(line);
  return lines.filter((row) => row.length > 0);
}

/** Draws one line of words. Bold words are underlined, and the space between two bold words is underlined too. */
function ccsfDrawLine(doc: Doc, words: CcsfSeg[][], x: number, baseline: number) {
  const space = doc.font(CCSF_REGULAR).fontSize(CCSF_SIZE).widthOfString(" ");
  const underline = (from: number, to: number) =>
    doc.save().moveTo(from, baseline + 1.4).lineTo(to, baseline + 1.4).lineWidth(0.5).strokeColor("#000000").stroke().restore();
  let cursor = x;
  words.forEach((word, index) => {
    for (const seg of word) {
      doc.font(seg.bold ? CCSF_BOLD : CCSF_REGULAR).fontSize(CCSF_SIZE).fillColor("#000000");
      doc.text(seg.text, cursor, baseline, { lineBreak: false, baseline: "alphabetic" });
      const width = ccsfSegWidth(doc, seg);
      if (seg.bold) underline(cursor, cursor + width);
      cursor += width;
    }
    const next = words[index + 1];
    if (word[word.length - 1].bold && next?.[0].bold) underline(cursor, cursor + space);
    cursor += space;
  });
}

function ccsfDate(value: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "2-digit", day: "2-digit", year: "numeric" }).format(value);
}

/**
 * CCSSSF certificate of tender. It is always Kope's certificate, whichever company issues the guía:
 * Kope's name, TSA number, CCSSSF number and facility, with the color Kope logo. Layout follows the Kope
 * reference "CCSF LETTER - NEW ADDRESS": Calibri-style 9 pt text from a 71 pt margin, bold underlined
 * identifiers, and only the facility address at the foot. Baselines are measured from that PDF.
 */
export function renderMagayaCcsf(document: GuiaRecord, _company: CompanyView, options: GuiaPrintOptions): Promise<Buffer> {
  const awb = plain(document.awb);
  const date = ccsfDate(options.now ?? new Date());
  const signer = signerName(options.name, options.email);
  const trucker = plain(options.trucker ?? document.truckerName);
  const driver = plain(options.driver ?? document.driverName);
  const seal = plain(options.seal ?? document.seal);
  const name = "KOPE LOGISTICS";
  const legal = KOPE.legalName.replace(/\.$/, "");

  const first: CcsfSeg[] = [
    { text: `${name} is in compliance with its TSA-approved security program and all appropriate security directive(s). Our number
assigned by the TSA is ` },
    { text: KOPE.tsaIac, bold: true },
    { text: `. All cargo tendered in conjunction with this certificate was either: 1) accepted from a Known
Shipper or an Unknown Shipper in accordance with TSA requirements specified in the Indirect Air Carrier Standard Security
Program, or 2) accepted under transfer from another direct or indirect air carrier operating under a TSA approved or accepted
security program. This IAC is also a TSA-certified cargo screening facility (CCSSSF) and is in compliance with the TSA-approved
certified cargo screening standard security program (CCSSSF). Our CCSSSF number assigned by TSA is ` },
    { text: KOPE.ccsfId, bold: true },
    { text: `,
which is applicable only to this facility, located at ${CCSF_FACILITY}.` },
  ];
  const second: CcsfSeg[] = [
    { text: `All cargo has been screened and transported in accordance with the CCSSSF requirements. A chain of custody method has been
applied, and the cargo is being tendered with the chain of custody method intact. The individual whose name appears below
certifies that he or she is an employee or authorized representative of ` },
    { text: legal, bold: true },
    { text: ` and understands that any
fraudulent or false statement made in connection with this certification may subject ` },
    { text: legal, bold: true },
    { text: ` and the individual to
both (1) civil penalties under 49 CFR 1540.103(b) and (2) fines and/or imprisonment of not more than five years under 18
U.S.C. 1001. The cargo associated with this Master Air Waybill was screened at 100 percent.` },
  ];
  const accepting =
    `Print name of the accepting entity's employee or authorized representative who is verifying that the seal number written
above matches the seal number on the conveyance OR is verifying the government issued identification of the escort and
ensuring the name matches the name written above OR is verifying that the cargo arrived in a locked conveyance. Accepting
Employee or Authorized Representative`;

  return pdfCopies((doc) => {
    doc.registerFont(CCSF_REGULAR, CCSF_REGULAR_FILE);
    doc.registerFont(CCSF_BOLD, CCSF_BOLD_FILE);
    doc.info.Title = `${awb || "DRAFT"}_CCSF`;
    const text = (value: string, x: number, baseline: number) => ccsfDrawLine(doc, ccsfWords([{ text: value }]), x, baseline);
    const bar = (count: number) => "_".repeat(count);
    const paragraph = (runs: CcsfSeg[], x: number, baselines: number[], firstIndent = 0) =>
      ccsfWrap(doc, runs, CCSF_PARAGRAPH_WIDTH, firstIndent).forEach((row, index) => ccsfDrawLine(doc, row, index === 0 ? x + firstIndent : x, baselines[index]));

    doc.image(CCSF_LOGO_PNG, 68.6, 20.3, { width: 102.9 });
    text("CCSSSF CERTIFICATE OF TENDER TO A CARGO CARRIER", 71.3, 80.6);
    text("Date:", 71.3, 101.3);
    text(date, 97, 101.3);
    text("Air waybill, bill of lading, company inventory, or other internal shipping document number:", 71.3, 124.6);
    text(awb, 73.3, 144.3);
    paragraph(first, 71.3, [164, 174.8, 185.6, 196.4, 207.2, 218, 228.8], 2);
    paragraph(second, 72.2, [250, 262.3, 274.6, 286.9, 299.2, 311.5]);
    text("Check the applicable box below:", 71.3, 332);
    text(seal ? "Locked vehicle" : "( X ) Locked vehicle", 71.8, 352.8);
    text(`${seal ? "( X ) " : ""}Tamper evident number seal. If used, write the number of the seal associated with this cargo shipment`, 71.3, 373.8);
    text(`below: SEAL # ${seal}`, 71.3, 385.9);
    text("If an escort is used, write the name of the escort associated with this cargo shipment below", 71.3, 411.9);
    text(bar(31), 71.3, 432.6);
    text("Name and signature of employee or authorized representative attesting to the above certification:", 71.3, 453.4);
    text(`${name}  ${signer}${bar(17)}`, 79.4, 480.6);
    text("Name of company and name of driver delivering the cargo shipment:", 71.3, 502.6);
    const truckerLine = `${trucker}__ `;
    text(`${truckerLine}${bar(20)}`, 71.3, 523.3);
    if (driver) {
      doc.font(CCSF_REGULAR).fontSize(CCSF_SIZE);
      text(driver, 71.3 + doc.widthOfString(truckerLine) + 2, 521.3);
    }
    ccsfWrap(doc, [{ text: accepting }], CCSF_PARAGRAPH_WIDTH).forEach((row, index) => ccsfDrawLine(doc, row, 71.3, 536.5 + index * 13.2));
    text(bar(34), 71.3, 596.6);
    const footer = CCSF_FACILITY;
    doc.font(CCSF_REGULAR).fontSize(CCSF_SIZE);
    text(`${footer}.`, 300.95 - doc.widthOfString(`${footer}.`) / 2, 638);
  });
}

/** Magaya CCSP certification (045-54054792). */
export function renderMagayaCcsp(document: GuiaRecord, company: CompanyView, options: GuiaPrintOptions): Promise<Buffer> {
  const parts = securityParts(document, company, options);
  return securityLetter({
    title: "INDIRECT AIR CARRIER CERTIFICATION FOR CCSF CARGO",
    fileTitle: `${parts.awb || "DRAFT"}_CCSP`,
    awb: parts.awb,
    date: parts.date,
    signer: parts.signer,
    trucker: parts.trucker,
    driver: parts.driver,
    seal: parts.seal,
    footer: parts.footer,
    logo: companyLogo(company),
    paragraphs: [
      `${parts.name} is in compliance with its TSA-approved security program and all applicable security directives. Our number assigned by TSA is: ${parts.tsa}. All cargo tendered in conjuction with this certification was either 1) accepted from a known shipper or an unknown shipper in accordance with TSA requirements specified in the IACSSP or 2) accepted under transfer from another aircraft foreign operator, air carrier, or IAC operating under a TSA approved or accepted security. All Cargo has been screened and transported in accordance with the CCSP requirements. A chain of custody method has been applied, and the cargo is being tendered with the chain of custody method intact. The individual whose name appears below certified that he or she is an employee or authorized of ${parts.name} and understands that any fraudulent or false statement made in connection with this certification may subject this and ${parts.name} to both 1) Civil penalties under 49 CFR 1540.103 (b) and fines and/or imprisonment of not more than 5 years under 18 USC 1001.`,
    ],
  });
}
