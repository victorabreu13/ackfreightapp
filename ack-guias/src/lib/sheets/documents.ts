/**
 * PDFs the sheet's "Kope" menu asks for, rendered in the app (pdfkit + bwip-js) and returned as base64;
 * the Apps Script saves them in Drive and links them in the row.
 *
 * Layouts, wording and fields copy Kope's real documents (read-only copies in kope-sheets/templates-real):
 *   - Delivery Order  ← "DELIVERY ORDER (DO) - EXPORT" (Magaya DO, e.g. 369-10298433 seal A61652)
 *   - Pickup Order    ← "PICK UP ORDER KPU2009"
 *   - CCSP letter     ← "CCSSSF CERTIFICATE OF TENDER TO A CARGO CARRIER" (suite 130 V2) and
 *                       "INDIRECT AIR CARRIER CERTIFICATION FOR CCSF CARGO" (045-54054792)
 *   - TSA letter      ← "INDIRECT AIR CARRIER WRITTEN CERTIFICATION FOR A PASSENGER AIR CARRIER" (Kope V1)
 *   - Labels          ← Magaya cargo label (LABELS 006-14513321), on 4x6
 *   - AWB cut         ← the issued IATA air waybill from the AWB module (no separate "corte" template exists)
 */
import { CONSIGNEE_MISSING, resolveLabelConsignee } from "./label-consignee";
import bwipjs from "bwip-js/node";
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/db";
import { toPdfModel } from "@/lib/awb/document";
import { renderAwbPdf } from "@/lib/awb/pdf";
import { KOPE_LOGO_PNG } from "@/lib/sheets/kope-logo";
import { normalizeTrucker, TRUCKER_REQUIRED_DOCS } from "@/lib/sheets/layout";

export const SHEET_DOCUMENTS = ["awbCut", "labels", "deliveryOrder", "pickupOrder", "ccsp", "tsa"] as const;
export type SheetDocument = (typeof SHEET_DOCUMENTS)[number];

export const DOCUMENT_TITLE: Record<SheetDocument, string> = {
  awbCut: "Corte de guia",
  labels: "Labels",
  deliveryOrder: "DO",
  pickupOrder: "Pickup Order",
  ccsp: "CCSF",
  tsa: "TSA LETTER KNOWN SHIPPER",
};

const env = (key: string, fallback: string) => process.env[key]?.trim() || fallback;

/** Company data exactly as printed on Kope's documents; each value can be overridden by an env var. */
export const KOPE = {
  legalName: env("KOPE_LEGAL_NAME", "KOPE LOGISTICS INC."),
  street: env("KOPE_STREET", "6550 NW 97TH AVE, SUITE 220"),
  city: env("KOPE_CITY", "DORAL, FL 33178"),
  country: "UNITED STATES",
  phone: env("KOPE_PHONE", "+1 (786) 719-0590"),
  fax: env("KOPE_FAX", "+1 (305) 503-9451"),
  email: env("KOPE_OPS_EMAIL", "info@kopelogistics.com"),
  termsUrl: env("KOPE_TERMS_URL", "https://www.kopelogistics.com/toc"),
  tsaIac: env("KOPE_IAC_ID", "SE1701005"),
  ccsfId: env("KOPE_CCSP_ID", "MIA.C.05.20.2025.582"),
  ccsfFacility: env("KOPE_CCSF_FACILITY", "6450 NW 97TH AVE, STE 130, DORAL, FL 33178"),
  ccsfFooter: env("KOPE_CCSF_FOOTER", "6450 NW 97TH AVE, SUITE 130 DORAL, FL 33178 | PH. 786-719-0590"),
  /** Warehouses as Magaya names them. KOPE2 = CCSF screening facility (exports), KOPE1 = main warehouse. */
  kope2: {
    name: "KOPE LOGISTICS INC (KOPE2)",
    lines: ["6450 NW 97TH AVE, SUITE 130", "DOORS 41 TO 51, DORAL, FL 33178,", "UNITED STATES", "Phone: (786) 719-0590", "Fax: (305) 503-9451", "Email: info@kopelogistics.com"],
  },
  kope1: {
    name: "KOPE LOGISTICS INC (KOPE1)",
    lines: ["6550 NW 97TH AVE, SUITE 220.", "DOORS 13 TO 23, DORAL, FL 33178, UNITED STATES", "Phone: (786) 719-0590", "Email: info@kopelogistics.com"],
  },
  magayaSystemId: env("KOPE_MAGAYA_SYSTEM_ID", "9690"),
};

/** MIA cargo terminals seen on the real DOs ("Deliver To" block); others print the airline name only. */
const MIA_TERMINALS: Array<{ match: RegExp; name: string; lines: string[] }> = [
  { match: /ATLAS/i, name: "ATLAS AIR", lines: ["Worldwide Flight Services (WFS)", "4350 NW 36TH ST POD C, MIAMI, FL", "33166, UNITED STATES", "Phone: (305) 777-7295"] },
  { match: /LATAM|LAN /i, name: "LATAM AIRLINES CARGO (MIA)", lines: ["1801 NW 66 AVENUE BLDG 709,", "MIAMI, FL 33122, UNITED STATES", "Phone: +1-786 265-6000"] },
];

/**
 * Address lines for truckers seen on real DOs, printed under the name when it matches.
 * NOT a default: the trucker changes every time and must be typed in the sheet for a DO / Pickup Order.
 */
const KNOWN_TRUCKER_ADDRESS: Array<{ match: RegExp; lines: string[] }> = [
  { match: /^KAY AIR DELIVERY/i, lines: ["2469 SW 23RD TER, MIAMI, FL", "33145, UNITED STATES", "Phone: (305) 993-8568"] },
];

