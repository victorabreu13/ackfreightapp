import bwipjs from "bwip-js/node";
import PDFDocument from "pdfkit";
import type { CompanyView } from "@/lib/guias/company-profile";
import { dangerousGoodUns, lineVolumeM3, lineVolumeWeightKg, receiptNumber, receiptTotals } from "@/lib/guias/wr";

/**
 * The warehouse receipt: the receipt itself and the cargo acceptance checklist, both Letter size, laid out like the
 * reference receipt K5499. Coordinates are points from the top left.
 */

export type ReceiptDocument = {
  seq: number;
  receivedAt: Date;
  warehouse: string;
  receivedBy: string | null;
  shipperName: string | null;
  shipperAddress: string | null;
  consigneeName: string | null;
  consigneeAddress: string | null;
  carrier: string | null;
  driver: string | null;
  driverLicense: string | null;
  supplier: string | null;
  invoiceNumber: string | null;
  poNumber: string | null;
  pickupNumber: string | null;
  trackingNumber: string | null;
  proNumber: string | null;
  htPallet: boolean;
  palletType: string | null;
  dangerousGood: string | null;
  sealedDrum: string | null;
  notes: string | null;
  lines: Array<{
    pieces: number;
    packageType: string | null;
    length: number | null;
    width: number | null;
    height: number | null;
    weightKg: number | null;
    location: string | null;
    description: string | null;
    notes: string | null;
    pcTracking: string | null;
  }>;
};

type Doc = PDFKit.PDFDocument;

const GREY = "#6b7280";
const CELL = "#e5e7eb";
const BLACK = "#000000";

function t(doc: Doc, x: number, y: number, text: string, size = 7, font = "Helvetica", color = BLACK) {
  const value = text.replace(/\s+/g, " ").trim();
  if (!value) return;
  doc.fillColor(color).font(font).fontSize(size).text(value, x, y, { baseline: "alphabetic", lineBreak: false });
}

/** Right aligned: the text ends at `right`. */
function tr(doc: Doc, right: number, y: number, text: string, size = 7, font = "Helvetica", color = BLACK) {
  const value = text.replace(/\s+/g, " ").trim();
  if (!value) return;
  doc.font(font).fontSize(size);
  t(doc, right - doc.widthOfString(value), y, value, size, font, color);
}

function lines(doc: Doc, x: number, y: number, text: string | null, size = 7, step = 10, max = 5) {
  (text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, max)
    .forEach((line, index) => t(doc, x, y + index * step, line, size));
}

function wrapped(doc: Doc, text: string, size: number, width: number, font = "Helvetica"): string[] {
  doc.font(font).fontSize(size);
  const rows: string[] = [];
  for (const paragraph of text.split("\n")) {
    let current = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = current ? `${current} ${word}` : word;
      if (current && doc.widthOfString(next) > width) {
        rows.push(current);
        current = word;
      } else current = next;
    }
    if (current) rows.push(current);
  }
  return rows;
}

