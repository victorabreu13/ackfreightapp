import { readFileSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import { ACK_LATAM_EN, ACK_LATAM_ES, KOPE_ATLAS_EN, paragraphs } from "./conditions";

type Doc = InstanceType<typeof PDFDocument>;

const fontDir = join(process.cwd(), "src/lib/awb/fonts");

export function registerAwbFonts(doc: Doc) {
  doc.registerFont("Sans", join(fontDir, "LiberationSans-Regular.ttf"));
  doc.registerFont("Sans-Bold", join(fontDir, "LiberationSans-Bold.ttf"));
  doc.registerFont("Mono", join(fontDir, "LiberationMono-Regular.ttf"));
  doc.registerFont("Mono-Bold", join(fontDir, "LiberationMono-Bold.ttf"));
}

export function drawConditionsPage(doc: Doc, bilingual: boolean) {
  if (bilingual) drawAck(doc);
  else drawKope(doc);
}

function isHeading(text: string): boolean {
  return text.length < 90 && text === text.toUpperCase() && !/^\d/.test(text);
}

function drawKope(doc: Doc) {
  const parts = paragraphs(KOPE_ATLAS_EN);
  const noticeTitle = parts[0] ?? "";
  const notice = parts[1] ?? "";
  const contractTitle = parts[2] ?? "";
  const body = parts.slice(3);
  const split = body.findIndex((part) => part.startsWith("6."));
  const left = split === -1 ? body : body.slice(0, split);
  const right = split === -1 ? [] : body.slice(split);
  const margin = 28;
  const width = 612 - margin * 2;
  const logo = readFileSync(join(fontDir, "iata-logo.jpg"));
  doc.image(logo, 612 / 2 - 22, 4, { width: 44, height: 30 });
  let y = 36;
  doc.fillColor("#111").font("Sans-Bold").fontSize(8).text(noticeTitle, margin, y, { width, align: "center" });
  y = doc.y + 4;
  doc.font("Sans").fontSize(7.5).text(notice, margin, y, { width, align: "left", lineGap: 0.5 });
  y = doc.y + 6;
  doc.font("Sans-Bold").fontSize(8).text(contractTitle, margin, y, { width, align: "center" });
  y = doc.y + 6;
  const gap = 14;
  const colW = (width - gap) / 2;
  const bottom = 774;
  drawFitted(doc, left, margin, y, colW, bottom, "Sans", "Sans-Bold", 7.5, "left");
  drawFitted(doc, right, margin + colW + gap, y, colW, bottom, "Sans", "Sans-Bold", 7.5, "left");
}

function drawAck(doc: Doc) {
  const english = paragraphs(ACK_LATAM_EN);
  const footer = english.at(-1)?.startsWith("IATA Res") ? english.pop() : undefined;
  const spanish = paragraphs(ACK_LATAM_ES);
  const margin = 22;
  const gutter = 12;
  const colW = (612 - margin * 2 - gutter) / 2;
  const top = 16;
  const bottom = footer ? 768 : 776;
  const logo = readFileSync(join(fontDir, "iata-logo.jpg"));
  doc.image(logo, 612 / 2 - 22, 4, { width: 44, height: 30 });
  drawFitted(doc, english, margin, top + 18, colW, bottom, "Mono", "Mono-Bold", 5.5, "justify");
  drawFitted(doc, spanish, margin + colW + gutter, top + 18, colW, bottom, "Mono", "Mono-Bold", 5.5, "justify");
  if (footer) {
    doc.font("Mono").fontSize(6).fillColor("#111").text(footer, margin, 774, { width: colW, lineBreak: false });
  }
}

function drawFitted(
  doc: Doc,
  parts: string[],
  x: number,
  y: number,
  width: number,
  bottom: number,
  regular: string,
  bold: string,
  preferred: number,
  align: "left" | "justify",
) {
  let size = preferred;
  let gap = 6;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const heights = parts.map((part) => {
      doc.font(isHeading(part) ? bold : regular).fontSize(isHeading(part) ? size + 1 : size);
      return doc.heightOfString(part, { width, align, lineGap: 0 });
    });
    const textH = heights.reduce((sum, height) => sum + height, 0);
    const slots = Math.max(1, parts.length - 1);
    const room = bottom - y - textH;
    gap = room / slots;
    if (gap >= 3.2) break;
    size -= 0.25;
    if (size < preferred - 1.5) break;
  }
  let cursor = y;
  for (const part of parts) {
    const heading = isHeading(part);
    doc.fillColor("#111").font(heading ? bold : regular).fontSize(heading ? size + 1 : size);
    const boldNumber = !heading && part.startsWith("4. For carriage to which the Montreal");
    if (boldNumber) {
      const at = part.indexOf("26");
      doc.text(part.slice(0, at), x, cursor, { width, align, continued: true, lineGap: 0 });
      doc.font(bold).text("26 ", { continued: true });
      doc.font(regular).text(part.slice(at + 3), { width, align, lineGap: 0 });
    } else {
      doc.text(part, x, cursor, { width, align, lineGap: 0 });
    }
    cursor = doc.y + Math.max(2.4, gap);
  }
}