export const LABEL_CAP = 300;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Sep/18/2026" — the date style on every Kope document. Stored ETA/ETD are NY wall time written as UTC. */
export function kopeDate(value: Date | null | undefined, opts: { wall?: boolean; shortYear?: boolean } = {}): string {
  if (!value) return "";
  const parts = opts.wall
    ? { y: value.getUTCFullYear(), m: value.getUTCMonth(), d: value.getUTCDate() }
    : (() => {
        const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(value);
        const get = (t: string) => Number(f.find((p) => p.type === t)?.value);
        return { y: get("year"), m: get("month") - 1, d: get("day") };
      })();
  const year = opts.shortYear ? String(parts.y).slice(2) : String(parts.y);
  return `${MONTHS[parts.m]}/${String(parts.d).padStart(2, "0")}/${year}`;
}

function kopeDateTime(value: Date): string {
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: true }).format(value);
  return `${kopeDate(value)} ${time}`;
}

/** Barcode on each piece: Code 39 of AWB prefix + serial + 4-digit piece ("369114411020001"). */
export function magayaPieceCode(awb: string, piece: number): string {
  const digits = awb.replace(/\D/g, "").slice(0, 11);
  return `${digits}${String(piece).padStart(4, "0")}`;
}

/** Magaya "Tracking Number (SystemID-Warehouse Receipt-ItemID)" as printed on the real labels: 9690-006-14513321-1Z. */
export function magayaTracking(awb: string, systemId = KOPE.magayaSystemId): string {
  const digits = awb.replace(/\D/g, "");
  return `${systemId}-${digits.slice(0, 3)}-${digits.slice(3, 11)}-1Z`;
}

/** DO "File Number": inbound master + 2nd leg AWB (IVI), or AWB - route - date for direct exports. */
export function doFileNumber(input: { awb: string; legAwb?: string | null; origin?: string | null; dest?: string | null; etd?: Date | null }): string {
  if (input.legAwb && input.legAwb !== input.awb) return `${input.awb} - ${input.legAwb}`;
  const route = ["MIA", input.dest].filter(Boolean).join("-");
  const date = input.etd ? `${String(input.etd.getUTCMonth() + 1).padStart(2, "0")}-${String(input.etd.getUTCDate()).padStart(2, "0")}-${input.etd.getUTCFullYear()}` : "";
  return [input.awb, route, date].filter(Boolean).join(" - ");
}

export type DocumentOptions = {
  labelsFor?: "master" | "leg";
  /** Tamper-evident seal number (CCSF letter, DO). */
  seal?: string;
  /** Trucker company (DO "Delivering Carrier", PO "Carrier", CCSF/TSA). Required for DO and Pickup Order; no default. */
  trucker?: string;
  driver?: string;
  /** Email of the person generating it (from the sheet); their Kope user name is printed as signer / "Prepared by". */
  email?: string;
};

type Doc = InstanceType<typeof PDFDocument>;

function collect(doc: Doc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

/** Drawing helpers below still take this shape. ACK Guías does not load shipment rows. */
type Loaded = {
  [key: string]: any;
  awb: string;
  dest: string | null;
  pcs: number | null;
  kgs: number | null;
  chw: number | null;
  build: string | null;
  flightNumber: string | null;
  consignee: string | null;
  legs: Array<{ awb: string | null; hawb: string | null; flightNumber: string | null; etd?: Date | null; id?: string }>;
  airWaybills: any[];
  client: { name: string; code?: string; awbParties: any[] };
};

async function loadShipment(_shipmentId: string): Promise<Loaded> {
  throw new Error("ACK Freight App does not load shipment records.");
}

async function airlineName(awb: string | null | undefined): Promise<string> {
  const prefix = (awb ?? "").replace(/\D/g, "").slice(0, 3);
  if (!prefix) return "";
  try {
    const row = await prisma.airlinePrefix.findUnique({ where: { prefix }, select: { airline: true } });
    return (row?.airline ?? "").toUpperCase();
  } catch {
    return "";
  }
}

async function signerName(email?: string): Promise<string> {
  if (!email) return "";
  const fallback = email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  try {
    const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { name: true } });
    return user?.name || fallback;
  } catch {
    return fallback;
  }
}

/** Outbound context: the AWB leaving MIA (2nd leg for IVI, else the master) with its parties. */
async function outbound(s: Loaded) {
  const leg = s.legs[0];
  const awb = leg?.awb || s.awb;
  const issued = s.airWaybills.find((d) => d.awb === awb && d.status === "issued") ?? s.airWaybills.find((d) => d.status === "issued");
  const party = (role: string) => s.client.awbParties.find((p) => p.role.toLowerCase() === role);
  const shipper = issued?.shipperName
    ? { name: issued.shipperName, address: issued.shipperAddress ?? "" }
    : party("shipper")
      ? { name: party("shipper")!.name, address: [party("shipper")!.address, party("shipper")!.phone, party("shipper")!.email].filter(Boolean).join("\n") }
      : { name: s.client.name, address: "" };
  const draft = s.airWaybills.find((d) => d.status === "draft" && d.consigneeName?.trim());
  const consignee = issued?.consigneeName
    ? { name: issued.consigneeName, address: issued.consigneeAddress ?? "" }
    : draft?.consigneeName
      ? { name: draft.consigneeName, address: draft.consigneeAddress ?? "" }
    : s.consignee?.trim()
      ? { name: s.consignee.trim(), address: "" }
    : party("consignee")
      ? { name: party("consignee")!.name, address: [party("consignee")!.address, party("consignee")!.phone, party("consignee")!.email].filter(Boolean).join("\n") }
      : { name: "", address: "" };
  const carrier = (await airlineName(awb)) || issued?.carrierName?.toUpperCase() || "";
  const terminal = MIA_TERMINALS.find((t) => t.match.test(carrier));
  return {
    awb,
    leg,
    issued,
    shipper,
    consignee,
    carrier,
    deliverTo: terminal ? { name: terminal.name, lines: terminal.lines } : { name: carrier, lines: [] as string[] },
    etd: leg?.etd ?? s.etd ?? null,
    flight: leg?.flightNumber ?? (leg ? null : s.flightNumber),
    hawb: leg?.hawb ?? issued?.hawb ?? "",
  };
}