function format(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.month}/${parts.day}/${parts.year} ${parts.hour}:${parts.minute} ${String(parts.dayPeriod).toUpperCase()}`;
}

function hourOf(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false }).format(date).replace(":", "-");
}

const number = (value: number, digits = 2) => value.toFixed(digits);

/* ───────────── page 1: the receipt ───────────── */

function drawReceipt(doc: Doc, receipt: ReceiptDocument, company: CompanyView, barcode: Buffer | null) {
  const totals = receiptTotals(receipt.lines);
  const name = company.letterheadName.toUpperCase();
  t(doc, 11, 21, name, 8.5, "Helvetica-Bold");
  t(doc, 11, 29, [company.phone ? `Tel: ${company.phone}` : "", company.fax ? `Fax: ${company.fax}` : ""].filter(Boolean).join(",  "), 5.5);
  const address = company.address.replace(/\s+/g, " ").trim().split(/,\s*/);
  const street = address.slice(0, 2).join(", ");
  t(doc, 11, 42, street, 5.5);
  t(doc, 11, 50, address.slice(2, -1).join(", "), 5.5);
  t(doc, 11, 58, address.slice(-1).join(", "), 5.5);

  tr(doc, 594, 22, "WAREHOUSE RECEIPT", 13, "Helvetica-Bold");
  tr(doc, 594, 38, receiptNumber(receipt.seq), 8, "Helvetica-Bold", "#374151");
  if (barcode) doc.image(barcode, 499, 43, { width: 95, height: 17 });
  t(doc, 388, 70, "Received By:", 5.5, "Helvetica", GREY);
  t(doc, 388, 80, receipt.receivedBy || receipt.warehouse, 7, "Helvetica-Bold");
  t(doc, 497, 80, format(receipt.receivedAt), 7);
  doc.save().lineWidth(0.6).strokeColor("#111827").moveTo(11, 90).lineTo(594, 90).stroke().restore();

  t(doc, 12, 103, "Shipper", 5.5, "Helvetica", GREY);
  t(doc, 12, 113, receipt.shipperName ?? "", 7.5);
  lines(doc, 12, 129, receipt.shipperAddress, 7, 10, 4);
  t(doc, 12, 186, "Consignee", 5.5, "Helvetica", GREY);
  t(doc, 12, 195, receipt.consigneeName ?? "", 7.5);
  lines(doc, 12, 210, receipt.consigneeAddress, 7, 10, 4);

  const middle: Array<[string, string | null, number]> = [
    ["Carrier", receipt.carrier, 103],
    ["Driver", receipt.driver, 131],
    ["Driver License", receipt.driverLicense, 159],
    ["Supplier", receipt.supplier, 186],
    ["Invoice Number", receipt.invoiceNumber, 213],
    ["PO Number", receipt.poNumber, 240],
    ["Pick Up Number", receipt.pickupNumber, 264],
  ];
  for (const [label, value, y] of middle) {
    t(doc, 209, y, label, 5.5, "Helvetica", GREY);
    t(doc, 209, y + 10, value ?? "", 7);
  }
  t(doc, 408, 103, "Tracking Number / AWB Number", 5.5, "Helvetica", GREY);
  t(doc, 408, 113, receipt.trackingNumber ?? "", 7.5);
  t(doc, 408, 131, "PRO Number", 5.5, "Helvetica", GREY);
  t(doc, 408, 141, receipt.proNumber ?? "", 7);
  t(doc, 408, 157, "HT Pallet", 5.5, "Helvetica", GREY);
  if (receipt.htPallet) t(doc, 408, 167, "YES", 7, "Helvetica-Bold");
  t(doc, 468, 157, "Pallet Type", 5.5, "Helvetica", GREY);
  t(doc, 468, 165, receipt.palletType ?? "", 7, "Helvetica-Bold");
  t(doc, 408, 183, "Dangerous Good", 5.5, "Helvetica", GREY);
  if (receipt.dangerousGood?.trim()) t(doc, 408, 193, "YES", 7, "Helvetica-Bold");
  t(doc, 408, 207, "Sealed Drum", 5.5, "Helvetica", GREY);
  t(doc, 408, 217, receipt.sealedDrum ?? "", 7);
  if (receipt.dangerousGood?.trim()) t(doc, 408, 253, receipt.dangerousGood, 9, "Helvetica-Bold", "#dc2626");

  // The table header: three grey rows over the columns of the lines.
  const cells: Array<[number, number, number, number, string, "l" | "c"]> = [
    [19, 292, 19, 54, "Pcs", "c"],
    [38, 292, 47, 18, "Package", "c"],
    [85, 292, 101, 18, "Dimensions", "c"],
    [186, 292, 246, 18, "Description", "c"],
    [432, 292, 83, 18, "Weight", "c"],
    [515, 292, 79, 18, "Volume", "c"],
    [38, 310, 47, 18, "Location", "c"],
    [85, 310, 101, 18, "Invoice Number", "c"],
    [186, 310, 246, 18, "Notes", "c"],
    [432, 310, 83, 18, "Pc. Tracking No.", "c"],
    [515, 310, 79, 18, "Volume Weight", "c"],
    [38, 328, 47, 18, "Quantity", "c"],
    [85, 328, 101, 18, "Pickup Number / PO", "c"],
    [186, 328, 77, 18, "Part Number", "c"],
    [263, 328, 70, 18, "Model", "c"],
    [333, 328, 99, 18, "Serial Number", "c"],
  ];
  for (const [x, y, w, h, label] of cells) {
    doc.save().fillColor(CELL).rect(x + 0.5, y + 0.5, w - 1, h - 1).fill().restore();
    doc.font("Helvetica").fontSize(5.5);
    t(doc, x + (w - doc.widthOfString(label)) / 2, y + 11.5, label, 5.5, "Helvetica", "#374151");
  }

  let y = 356;
  for (const line of receipt.lines.slice(0, 9)) {
    const dims = line.length && line.width && line.height ? `${number(line.length)}x${number(line.width)}x${number(line.height)}in` : "";
    t(doc, 22, y, `${line.pieces} PCS`, 7);
    t(doc, 86, y, dims, 7);
    tr(doc, 506, y, line.weightKg != null ? `${number(line.weightKg)} kg` : "", 7);
    tr(doc, 579, y, dims ? `${number(lineVolumeM3(line))} m³` : "", 7);
    t(doc, 22, y + 11, line.location ?? "", 7);
    t(doc, 187, y + 11, line.description ?? "", 7);
    if (line.packageType) t(doc, 42, y, line.packageType, 6);
    tr(doc, 579, y + 11, dims ? `${number(lineVolumeWeightKg(line))} VKg` : "", 7);
    if (line.pcTracking) tr(doc, 506, y + 11, line.pcTracking, 6);
    if (line.notes) t(doc, 187, y + 21, line.notes, 6, "Helvetica", GREY);
    y += 33;
  }

  t(doc, 12, 651, "Notes", 5.5, "Helvetica", GREY);
  wrapped(doc, receipt.notes ?? "", 6.5, 340).slice(0, 4).forEach((row, index) => t(doc, 12, 661 + index * 8, row, 6.5));
  t(doc, 373, 665, "Pieces", 5.5, "Helvetica", GREY);
  t(doc, 438, 665, "Weight", 5.5, "Helvetica", GREY);
  t(doc, 515, 665, "Volume", 5.5, "Helvetica", GREY);
  tr(doc, 431, 681, String(totals.pieces), 7.5, "Helvetica-Bold");
  tr(doc, 512, 681, `${number(totals.weightKg)} Kg`, 7.5, "Helvetica-Bold");
  tr(doc, 593, 681, `${number(totals.volumeM3)} m³`, 7.5, "Helvetica-Bold");
  tr(doc, 594, 694, `${number(totals.volumeWeightKg)} VKg`, 7.5, "Helvetica-Bold");

  t(doc, 11, 711, "IMPORTANT NOTICE — STORAGE TERMS", 6, "Helvetica-Bold");
  const terms = `Storage, handling, and related services covered by this Warehouse Receipt are subject to the ${company.letterheadName} Standard Trading Terms and Conditions${company.termsUrl ? ` available at ${company.termsUrl}` : ""} and incorporated herein by reference. By delivering Goods for storage or accepting this receipt, the Customer agrees to those terms, including storage charges, lien and disposition rights, claim deadlines, and limitations and exclusions of liability. Warehouse liability is not cargo insurance.`;
  wrapped(doc, terms, 5.5, 583).slice(0, 4).forEach((row, index) => t(doc, 11, 723 + index * 6.5, row, 5.5));
  t(doc, 20, 759, name, 5.5, "Helvetica-Bold", GREY);
  tr(doc, 584, 759, company.address.replace(/\s+/g, " ").trim().toUpperCase(), 5.5, "Helvetica", GREY);
}

/* ───────────── page 2: the cargo acceptance checklist ───────────── */

type Mark = "si" | "no" | "na" | "";

const COL_SI = 382;
const COL_NO = 395;
const COL_NA = 409;

function box(doc: Doc, x: number, y: number, mark: boolean) {
  doc.save().lineWidth(0.6).strokeColor("#111827").rect(x, y - 6, 7, 7).stroke().restore();
  if (mark) {
    doc.save().lineWidth(1).strokeColor(BLACK).moveTo(x + 1.2, y - 4.8).lineTo(x + 5.8, y - 0.2).moveTo(x + 5.8, y - 4.8).lineTo(x + 1.2, y - 0.2).stroke().restore();
  }
}

function boxes(doc: Doc, y: number, mark: Mark) {
  box(doc, COL_SI, y, mark === "si");
  box(doc, COL_NO, y, mark === "no");
  box(doc, COL_NA, y, mark === "na");
}

function drawChecklist(doc: Doc, receipt: ReceiptDocument) {
  const uns = dangerousGoodUns(receipt.dangerousGood);
  const has = (un: string) => uns.includes(un);
  const dangerous = Boolean(receipt.dangerousGood?.trim());
  const unList = uns.map((un) => `UN${un}`).join(" ");

  doc.save().fillColor(CELL).rect(8, 8, 596, 17).fill().restore();
  doc.font("Helvetica-Bold").fontSize(9);
  t(doc, (612 - doc.widthOfString("CARGO ACCEPTANCE CHECKLIST")) / 2, 20, "CARGO ACCEPTANCE CHECKLIST", 9, "Helvetica-Bold");
  doc.save().fillColor(CELL).rect(8, 34, 596, 14).fill().restore();
  t(doc, 11, 43, "ITEM", 6, "Helvetica-Bold");
  t(doc, 54, 43, "DESCRIPCION", 6, "Helvetica-Bold");
  doc.save().fillColor("#22c55e").rect(378, 36, 38, 10).fill().restore();
  t(doc, 380, 43, "SI", 5.5, "Helvetica-Bold");
  t(doc, 392, 43, "NO", 5.5, "Helvetica-Bold");
  t(doc, 404, 43, "N/A", 5.5, "Helvetica-Bold");
  t(doc, 481, 43, "OBSERVACIONES", 6, "Helvetica-Bold");

  const row = (item: number, y: number, title: string, description: string, mark: Mark | null, label = "", value = "") => {
    t(doc, 14, y, String(item), 5.5);
    wrapped(doc, title, 5.5, 100, "Helvetica-Bold").slice(0, 2).forEach((part, index) => t(doc, 33, y + index * 6, part, 5.5, "Helvetica-Bold"));
    wrapped(doc, description, 5.5, 232).slice(0, 2).forEach((part, index) => t(doc, 142, y + index * 6, part, 5.5));
    if (mark !== null) boxes(doc, y + 1, mark);
    if (label) t(doc, 424, y, label, 5.5);
    if (value) t(doc, 484, y, value, 6);
    doc.save().lineWidth(0.3).strokeColor("#9ca3af").moveTo(8, y + 5, ).lineTo(604, y + 5).stroke().restore();
  };
  const underline = (y: number, from = 484) => doc.save().lineWidth(0.4).strokeColor("#111827").moveTo(from, y + 2).lineTo(594, y + 2).stroke().restore();

  // 1 Transport type: the sub rows are the modes.
  t(doc, 14, 58, "1", 5.5);
  t(doc, 33, 58, "Tipo de Transporte", 5.5, "Helvetica-Bold");
  t(doc, 142, 58, "Se refiere a indicar si la carga es para servicio maritimo, aereo o terrestre.", 5.5);
  const air = Boolean(receipt.trackingNumber?.trim());
  const modes: Array<[string, string, Mark, number]> = [
    ["Aereo", "AWB", air ? "si" : "na", 70],
    ["Maritimo", "BOL", "na", 81],
    ["Ground", "DOT", "na", 92],
    ["Almacenamiento", "KLE", air ? "na" : "si", 103],
  ];
  for (const [label, field, mark, y] of modes) {
    t(doc, 100 - (label.length > 6 ? 14 : 0), y, label, 5.5);
    boxes(doc, y + 1, mark);
    t(doc, 424, y, field, 5.5);
    underline(y);
  }
  t(doc, 484, 69, receipt.trackingNumber ?? "", 6);

  row(2, 118, "Situaccion de Remitente", "Se refiere a que este envio es de un Remitente Conocido, cliente actual?", "", "Nombre del reitente:", (receipt.shipperName ?? "").split(/[,\s]+LLC|,/i)[0]);
  row(3, 129, "Cumplimiento del remitente", "Se refiere a que este remitente ha completado y firmado el formulario de acuerdo de remitente?", "", "Detalles:");
  row(4, 143, "Verificacion de la documentacion", "Los documentos recibidos (por ejemplo, AWB,factura) permiten la inspeccion de la naturaleza de la carga?", "");
  ["Packing list", "Invoice", "Delivery Order", "AWB/BOL", "ID FORM", "Others"].forEach((label, index) => {
    const x = [424, 451, 473, 509, 535, 569][index];
    t(doc, x, 143, label, 4.8);
    box(doc, x + 2, 158, false);
  });
  row(5, 157, "Li-ion, Metal and or Sodium", "Se refiere a la aceptacion de UN 3480, UN 3090 y UN 3551.", null, "");
  const unRows: Array<[string, string, boolean, number]> = [
    ["UN 3480 Section IA and Section IB", "3480", has("3480"), 172],
    ["UN 3090 Section IA and Section IB", "3090", has("3090"), 181],
    ["UN 3551 SoC =< 30%", "3551", has("3551"), 191],
    ["UN 3481 Section I and Section II", "3481", has("3481"), 217],
    ["UN 3091 Section I and Section II", "3091", has("3091"), 229],
    ["UN 3552 SoC =< 30%", "3552", has("3552"), 242],
  ];
  for (const [label, , present, y] of unRows) {
    t(doc, 142, y, label, 5.5);
    boxes(doc, y + 1, present ? "si" : "na");
  }
  t(doc, 423, 169, "Detalles:", 5.5);
  t(doc, 484, 169, unList && uns.some((un) => ["3480", "3090", "3551"].includes(un)) ? uns.filter((un) => ["3480", "3090", "3551"].includes(un)).map((un) => `UN${un}`).join(" ") : "", 6);
  underline(169);
  row(6, 203, "Li-ion, Metal and or Sodium", "Se refiere a la aceptacion de UN 3481, UN 3091 y UN 3552", null);
  t(doc, 423, 214, "Detalles:", 5.5);
  t(doc, 484, 214, uns.filter((un) => ["3481", "3091", "3552"].includes(un)).map((un) => `UN${un}`).join(" "), 6);
  underline(214);
  row(7, 251, "Tipo de bulto", "Describa el tipo de embalaje recibido (cajas de carton, pallets, tambores, etc.)", receipt.palletType || receipt.lines.some((line) => line.packageType) ? "si" : "", "Detalles:", receipt.palletType?.trim() ? "PLT" : receipt.lines.find((line) => line.packageType)?.packageType ?? "");
  row(8, 259, "Hora de recibo", "Registre la hora exacta en que la carga fue recibida en bodega.", "si", "HORA: (HH-MM)", hourOf(receipt.receivedAt));
  row(9, 268, "Identificacion del entregador (conductor)", "Registre el nombre de la persona que realizo la entrega y adjunte una copia de su documento", receipt.driver?.trim() ? "si" : "", "Detalles:", receipt.driver ?? "");
  row(10, 283, "Confirmacion de reserva", "La carga tiene una reserva confirmada con la transportista?", "", "Booking Number:");
  row(11, 293, "Condicion de la carga", "Hay evidencia de danos, abolladuras o fugas en la carga?", "", "Detalles:");
  row(12, 303, "Dangerous Air Shipments", "-", dangerous ? "" : "na");
  const dgRows: Array<[number, string, string, string]> = [
    [13, "Is the Safety Data sheet (SDS) attached?", "SDS:", ""],
    [14, "Is the Dangerous Goods Declaration attached?", "DGD:", ""],
    [15, "El nombre correcto de envio en el formulario DGD es el mismo que en los volumenes fisicos?", "PSN:", ""],
    [16, "Estan presentes otros documentos requeridos, como la aprobacion gubernamental?", "Otros:", ""],
  ];
  dgRows.forEach(([item, description, label], index) => row(item, 314 + index * 11.5, "-", description, dangerous ? "" : "na", label));
  row(17, 360, "Descripcion de la naturaleza de la carga", "La declaracion de recepcion identifica claramente la naturaleza de la carga?", "", "Detalles:");
  row(18, 375, "Uso de plastico transparente", "El embalaje o pallet utiliza plastico transparente para facilitar la inspeccion visual?", "", "Detalles:");
  row(19, 387, "Cargo evidence (Photos)", "Se tomo una fotografia de la carga para documentar su condicion inicial?", "");
  wrapped(doc, "No olvide incluir evidencia fotografica de la carga durante el proceso de aceptacion incial.", 5.5, 170).forEach((part, index) => t(doc, 424, 386 + index * 6, part, 5.5));
  row(20, 400, "Codigo de seguimiento interno (almacen)", "Se ha asignado un codigo de seguimiento interno a la carga?", "si", "Warehouse Receipt", receiptNumber(receipt.seq));
  doc.save().lineWidth(0.6).strokeColor("#111827").rect(5, 418, 600, 128).stroke().restore();
  t(doc, 8, 427, "Observaciones: Inserte aqui comentarios, si corresponde.", 6);
  t(doc, 8, 438, unList, 6);

  t(doc, 12, 585, "DATE / FECHA:", 8);
  doc.save().lineWidth(0.6).strokeColor("#111827").rect(140, 568, 350, 22).stroke().restore();
  t(doc, 143, 582, format(receipt.receivedAt), 8);
  t(doc, 12, 610, "EMPLOYEE NAME / EMPLEADO:", 8);
  doc.save().lineWidth(0.6).strokeColor("#111827").rect(140, 596, 350, 22).stroke().restore();
  t(doc, 143, 610, receipt.receivedBy ?? receipt.warehouse, 8);
}

/** The warehouse receipt as a PDF of two pages: the receipt and the cargo acceptance checklist. */
export async function renderWarehouseReceipt(receipt: ReceiptDocument, company: CompanyView): Promise<Buffer> {
  const barcode = await bwipjs.toBuffer({ bcid: "code128", text: receiptNumber(receipt.seq), scale: 2, height: 8, includetext: false });
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margins: { top: 0, left: 0, right: 0, bottom: -4000 } });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      doc.info.Title = `WAREHOUSE RECEIPT ${receiptNumber(receipt.seq)}`;
      drawReceipt(doc, receipt, company, barcode);
      doc.addPage({ size: "LETTER", margins: { top: 0, left: 0, right: 0, bottom: -4000 } });
      drawChecklist(doc, receipt);
    } catch (error) {
      reject(error);
      return;
    }
    doc.end();
  });
}
