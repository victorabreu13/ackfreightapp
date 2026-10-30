import bwipjs from "bwip-js/node";
import PDFDocument from "pdfkit";

export const LABEL_PIECE_CAP = 250;

export type LabelModel = {
  airline: string;
  awb: string;
  prefix: string;
  serial: string;
  origin: string;
  destination: string;
  pieces: number;
  totalWeight: string;
  hawb: string | null;
};

function pieceBarcode(prefix: string, serial: string, piece: number): string {
  return `${prefix}${serial}${String(piece).padStart(4, "0")}`;
}

async function barcode(text: string): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: "code128",
    text,
    scale: 2,
    height: 12,
    includetext: true,
    textsize: 8,
  });
}

export async function renderLabelsPdf(model: LabelModel): Promise<Buffer> {
  const count = Math.max(1, model.pieces);
  const images = await Promise.all(
    Array.from({ length: count }, (_, index) => barcode(pieceBarcode(model.prefix, model.serial, index + 1))),
  );
  const hawbImage = model.hawb ? await barcode(model.hawb.replace(/[\s-]/g, "")) : null;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [288, 432], margin: 0 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    images.forEach((image, index) => {
      if (index > 0) doc.addPage({ size: [288, 432], margin: 0 });
      drawLabel(doc, model, image, hawbImage, index + 1, count);
    });
    doc.end();
  });
}

type LabelDoc = InstanceType<typeof PDFDocument>;

/** Average chargeable kg per piece. Blank when either figure is missing. */
export function pieceWeightText(totalKg: number, pieces: number): string {
  if (!Number.isFinite(totalKg) || totalKg <= 0 || !Number.isFinite(pieces) || pieces <= 0) return "";
  const each = Math.round((totalKg / pieces) * 100) / 100;
  const text = Number.isInteger(each) ? String(each) : each.toFixed(2);
  return `${text} kg`;
}

/** Shrink, then truncate, so a long airline name stays on one line above the AWB. */
export function fitAirline(measure: (size: number, text: string) => number, name: string, maxWidth: number): { text: string; size: number } {
  const raw = name.trim() || "AIRLINE";
  for (let size = 14; size >= 8; size -= 0.5) {
    if (measure(size, raw) <= maxWidth) return { text: raw, size };
  }
  let text = raw;
  while (text.length > 1 && measure(8, `${text}...`) > maxWidth) text = text.slice(0, -1);
  return { text: text.length < raw.length ? `${text}...` : text, size: 8 };
}

export function zplAirline(name: string): string {
  const text = name.trim() || "AIRLINE";
  return text.length > 28 ? `${text.slice(0, 25)}...` : text;
}

function drawLabel(doc: LabelDoc, model: LabelModel, image: Buffer, hawbImage: Buffer | null, piece: number, count: number) {
  doc.rect(8, 8, 272, 416).lineWidth(2).stroke();
  const airline = fitAirline((size, text) => {
    doc.font("Helvetica-Bold").fontSize(size);
    return doc.widthOfString(text);
  }, model.airline, 256);
  doc.save();
  doc.rect(16, 14, 256, 20).clip();
  doc.font("Helvetica-Bold").fontSize(airline.size).text(airline.text, 16, 16, { width: 256, align: "center", lineBreak: false });
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(22).text(model.awb, 16, 36, { width: 256, align: "center", lineBreak: false });
  doc.image(image, 24, 66, { width: 240, height: 58 });
  doc.font("Helvetica-Bold").fontSize(54).text(model.destination || "—", 16, 132, { width: 256, align: "center" });
  doc.font("Helvetica").fontSize(11).text(`ORIGIN  ${model.origin || "—"}`, 16, 196, { width: 256 });
  doc.font("Helvetica-Bold").fontSize(20).text(`${piece}  of  ${count}`, 16, 216, { width: 256, align: "center" });
  doc.font("Helvetica").fontSize(12).text(`WEIGHT  ${model.totalWeight || "—"}`, 16, 246, { width: 256, align: "center" });
  if (model.hawb && hawbImage) {
    doc.font("Helvetica").fontSize(9).text(`HAWB  ${model.hawb}`, 16, 274, { width: 256, align: "center" });
    doc.image(hawbImage, 36, 290, { width: 216, height: 48 });
  }
  doc.font("Helvetica").fontSize(8).fillColor("#333").text("MAWB", 16, 390, { width: 256, align: "center" });
}

export function renderLabelsZpl(model: LabelModel, dpi: 203 | 300 = 203): string {
  const count = Math.max(1, model.pieces);
  const width = 4 * dpi;
  const height = 6 * dpi;
  const scale = dpi / 203;
  const labels: string[] = [];
  for (let piece = 1; piece <= count; piece += 1) {
    const data = pieceBarcode(model.prefix, model.serial, piece);
    const hawb = model.hawb?.replace(/[\s-]/g, "") ?? "";
    labels.push(
      [
        "^XA",
        "^CI28",
        `^PW${width}`,
        `^LL${height}`,
        `^FO${Math.round(20 * scale)},${Math.round(20 * scale)}^A0N,${Math.round(36 * scale)},${Math.round(36 * scale)}^FD${zplText(zplAirline(model.airline))}^FS`,
        `^FO${Math.round(20 * scale)},${Math.round(70 * scale)}^A0N,${Math.round(60 * scale)},${Math.round(60 * scale)}^FD${zplText(model.awb)}^FS`,
        `^FO${Math.round(20 * scale)},${Math.round(150 * scale)}^BY${Math.max(2, Math.round(2 * scale))},3,${Math.round(110 * scale)}^BCN,${Math.round(110 * scale)},Y,N,N^FD${data}^FS`,
        `^FO${Math.round(20 * scale)},${Math.round(310 * scale)}^A0N,${Math.round(120 * scale)},${Math.round(140 * scale)}^FD${zplText(model.destination || "")}^FS`,
        `^FO${Math.round(20 * scale)},${Math.round(450 * scale)}^A0N,${Math.round(36 * scale)},${Math.round(36 * scale)}^FDORIGIN ${zplText(model.origin || "")}^FS`,
        `^FO${Math.round(20 * scale)},${Math.round(510 * scale)}^A0N,${Math.round(56 * scale)},${Math.round(56 * scale)}^FD${piece} OF ${count}^FS`,
        `^FO${Math.round(20 * scale)},${Math.round(580 * scale)}^A0N,${Math.round(36 * scale)},${Math.round(36 * scale)}^FDWEIGHT ${zplText(model.totalWeight || "")}^FS`,
        hawb
          ? `^FO${Math.round(20 * scale)},${Math.round(650 * scale)}^A0N,${Math.round(28 * scale)},${Math.round(28 * scale)}^FDHAWB ${zplText(model.hawb ?? "")}^FS\n^FO${Math.round(20 * scale)},${Math.round(690 * scale)}^BY${Math.max(2, Math.round(2 * scale))},2,${Math.round(70 * scale)}^BCN,${Math.round(70 * scale)},Y,N,N^FD${hawb}^FS`
          : "",
        "^XZ",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return labels.join("\n");
}

function zplText(value: string): string {
  return value.replace(/[\^~]/g, " ");
}