/* ───────────── drawing helpers ───────────── */

const GREY = "#6B7280";
const LIGHT = "#E5E7EB";

function label(doc: Doc, text: string, x: number, y: number, width = 160) {
  doc.font("Helvetica").fontSize(7.5).fillColor(GREY).text(text, x, y, { width });
  doc.fillColor("#000000");
}

function block(doc: Doc, title: string, lines: string[], x: number, y: number, width = 160, size = 7.5) {
  label(doc, title, x, y, width);
  doc.font("Helvetica").fontSize(size).fillColor("#000000").text(lines.filter(Boolean).join("\n") || " ", x, y + 11, { width, lineGap: 0.5 });
  return doc.y;
}

function rule(doc: Doc, x1: number, y: number, x2: number, color = "#000000", width = 0.6) {
  doc.moveTo(x1, y).lineTo(x2, y).lineWidth(width).stroke(color);
}

function kg(value: number | null | undefined): string {
  return value == null ? "" : `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
}

/* ───────────── Delivery Order (DO) - EXPORT ───────────── */

async function deliveryOrder(s: Loaded, opts: DocumentOptions): Promise<Buffer> {
  const out = await outbound(s);
  const preparedBy = await signerName(opts.email);
  const doc = new PDFDocument({ size: [575, 768], margins: { top: 28, left: 28, right: 28, bottom: 10 } });
  const done = collect(doc);
  const X = 28;
  doc.image(KOPE_LOGO_PNG, X + 8, 14, { width: 110 });
  doc.font("Helvetica").fontSize(7.5).text([KOPE.legalName, `${KOPE.street}, ${KOPE.city},`, `${KOPE.country}`, `Phone: ${KOPE.phone}`, `Fax: ${KOPE.fax}`, `Email: ${KOPE.email}`].join("\n"), 158, 14, { width: 140 });
  doc.font("Helvetica-Bold").fontSize(15).text("DELIVERY ORDER (DO) - EXPORT", 305, 16, { width: 250, align: "right" });
  label(doc, "File Number:", 410, 38);
  doc.font("Helvetica").fontSize(7.5).text(doFileNumber({ awb: s.awb, legAwb: out.leg?.awb, dest: s.dest, etd: out.etd }), 410, 50, { width: 150 });
  label(doc, "Date:", 410, 64);
  doc.font("Helvetica").fontSize(7.5).text(kopeDate(new Date()), 410, 76);

  let y = 96;
  const cols = [X, X + 132, X + 264, X + 396];
  const truckerName = opts.trucker ?? "";
  const truckerLines = KNOWN_TRUCKER_ADDRESS.find((t) => t.match.test(truckerName))?.lines ?? [];
  const bottoms = [
    block(doc, "Pickup From:", [KOPE.kope2.name, ...KOPE.kope2.lines], cols[0], y, 125),
    block(doc, "Delivering Carrier:", [truckerName, ...truckerLines], cols[1], y, 125),
    block(doc, "Deliver To:", [out.deliverTo.name, ...out.deliverTo.lines], cols[2], y, 125),
    block(doc, "Return To:", [], cols[3], y, 125),
  ];
  y = Math.max(...bottoms) + 14;
  const b2 = [
    block(doc, "Shipper (Name and Address):", [out.shipper.name, out.shipper.address], cols[0], y, 125),
    block(doc, "Consignee (Name and Address):", [out.consignee.name, out.consignee.address], cols[1], y, 250),
    block(doc, "Bill To Party:", [KOPE.legalName, `${KOPE.street},`, `${KOPE.city}, ${KOPE.country}`, `Phone: ${KOPE.phone}`, `Fax: ${KOPE.fax}`, `Email: ${KOPE.email}`], cols[3], y, 125),
  ];
  y = Math.max(...b2) + 14;
  const grid: Array<[string, string]> = [
    ["BOL / AWB / Document Number:", out.awb], ["Carrier:", out.carrier], ["Port of Loading:", "Miami, US"], ["Departure Date:", kopeDate(out.etd, { wall: true })],
    ["House Number:", out.hawb ?? ""], ["Flight / Voyage:", [out.flight, kopeDate(out.etd, { wall: true })].filter(Boolean).join(" - ")], ["Port of Discharge:", s.dest ?? ""], ["Arrival Date:", ""],
    ["Customer Reference:", s.client.name], ["Booking Number:", ""], ["Final Destination:", s.dest ?? ""], ["Seal No.", opts.seal ?? ""],
  ];
  grid.forEach(([k, v], i) => {
    const cx = cols[i % 4], cy = y + Math.floor(i / 4) * 26;
    label(doc, k, cx, cy, 125);
    doc.font("Helvetica").fontSize(8).text(v || " ", cx, cy + 10, { width: 125 });
  });
  y += 3 * 26 + 8;

  // pieces table
  doc.rect(X, y, 519, 20).fill(LIGHT).fillColor("#000000");
  const th: Array<[string, number, number]> = [["Mark and Numbers", X + 6, 110], ["Pieces", X + 140, 60], ["Description", X + 230, 150], ["Weight", X + 390, 60], ["Vol Weight /\nChargeable Weight", X + 455, 64]];
  th.forEach(([t, x, w]) => doc.font("Helvetica").fontSize(7.5).fillColor(GREY).text(t, x, y + (t.includes("\n") ? 3 : 7), { width: w, align: t === "Description" ? "center" : "left" }));
  doc.fillColor("#000000");
  y += 26;
  const lines = out.issued?.lines?.length
    ? out.issued.lines.map((l: any) => ({ pcs: l.pieces ?? 0, desc: l.nature ?? "", kgs: l.grossWeight ?? null, chw: l.chargeableWeight ?? null }))
    : [{ pcs: s.pcs ?? 0, desc: s.build === "BUP" ? "BUP" : "Courier", kgs: s.kgs, chw: s.chw }];
  for (const line of lines) {
    doc.font("Helvetica").fontSize(8)
      .text(`${line.pcs} Pieces`, X + 140, y).text("PCS", X + 200, y).text(String(line.desc).slice(0, 80), X + 200, y + 11, { width: 180 })
      .text(kg(line.kgs), X + 380, y, { width: 70, align: "right" })
      .text(line.chw ? kg(line.chw) : "0.00 VKg", X + 455, y, { width: 64, align: "right" });
    y += 30;
  }
  const totPcs = lines.reduce((a: number, l: { pcs?: number }) => a + (l.pcs || 0), 0);
  const totKg = lines.reduce((a: number, l: { kgs?: number }) => a + (l.kgs || 0), 0);
  y = Math.max(y + 20, 470);
  rule(doc, X, y - 6, X + 519, LIGHT);
  doc.font("Helvetica-Bold").fontSize(11).text("TOTALS:", X, y);
  doc.font("Helvetica-Bold").fontSize(8).text("Total Pieces:\nTotal Weight:\nTotal Vol Weight:", X + 300, y, { width: 80 });
  doc.font("Helvetica").fontSize(8).text(`${totPcs} PCS\n${kg(totKg)}\n0.00 VKg`, X + 380, y, { width: 70, align: "right" });
  doc.text(`\n${kg(s.chw ?? totKg)}\n0.00 VKg`, X + 455, y, { width: 64, align: "right" });
  y += 46;
  label(doc, "Special Instructions:", X, y);
  label(doc, "Remarks:", X + 264, y);
  y += 56;

  const small = (text: string, gap = 6) => { doc.font("Helvetica").fontSize(5.6).text(text, X, y, { width: 519 }); y = doc.y + gap; };
  small("IMPORTANT NOTICE — TERMS AND CONDITIONS", 0);
  small(`This delivery and all related services are subject to the Kope Logistics Inc. Standard Trading Terms and Conditions available at ${KOPE.termsUrl} and incorporated herein by reference. By requesting, authorizing, or accepting delivery, the Customer agrees to those terms, including payment obligations, liens, claim deadlines, release requirements, and limitations and exclusions of liability. Acceptance of delivery does not waive unpaid charges, existing liens, or applicable claim requirements.`);
  small("It is required that each truck be equipped with DOT Emergency Response Guidebook, and the driver has been instructed in its use. This is to certify that the above named material are properly classified, described, packaged, marked and labeled and are in proper condition for transportation according to the applicable regulations of the Department of Transportation.");
  small(`This order is not valid until merchandise has been released and is available for delivery. Notify us at once if delivery cannot be delivered as instructed. NOTE: ${KOPE.legalName}, is an agent only, and has no beneficial title in property.`, 8);
  doc.font("Helvetica").fontSize(9).text("THE GOODS HEREIN DESCRIBED ARE ACCEPTED IN APPARENTLY GOOD ORDER AND CONDITION RECEIVED", X, y);
  y += 18;
  label(doc, "Prepared by:", X, y);
  doc.font("Helvetica").fontSize(8.5).text(preparedBy, X + 70, y, { width: 120, align: "center" });
  rule(doc, X + 70, y + 11, X + 190);
  doc.text(KOPE.legalName.replace(/\.$/, "."), X + 70, y + 14, { width: 120, align: "center" });
  label(doc, "Driver Name:", X, y + 34);
  doc.font("Helvetica").fontSize(8.5).text(opts.driver ?? "", X + 70, y + 34);
  doc.font("Helvetica").fontSize(8.5).fillColor(GREY).text("CARRIER: D.O.", X + 264, y).text("Received Signature:", X + 264, y + 11).text("CONSIGNEE: Freight", X + 264, y + 30).text("Received Signature:", X + 264, y + 41);
  doc.text("Date:", X + 450, y + 11).text("Date:", X + 450, y + 41).fillColor("#000000");
  rule(doc, X + 345, y + 20, X + 440); rule(doc, X + 472, y + 20, X + 519); rule(doc, X + 345, y + 50, X + 440); rule(doc, X + 472, y + 50, X + 519);
  doc.end();
  return done;
}

/* ───────────── PICK UP ORDER ───────────── */

async function pickupOrder(s: Loaded, opts: DocumentOptions): Promise<Buffer> {
  const airline = await airlineName(s.awb);
  const receivedBy = await signerName(opts.email);
  const now = new Date();
  const number = `KPU-${s.awb.replace(/\D/g, "").slice(3, 11)}`;
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 30, left: 30, right: 30, bottom: 10 } });
  const done = collect(doc);
  const X = 30;
  doc.image(KOPE_LOGO_PNG, X + 6, 18, { width: 120 });
  doc.font("Helvetica-Bold").fontSize(9).text(KOPE.legalName, 200, 20);
  doc.font("Helvetica").fontSize(7.5).text([`Tel: ${KOPE.phone}, Fax: ${KOPE.fax}`, KOPE.street, `${KOPE.city}.`, KOPE.country].join("\n"), 200, 32);
  doc.font("Helvetica-Bold").fontSize(16).text("PICK UP ORDER", 400, 26, { width: 182, align: "right" });
  doc.font("Helvetica").fontSize(9).text(number, 400, 46, { width: 182, align: "right" });
  const bar = await bwipjs.toBuffer({ bcid: "code128", text: number, scale: 2, height: 8 });
  doc.image(bar, 470, 60, { width: 110, height: 18 });

  label(doc, "Received by", 200, 90);
  doc.font("Helvetica").fontSize(8.5).text(receivedBy, 200, 101).text(kopeDateTime(now), 400, 101, { width: 182, align: "right" });
  rule(doc, 200, 113, 582, LIGHT);

  let y = 124;
  const cols = [X, 220, 410];
  doc.font("Helvetica-Bold").fontSize(8).text("Pickup information", cols[0], y).text("Delivery information", cols[1], y).text("Carrier", cols[2], y);
  y += 12;
  const pickupLines = [kopeDateTime(now), airline ? `${airline} CARGO (MIA)` : "Airline cargo terminal (MIA)", "Miami International Airport, MIA", s.flightNumber ? `Flight ${s.flightNumber} · ETA ${kopeDate(s.eta, { wall: true })}` : ""];
  doc.font("Helvetica").fontSize(7.5).text(pickupLines.filter(Boolean).join("\n"), cols[0], y, { width: 180 });
  const deliveryLines = [kopeDateTime(now), KOPE.kope1.name, ...KOPE.kope1.lines.slice(0, 2), "Contact: " + (receivedBy || "Kope warehouse"), ...KOPE.kope1.lines.slice(2)];
  doc.text(deliveryLines.join("\n"), cols[1], y, { width: 180 });
  doc.text(opts.trucker ?? "", cols[2], y, { width: 172 });
  label(doc, "PRO number", cols[2], y + 18);
  label(doc, "Tracking number / AWB", cols[2], y + 42);
  doc.font("Helvetica").fontSize(7.5).text(s.awb, cols[2], y + 53);
  label(doc, "Supplier", cols[2], y + 66);
  doc.font("Helvetica").fontSize(7.5).text(airline, cols[2], y + 77);
  y += 98;
  doc.font("Helvetica-Bold").fontSize(8).text("Shipper", cols[0], y).text("Consignee", cols[1], y).text("Charges", cols[2], y);
  doc.font("Helvetica").fontSize(7.5).text(airline || s.origin || "", cols[0], y + 11, { width: 180 }).text(s.client.name, cols[1], y + 11, { width: 180 });
  y += 30;
  doc.font("Helvetica-Bold").fontSize(8).text("Driver / Driver License", cols[0], y).text("Invoice number", cols[1], y);
  doc.font("Helvetica").fontSize(7.5).text(opts.driver ?? "", cols[0], y + 11);
  doc.font("Helvetica-Bold").fontSize(8).text("PO number", cols[1], y + 26);
  y += 52;

  doc.rect(X, y, 552, 26).fill(LIGHT).fillColor("#000000");
  const head = (t: string, x: number, yy: number, w = 80, align: "left" | "right" | "center" = "left") => doc.font("Helvetica").fontSize(7.5).fillColor(GREY).text(t, x, yy, { width: w, align });
  head("Pcs", X + 6, y + 3, 30); head("Package", X + 40, y + 3); head("Dimensions", X + 120, y + 3); head("Description", X + 230, y + 3, 160, "center"); head("Weight", X + 420, y + 3, 60, "right"); head("Volume", X + 488, y + 3, 60, "right");
  head("Location", X + 40, y + 14); head("Invoice Number", X + 120, y + 14); head("Notes", X + 230, y + 14, 160, "center"); head("Volume Weight", X + 470, y + 14, 78, "right");
  doc.fillColor("#000000");
  y += 34;
  doc.font("Helvetica").fontSize(7.5)
    .text(String(s.pcs ?? ""), X + 6, y, { width: 30 })
    .text(s.build === "BUP" ? "BUP" : "LOOSE", X + 40, y)
    .text(`MAWB ${s.awb}${s.flightNumber ? ` · ${s.flightNumber}` : ""}`, X + 230, y, { width: 160, align: "center" })
    .text(kg(s.kgs), X + 410, y, { width: 70, align: "right" })
    .text(s.chw ? `${s.chw.toFixed(2)} VKg` : "", X + 470, y + 11, { width: 78, align: "right" });
  y = Math.max(y + 60, 520);
  doc.font("Helvetica-Bold").fontSize(8).text("Notes", X, y);
  doc.font("Helvetica").fontSize(7.5).fillColor(GREY).text("Pieces", 400, y, { width: 50, align: "right" }).text("Weight", 455, y, { width: 60, align: "right" }).text("Volume", 520, y, { width: 62, align: "right" });
  doc.fillColor("#000000").text(String(s.pcs ?? ""), 400, y + 11, { width: 50, align: "right" }).text(kg(s.kgs).replace(" kg", " Kg"), 455, y + 11, { width: 60, align: "right" }).text(s.chw ? `${s.chw.toFixed(2)} VKg` : "", 520, y + 22, { width: 62, align: "right" });
  y += 50;
  doc.font("Helvetica-Bold").fontSize(7.5).text("IMPORTANT NOTICE — TERMS AND CONDITIONS", X, y);
  doc.font("Helvetica").fontSize(6).text(`This pickup and all related services are subject to the Kope Logistics Inc. Standard Trading Terms and Conditions available at ${KOPE.termsUrl} and incorporated herein by reference. By requesting or authorizing the pickup, releasing the Goods, or tendering them to Kope or its provider, the Customer agrees to those terms, including payment obligations, liens, claim deadlines, and limitations and exclusions of liability. Carrier liability is not cargo insurance.`, X, y + 12, { width: 552 });
  rule(doc, X, 742, 582, LIGHT);
  doc.font("Helvetica").fontSize(7.5).text(KOPE.legalName, X, 748).text(`${KOPE.street} ${KOPE.city}. ${KOPE.country}`, 300, 748, { width: 282, align: "right" });
  doc.end();
  return done;
}

/* ───────────── CCSF / CCSP certificate of tender ───────────── */

async function ccsfLetter(s: Loaded, opts: DocumentOptions): Promise<Buffer> {
  const out = await outbound(s);
  const signer = await signerName(opts.email);
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 50, left: 50, right: 50, bottom: 20 } });
  const done = collect(doc);
  const W = 512, X = 50;
  doc.font("Helvetica-Bold").fontSize(11).text("CCSSSF CERTIFICATE OF TENDER TO A CARGO CARRIER", X, 50, { width: W, align: "center" });
  const filled = (value: string, x: number, y: number, width: number) => {
    doc.font("Helvetica").fontSize(9.5).text(value, x + 6, y - 11, { width });
    rule(doc, x, y + 1, x + width);
  };
  doc.font("Helvetica").fontSize(9).text("Date:", X, 92);
  filled(kopeDate(new Date()), X + 26, 101, 110);
  doc.text("Air waybill, bill of lading, company inventory, or other internal shipping document number:", X, 120);
  filled(out.awb, X, 146, 140);
  const p = (text: string, gap = 10) => { doc.font("Helvetica").fontSize(8.6).text(text, X, doc.y + gap, { width: W, align: "justify" }); };
  doc.y = 150;
  p(`${KOPE.legalName} is in compliance with its TSA-approved security program and all appropriate security directive(s). Our number assigned by the TSA is ${KOPE.tsaIac}. All cargo tendered in conjunction with this certificate was either: 1) accepted from a Known Shipper or an Unknown Shipper in accordance with TSA requirements specified in the Indirect Air Carrier Standard Security Program, or 2) accepted under transfer from another direct or indirect air carrier operating under a TSA approved or accepted security program. This IAC is also a TSA-certified cargo screening facility (CCSSSF) and is in compliance with the TSA-approved certified cargo screening standard security program (CCSSSF). Our CCSSSF number assigned by TSA is ${KOPE.ccsfId}, which is applicable only to this facility, located at ${KOPE.ccsfFacility}.`);
  p(`All cargo has been screened and transported in accordance with the CCSSSF requirements. A chain of custody method has been applied, and the cargo is being tendered with the chain of custody method intact. The individual whose name appears below certifies that he or she is an employee or authorized representative of ${KOPE.legalName} and understands that any fraudulent or false statement made in connection with this certification may subject ${KOPE.legalName} and the individual to both (1) civil penalties under 49 CFR 1540.103(b) and (2) fines and/or imprisonment of not more than five years under 18 U.S.C. 1001. The cargo associated with this Master Air Waybill was screened at 100 percent.`);
  let y = doc.y + 24;
  doc.font("Helvetica").fontSize(9).text("Check the applicable box below:", X, y);
  y += 20;
  doc.text("(X) Locked vehicle", X, y);
  y += 18;
  doc.text(`(${opts.seal ? "X" : "  "}) Tamper evident number seal. If used, write the number of the seal associated with this cargo shipment below:`, X, y, { width: W });
  y = doc.y + 16;
  doc.text("SEAL #", X, y); filled(opts.seal ?? "", X + 36, y + 9, 230);
  y += 26;
  doc.text("If an escort is used, write the name of the escort associated with this cargo shipment below:", X, y);
  y += 24; rule(doc, X, y, X + 260);
  y += 14;
  doc.text("Name and signature of employee or authorized representative attesting to the above certification:", X, y);
  y += 24; filled(signer, X, y, 260);
  y += 10;
  doc.text("Name of company and name of driver delivering the cargo shipment:", X, y);
  y += 24; filled(opts.trucker ?? "", X, y, 240); filled(opts.driver ?? "", X + 250, y, 240);
  y += 12;
  doc.font("Helvetica").fontSize(8.6).text("Print name of the accepting entity's employee or authorized representative who is verifying that the seal number written above matches the seal number on the conveyance OR is verifying the government issued identification of the escort and ensuring the name matches the name written above OR is verifying that the cargo arrived in a locked conveyance. Accepting Employee or Authorized Representative:", X, y, { width: W });
  y = doc.y + 24; rule(doc, X, y, X + 260);
  doc.font("Helvetica").fontSize(8).text(`${KOPE.legalName} | ${KOPE.ccsfFooter}`, X, 740, { width: W, align: "center" });
  doc.end();
  return done;
}

/* ───────────── TSA: IAC written certification for a passenger air carrier ───────────── */

async function tsaLetter(s: Loaded, opts: DocumentOptions): Promise<Buffer> {
  const out = await outbound(s);
  const signer = await signerName(opts.email);
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 50, left: 50, right: 50, bottom: 20 } });
  const done = collect(doc);
  const X = 50, W = 512;
  doc.image(KOPE_LOGO_PNG, 236, 30, { width: 140 });
  doc.font("Helvetica-Bold").fontSize(13).text("INDIRECT AIR CARRIER WRITTEN CERTIFICATION FOR A\nPASSENGER AIR CARRIER", X, 118, { width: W, align: "center" });
  doc.font("Helvetica").fontSize(9).text(`${KOPE.legalName} is in compliance with its TSA-approved security program and all applicable security directives. Our number assigned by TSA is ${KOPE.tsaIac}. All cargo tendered in conjunction with this certification was either (1) accepted from a Known Shipper or an Unknown Shipper in accordance with TSA requirements specified in the Indirect Carrier Standard Security Program or (2) accepted under transfer from another aircraft operator, foreign air carrier, or IAC operating under a TSA-approved or accepted security program. The individual whose name appears below certifies that he or she is an employee or authorized representative of ${KOPE.legalName} and understands that any fraudulent or false statement made in connection with this certification may subject this individual and ${KOPE.legalName} to both (1) civil penalties under 49 CFR Part 1,540.105(b) and (2) fines and/or imprisonment of not more than 5 years under 18 U.S.C. 1001.`, X, 162, { width: W, align: "justify" });
  let y = doc.y + 22;
  const top = y - 8;
  const line = (labelText: string, value: string, x: number, width: number) => {
    doc.font("Helvetica").fontSize(9).text(labelText, x, y);
    const lx = x + doc.widthOfString(labelText) + 6;
    doc.text(value, lx + 4, y);
    rule(doc, lx, y + 10, x + width);
  };
  line("Printed Name and Signature of IAC Employee:", signer, X + 8, 420); y += 26;
  line("Name of IAC or Authorized Agent's employee tendering cargo:", opts.trucker ?? "", X + 8, 496); y += 26;
  line("Origin:", "Miami", X + 8, 230); line("Destination:", s.dest ?? "", X + 250, 250); y += 26;
  line("Date:", kopeDate(new Date()), X + 8, 230); line("Departure Date:", kopeDate(out.etd, { wall: true, shortYear: true }), X + 250, 250); y += 26;
  line("Master Airway Bill No.:", out.awb, X + 8, 300); y += 20;
  line("Number of items less than 16 oz.:", "0", X + 8, 250); y += 24;
  line("Name:", signer, X + 8, 260);
  doc.font("Helvetica").fontSize(9).text("certifies all consolidation of items weighing", X + 270, y);
  y += 12;
  doc.text("less than 16 oz. have been 100 percent inspected in accordance with Section 3.2.1.C.", X + 8, y);
  y += 24;
  line("Number of Known Shipper:", "1", X + 8, 250); y += 26;
  doc.font("Helvetica").fontSize(8.5).text("Warning: This record contains sensitive security information that is controlled under 49C.F.R. parts 15 and 1520. No part of this record may be disclosed to persons without a 'need to know', as defined in 49 C.F.R. parts 15 and 1520, except with the written permission of the administrator of the transportation security administration or the secretary of transportation. Unathorized release may result in civil penalty or other action. For U.S. Goverment Agencies, public disclosure is governed by 5 U.S.C. 552 and 49 C.F.R. parts 15 and 1520.", X + 8, y, { width: W - 16, align: "justify" });
  doc.rect(X, top, W, doc.y + 10 - top).lineWidth(0.8).stroke("#000000");
  doc.font("Helvetica").fontSize(8.5).text(KOPE.legalName, X, 720, { width: W, align: "center" });
  doc.fontSize(7.5).text(`${KOPE.street}, ${KOPE.city.replace(",", "")} ${KOPE.country}, Tel: ${KOPE.phone}, Fax: ${KOPE.fax}`, X, 736, { width: W, align: "center" });
  doc.end();
  return done;
}

/* ───────────── Magaya cargo labels (4x6) ───────────── */

/** Consignee printed on a label: see label-consignee.ts for the order. Never blank. */
export function labelConsigneeFor(s: Pick<Loaded, "awb" | "consignee" | "legs" | "airWaybills" | "client">, which: "master" | "leg", awb: string) {
  return resolveLabelConsignee({
    which,
    labelAwb: awb,
    docs: s.airWaybills.map((d) => ({ awb: d.awb, status: d.status, consigneeName: d.consigneeName, createdAt: d.createdAt })),
    shipmentConsignee: s.consignee,
    partyConsignee: s.client.awbParties.find((p) => p.role.toLowerCase() === "consignee")?.name ?? null,
    clientName: s.client.name,
  });
}

export type LabelBrand = {
  logo?: Buffer | null;
  /** When set, replaces the Kope name and address in the same header slots. */
  name?: string;
  address?: string;
  tel?: string;
};

async function labels(s: Loaded, which: "master" | "leg", brand?: LabelBrand): Promise<Buffer> {
  const leg = s.legs[0];
  const awb = which === "leg" && leg?.awb ? leg.awb : s.awb;
  const out = await outbound(s);
  const count = Math.max(1, Math.min(s.pcs ?? 1, LABEL_CAP));
  const carrier = (await airlineName(awb)) || "";
  const resolved = labelConsigneeFor(s, which, awb);
  const consignee = resolved.name;
  const dest = which === "leg" || !leg ? s.dest ?? "" : "MIA";
  const trackingPng = await bwipjs.toBuffer({ bcid: "code39", text: magayaTracking(awb), scale: 2, height: 9, includetext: true, textsize: 8 });
  const doc = new PDFDocument({ size: [288, 432], margin: 0 });
  const done = collect(doc);
  const L = 8, R = 280;
  for (let piece = 1; piece <= count; piece += 1) {
    if (piece > 1) doc.addPage({ size: [288, 432], margin: 0 });
    const png = await bwipjs.toBuffer({ bcid: "code39", text: magayaPieceCode(awb, piece), scale: 2, height: 11 });
    if (brand?.name) {
      doc.font("Helvetica").fontSize(9).text(brand.name, L + 4, 8, { width: 148, lineBreak: false });
      doc.fontSize(5.5).text(brand.address ?? "", L + 4, 20, { width: 148, height: 24 });
      doc.text(brand.tel ?? "", L + 4, 46, { width: 148, lineBreak: false });
    } else {
      doc.font("Helvetica").fontSize(9).text(KOPE.legalName, L + 4, 8);
      doc.fontSize(5.5).text(`${KOPE.street}\n${KOPE.city}.\n${KOPE.country}`, L + 4, 20);
      doc.text(`Tel:  ${KOPE.phone},  Fax:  ${KOPE.fax}`, L + 4, 46);
    }
    if (brand?.logo?.length) doc.image(brand.logo, 162, 6, { fit: [112, 46], align: "right", valign: "center" });
    rule(doc, L, 56, R);
    doc.fontSize(5.5).text("CARRIER", L + 2, 58); doc.fontSize(9).text(carrier ? `${carrier} (MIA)` : "", L + 8, 65, { width: 260 });
    rule(doc, L, 80, R);
    doc.fontSize(5.5).text("CONSIGNEE", L + 2, 82); if (resolved.missing) doc.font("Helvetica-Bold").fillColor("#b91c1c");
    doc.fontSize(9).text(consignee, L + 8, 89, { width: 260, height: 11, ellipsis: true });
    doc.font("Helvetica").fillColor("#000000");
    rule(doc, L, 104, R);
    doc.fontSize(5.5).text("MASTER WAY BILL NUMBER", L + 4, 106);
    doc.fontSize(15).text(awb, L, 116, { width: R - L, align: "center" });
    doc.image(png, 54, 138, { width: 180, height: 34 });
    rule(doc, L, 196, R);
    doc.moveTo(98, 196).lineTo(98, 238).moveTo(188, 196).lineTo(188, 238).lineWidth(0.6).stroke("#000000");
    doc.fontSize(5.5).text("DESTINATION", L + 4, 198).text("PIECE", 102, 198).text("TOTAL PIECES", 192, 198);
    doc.fontSize(22).text(dest, L + 2, 208, { width: 88 });
    doc.fontSize(18).text(String(piece), 98, 210, { width: 90, align: "center" }).text(String(count), 188, 210, { width: 92, align: "center" });
    rule(doc, L, 238, R);
    doc.fontSize(5.5).text("Tracking Number.  (SystemID-Warehouse Receipt-ItemID)", L + 4, 240);
    doc.image(trackingPng, 64, 250, { width: 160, height: 30 });
    rule(doc, L, 318, R);
    doc.fontSize(5.5).text("NOTES", L + 4, 320);
    const notes = [s.flightNumber ? `IN ${s.flightNumber}` : "", leg?.flightNumber ? `OUT ${leg.flightNumber}` : "", leg?.hawb ? `HAWB ${leg.hawb}` : "", which === "leg" && s.awb !== awb ? `INBOUND ${s.awb}` : ""].filter(Boolean).join("   ");
    doc.fontSize(7).text(notes, L + 8, 330, { width: 264 });
  }
  doc.end();
  return done;
}

/* ───────────── AWB cut ───────────── */

async function awbCut(s: Loaded): Promise<Buffer> {
  const issued = s.airWaybills.find((item) => item.status === "issued" && item.awb === (s.legs[0]?.awb || s.awb)) ?? s.airWaybills.find((item) => item.status === "issued");
  if (issued) return renderAwbPdf(toPdfModel(issued, issued.agent));
  throw new Error(`No issued air waybill for ${s.legs[0]?.awb || s.awb} in the Kope app yet. Issue it on the AWB page, then run "Corte de la guía" again.`);
}

export async function renderSheetDocument(shipmentId: string, kind: SheetDocument, options: DocumentOptions = {}) {
  const trucker = normalizeTrucker(options.trucker);
  if (TRUCKER_REQUIRED_DOCS.has(kind) && !trucker) throw new Error("Trucker company is required for a Delivery Order or Pickup Order.");
  options = { ...options, trucker: trucker || undefined };
  const s = await loadShipment(shipmentId);
  const leg = s.legs[0];
  let pdf: Buffer;
  switch (kind) {
    case "awbCut": pdf = await awbCut(s); break;
    case "labels": pdf = await labels(s, options.labelsFor ?? (leg?.awb ? "leg" : "master")); break;
    case "deliveryOrder": pdf = await deliveryOrder(s, options); break;
    case "pickupOrder": pdf = await pickupOrder(s, options); break;
    case "ccsp": pdf = await ccsfLetter(s, options); break;
    case "tsa": pdf = await tsaLetter(s, options); break;
  }
  // File names follow the Drive convention: "DO-045-55219415.pdf", "045-55174943_CCSF.pdf", "LABELS 006-14513321.pdf".
  const outAwb = leg?.awb || s.awb;
  const names: Record<SheetDocument, string> = {
    awbCut: `${outAwb} - GUIA MADRE.pdf`,
    labels: `LABELS ${kind === "labels" && (options.labelsFor ?? (leg?.awb ? "leg" : "master")) === "master" ? s.awb : outAwb}.pdf`,
    deliveryOrder: `DO-${outAwb}.pdf`,
    pickupOrder: `PICKUP ORDER ${s.awb}.pdf`,
    ccsp: `${outAwb}_CCSF.pdf`,
    tsa: `TSA_${outAwb}.pdf`,
  };
  let warning: string | undefined;
  if (kind === "labels") {
    const which = options.labelsFor ?? (leg?.awb ? "leg" : "master");
    const c = labelConsigneeFor(s, which, which === "leg" && leg?.awb ? leg.awb : s.awb);
    if (c.missing) warning = `${CONSIGNEE_MISSING} on ${names[kind]}: no consignee in the Kope AWB draft for ${which === "leg" && leg?.awb ? leg.awb : s.awb}. Fill it on the AWB draft (or bot setConsignee) and print again.`;
  }
  return { filename: names[kind], folder: s.awb, contentBase64: pdf.toString("base64"), ...(warning ? { warning } : {}) };
}

export { deliveryOrder, pickupOrder, ccsfLetter, tsaLetter, labels };
