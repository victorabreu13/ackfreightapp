import bwipjs from "bwip-js/node";
import PDFDocument from "pdfkit";
import { codeForPlace, cityForAirport } from "./airports";
import { settleCharges, type GoodsInput } from "./calc";
import {
  ACK_CERT_BOLD,
  ACK_CERT_LEAD,
  ACK_COPIES,
  ACK_DIVERSION,
  ACK_EXPORT,
  ACK_FACE_AGREEMENT,
  ACK_INSURANCE,
  KOPE_CERT,
  KOPE_COPIES,
  KOPE_DIVERSION,
  KOPE_EXPORT,
  KOPE_FACE_AGREEMENT,
  KOPE_INSURANCE,
} from "./conditions";
import { drawConditionsPage, registerAwbFonts } from "./pdf-conditions";

export type AwbPdfAgent = {
  legalName: string;
  address: string;
  phone: string | null;
  city: string;
  iataCode: string;
  accountNo: string | null;
  conditions: string;
  copyLabel: string | null;
};

export type AwbPdfModel = {
  awb: string;
  prefix: string;
  serial: string;
  agent: AwbPdfAgent;
  shipperName: string | null;
  shipperAddress: string | null;
  shipperAccount: string | null;
  consigneeName: string | null;
  consigneeAddress: string | null;
  consigneeAccount: string | null;
  carrierName: string | null;
  carrierAddress: string | null;
  accountNo: string | null;
  referenceNumber: string | null;
  departure: string | null;
  to1: string | null;
  by1: string | null;
  to2: string | null;
  by2: string | null;
  to3: string | null;
  by3: string | null;
  currency: string;
  chgsCode: string;
  wtVal: string;
  otherPpc: string;
  declaredCarriage: string;
  declaredCustoms: string;
  destination: string | null;
  flightDate: string | null;
  insurance: string | null;
  handling: string | null;
  /** Guía notify party, printed on its own line. Sheet waybills leave this empty. */
  notifyParty?: string | null;
  /** Guía rate and weight charge print AS ARRANGED instead of a computed amount. */
  asArranged?: boolean;
  sci: string | null;
  destCountry: string | null;
  otherChargesText: string | null;
  accountingInfo: string | null;
  lines: GoodsInput[];
  weightCharge: number | null;
  valuationCharge: number | null;
  taxCharge: number | null;
  otherDueAgent: number | null;
  otherDueCarrier: number | null;
  shipperSignature: string | null;
  executedOn: string | null;
  executedAt: string | null;
  carrierSignature: string | null;
};

type Doc = InstanceType<typeof PDFDocument>;
type Layout = "kope" | "ack";

const CYAN = "#00DFDF";
const GRAY = "#D5D5D5";

function pdfBuffer(draw: (doc: Doc) => void | Promise<void>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 0 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    registerAwbFonts(doc);
    Promise.resolve(draw(doc))
      .then(() => doc.end())
      .catch(reject);
  });
}

async function barcode(text: string, height: number): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: "code128",
    text,
    scale: 2,
    height,
    includetext: false,
    paddingwidth: 0,
    paddingheight: 0,
  });
}

function amount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "";
  return value.toFixed(2);
}

function shownAmount(value: number, layout: Layout, always: boolean): string {
  if (!always && value === 0) return "";
  return amount(value);
}

export async function renderAwbPdf(model: AwbPdfModel): Promise<Buffer> {
  const digits = `${model.prefix}${model.serial}`;
  const [wide, tall] = await Promise.all([barcode(digits, 14), barcode(digits, 10)]);
  const charges = settleCharges({
    lines: model.lines,
    wtVal: model.wtVal,
    otherPpc: model.otherPpc,
    weightCharge: model.weightCharge,
    valuationCharge: model.valuationCharge,
    taxCharge: model.taxCharge,
    otherDueAgent: model.otherDueAgent,
    otherDueCarrier: model.otherDueCarrier,
  });
  const layout: Layout = model.agent.conditions === "bilingual" ? "ack" : "kope";
  return pdfBuffer((doc) => {
    drawFace(doc, model, layout, wide, tall, charges);
    doc.addPage();
    drawConditionsPage(doc, layout === "ack");
  });
}

function stroke(doc: Doc, width = 0.7) {
  doc.lineWidth(width).strokeColor("#222");
}

function rect(doc: Doc, x: number, y: number, w: number, h: number, fill?: string) {
  if (fill) doc.save().fillColor(fill).rect(x, y, w, h).fill().restore();
  stroke(doc);
  doc.rect(x, y, w, h).stroke();
}

function label(doc: Doc, text: string, x: number, y: number, w: number, size = 5) {
  doc.font("Sans").fontSize(size).fillColor("#222").text(text, x + 2, y + 1, { width: w - 4, height: size + 8, lineGap: 0 });
}

function value(doc: Doc, text: string, x: number, y: number, w: number, h: number, size = 8, bold = false) {
  doc
    .font(bold ? "Sans-Bold" : "Sans")
    .fontSize(size)
    .fillColor("#111")
    .text(text || "", x + 2, y, { width: Math.max(4, w - 4), height: h });
}

function party(name: string | null, address: string | null, upper: boolean): string {
  const text = [name, address].filter(Boolean).join("\n");
  return upper ? text.toUpperCase() : text;
}

function kopeCity(raw: string): string {
  const upper = raw.trim().toUpperCase();
  if (!upper) return "";
  if (/^[A-Z]{3}$/.test(upper)) return cityForAirport(upper);
  const code = codeForPlace(upper);
  if (/^[A-Z]{3}$/.test(code) && cityForAirport(code) !== code) return cityForAirport(code);
  return raw.trim();
}

function departureShown(raw: string | null, layout: Layout): string {
  const text = (raw ?? "").trim();
  if (!text) return "";
  if (layout === "kope") return kopeCity(text);
  const upper = text.toUpperCase();
  if (upper === "MIA" || upper === "MIAMI") return "MIAMI INTERNATIONAL AIRPORT";
  return text;
}

function destinationShown(raw: string | null, layout: Layout): string {
  const text = (raw ?? "").trim();
  if (!text) return "";
  if (layout === "kope") return kopeCity(text);
  const code = codeForPlace(text);
  if (code === "GUA" || text.toUpperCase() === "GUATEMALA CITY") return "GUATEMALA CITY";
  return text.toUpperCase();
}

function originCode(raw: string | null): string {
  const code = codeForPlace(raw ?? "");
  return /^[A-Z]{3}$/.test(code) ? code : "";
}

function mark(doc: Doc, x: number, y: number, layout: Layout) {
  if (layout === "ack") {
    doc.font("Sans-Bold").fontSize(9).fillColor("#111").text("X", x, y, { lineBreak: false });
    return;
  }
  stroke(doc, 0.6);
  doc.rect(x, y, 8, 8).stroke();
  doc.moveTo(x + 1.4, y + 4).lineTo(x + 3.2, y + 6.4).lineTo(x + 6.8, y + 1.6).stroke();
}

function clipText(doc: Doc, x: number, y: number, w: number, h: number, draw: () => void) {
  doc.save();
  doc.rect(x, y, w, h).clip();
  draw();
  doc.restore();
}

function drawFace(
  doc: Doc,
  model: AwbPdfModel,
  layout: Layout,
  wide: Buffer,
  tall: Buffer,
  charges: ReturnType<typeof settleCharges>,
) {
  if (layout === "ack") drawAckFace(doc, model, wide, tall, charges);
  else drawKopeFace(doc, model, wide, charges);
}

function placeBarcode(doc: Doc, image: Buffer, x: number, y: number, width: number, height: number) {
  doc.image(image, x, y, { width, height });
}

function drawKopeFace(doc: Doc, model: AwbPdfModel, wide: Buffer, charges: ReturnType<typeof settleCharges>) {
  const L = 59.6;
  const R = 590.4;
  const mid = 317.5;
  const shade = CYAN;
  placeBarcode(doc, wide, 236, 4, 148, 27);
  const code = originCode(model.departure) || "MIA";
  const headY = 13;
  const headH = 18.4;
  const head = [
    [L, 28.8, model.prefix],
    [L + 28.8, 33, code],
    [L + 61.8, 62, model.serial],
  ] as const;
  for (const [x, w, text] of head) {
    rect(doc, x, headY, w, headH);
    doc.font("Sans-Bold").fontSize(9).fillColor("#111").text(text, x, headY + 4.5, { width: w, align: "center", lineBreak: false });
  }
  doc.font("Sans-Bold").fontSize(11).text(`${model.prefix}    ${model.serial}`, 430, 14, { width: 155, align: "right", lineBreak: false });

  const shipTop = 31.4;
  const shipBot = 103.4;
  const acctX = 188.5;
  const acctH = 24.2;
  drawParty(doc, model, "kope", "shipper", L, shipTop, mid - L, shipBot - shipTop, 206, acctH, false);
  drawCarrierBlock(doc, model, "kope", mid, shipTop, R, 85.1, shipBot);

  const consBot = 174.8;
  drawParty(doc, model, "kope", "consignee", L, shipBot, mid - L, consBot - shipBot, 206, 22, true);
  clipText(doc, mid + 2, shipBot + 1, R - mid - 4, consBot - shipBot - 2, () => {
    doc.font("Sans").fontSize(5.15).fillColor("#111").text(KOPE_FACE_AGREEMENT, mid + 3, shipBot + 2, {
      width: R - mid - 7,
      align: "left",
      lineGap: 0.15,
    });
  });

  const iataTop = 222.5;
  const depTop = 246.8;
  drawAgentRow(doc, model, "kope", L, consBot, mid, iataTop, R, depTop, acctX);
  const routeTop = 271;
  drawDeparture(doc, model, "kope", L, depTop, mid, routeTop, R);
  const destTop = 293.9;
  drawRouting(doc, model, "kope", L, routeTop, destTop, R);
  const handTop = 318.8;
  drawDestination(doc, model, "kope", L, destTop, handTop, R, shade);
  const rateTop = 365.9;
  drawHandling(doc, model, "kope", L, handTop, rateTop, R);
  const chargeTop = 557;
  drawRates(doc, model, "kope", L, rateTop, chargeTop, R, shade);
  drawCharges(doc, model, "kope", charges, L, R, shade);
}

function drawAckFace(
  doc: Doc,
  model: AwbPdfModel,
  wide: Buffer,
  tall: Buffer,
  charges: ReturnType<typeof settleCharges>,
) {
  const L = 54.3;
  const R = 584.5;
  const mid = 314.8;
  const shade = GRAY;
  doc.save();
  doc.rotate(-90, { origin: [38, 36] });
  doc.image(tall, 38, 36, { width: 145, height: 13 });
  doc.restore();
  placeBarcode(doc, wide, 220, 2, 150, 20);
  doc.font("Sans-Bold").fontSize(11).fillColor("#111").text(model.awb, L, 8, { width: 150, lineBreak: false });
  doc.font("Sans-Bold").fontSize(11).text(model.awb, R - 150, 8, { width: 148, align: "right", lineBreak: false });

  const shipTop = 22.9;
  const shipBot = 95.6;
  drawParty(doc, model, "ack", "shipper", L, shipTop, mid - L, shipBot - shipTop, 200, 22, false);
  drawCarrierBlock(doc, model, "ack", mid, shipTop, R, 83.1, shipBot);

  const consBot = 167.6;
  drawParty(doc, model, "ack", "consignee", L, shipBot, mid - L, consBot - shipBot, 198, 20, false);
  clipText(doc, mid + 2, shipBot + 1, R - mid - 4, consBot - shipBot - 2, () => {
    doc.font("Sans").fontSize(5).fillColor("#111").text(ACK_FACE_AGREEMENT, mid + 3, shipBot + 1.5, {
      width: R - mid - 7,
      align: "justify",
      lineGap: 0.1,
    });
  });

  const iataTop = 216.7;
  const depTop = 240.2;
  drawAgentRow(doc, model, "ack", L, consBot, mid, iataTop, R, depTop, 186);
  const routeTop = 263.8;
  drawDeparture(doc, model, "ack", L, depTop, mid, routeTop, R);
  const destTop = 284.7;
  drawRouting(doc, model, "ack", L, routeTop, destTop, R);
  const handTop = 309.6;
  drawDestination(doc, model, "ack", L, destTop, handTop, R, shade);
  const rateTop = 363.3;
  drawHandling(doc, model, "ack", L, handTop, rateTop, R);
  const chargeTop = 555.1;
  drawRates(doc, model, "ack", L, rateTop, chargeTop, R, shade);
  drawCharges(doc, model, "ack", charges, L, R, shade);

  doc.font("Sans-Bold").fontSize(10).fillColor("#111");
  if (model.agent.copyLabel) {
    doc.text(model.agent.copyLabel, L, 766, { width: R - L - 110, align: "center", lineBreak: false });
  }
  doc.text(model.awb, R - 120, 752, { width: 118, align: "right", lineBreak: false });
}

function drawParty(
  doc: Doc,
  model: AwbPdfModel,
  layout: Layout,
  which: "shipper" | "consignee",
  x: number,
  y: number,
  w: number,
  h: number,
  accountX: number,
  accountH: number,
  accountShade: boolean,
) {
  const shipper = which === "shipper";
  const name = shipper ? model.shipperName : model.consigneeName;
  const address = shipper ? model.shipperAddress : model.consigneeAddress;
  const account = shipper ? model.shipperAccount : model.consigneeAccount;
  rect(doc, x, y, w, h);
  const acctW = x + w - accountX;
  rect(doc, accountX, y, acctW, accountH, accountShade ? CYAN : undefined);
  label(doc, shipper ? "Shipper's Name and Address" : "Consignee's Name and Address", x, y, accountX - x);
  label(doc, shipper ? "Shipper's Account Number" : "Consignee's Account Number", accountX, y, acctW, 5);
  const upper = layout === "kope";
  const shownName = upper ? (name ?? "").toUpperCase() : name ?? "";
  const shownAddress = upper ? (address ?? "").toUpperCase() : address ?? "";
  clipText(doc, x + 2, y + 9, accountX - x - 4, accountH - 8, () => {
    doc.font(upper ? "Sans-Bold" : "Sans").fontSize(upper ? 7.1 : 8).fillColor("#111").text(shownName, x + 3, y + 11, {
      width: accountX - x - 6,
      lineGap: 0,
      lineBreak: false,
    });
  });
  if (account) {
    doc.font("Sans").fontSize(7).text(account, accountX + 2, y + 11, { width: acctW - 4, height: accountH - 12 });
  }
  clipText(doc, x + 2, y + accountH, w - 4, h - accountH - 1, () => {
    doc.font("Sans").fontSize(layout === "kope" ? 7.4 : 8).fillColor("#111").text(shownAddress, x + 3, y + accountH + 1, {
      width: w - 8,
      lineGap: 0.4,
    });
  });
}

function drawCarrierBlock(doc: Doc, model: AwbPdfModel, layout: Layout, x: number, y: number, right: number, copiesY: number, bottom: number) {
  const w = right - x;
  rect(doc, x, y, w, copiesY - y);
  doc.font("Sans-Bold").fontSize(6.5).fillColor("#111").text("Not Negotiable", x + 4, y + 3, { width: 78, lineBreak: false });
  doc.font("Sans-Bold").fontSize(12).text("Air Waybill", x + 4, y + 12, { width: 90, lineBreak: false });
  doc.font("Sans").fontSize(6).text("Issued By", x + 4, y + copiesY - y - 12, { width: 70, lineBreak: false });
  clipText(doc, x + 78, y + 2, w - 82, copiesY - y - 4, () => {
    doc.font("Sans-Bold").fontSize(8).fillColor("#111").text(model.carrierName ?? "", x + 80, y + 4, { width: w - 86 });
    doc.font("Sans").fontSize(6.2).text(model.carrierAddress ?? "", x + 80, y + 15, { width: w - 86, lineGap: 0.2 });
  });
  rect(doc, x, copiesY, w, bottom - copiesY);
  doc.font("Sans").fontSize(5.4).fillColor("#111").text(layout === "kope" ? KOPE_COPIES : ACK_COPIES, x + 3, copiesY + 2.2, {
    width: w - 6,
    lineBreak: false,
  });
}

function drawAgentRow(
  doc: Doc,
  model: AwbPdfModel,
  layout: Layout,
  x: number,
  y: number,
  mid: number,
  iataY: number,
  right: number,
  depY: number,
  splitX: number,
) {
  rect(doc, x, y, mid - x, iataY - y);
  label(doc, layout === "kope" ? "Issuing Carrier's Agent Name and City" : "Issuing Carrier's Agent name and City", x, y, mid - x);
  const agentText = [model.agent.legalName, model.agent.address, model.agent.phone ? `Phone: ${model.agent.phone}` : ""]
    .filter(Boolean)
    .join("\n");
  clipText(doc, x + 2, y + 9, mid - x - 4, iataY - y - 10, () => {
    doc.font("Sans").fontSize(7).fillColor("#111").text(agentText, x + 3, y + 11, { width: mid - x - 8, lineGap: 0.3 });
  });
  rect(doc, mid, y, right - mid, depY - y);
  label(doc, "Accounting Information", mid, y, right - mid);
  const accounting = model.accountingInfo?.trim() || (model.wtVal === "COLL" ? "" : "FREIGHT PREPAID");
  doc.font("Sans-Bold").fontSize(8).fillColor("#111").text(accounting, mid + 4, y + 16, { width: right - mid - 8, lineBreak: false });

  rect(doc, x, iataY, splitX - x, depY - iataY);
  label(doc, "Agent's IATA Code", x, iataY, splitX - x);
  doc.font("Sans-Bold").fontSize(8).text(model.agent.iataCode, x + 3, iataY + 11, { width: splitX - x - 6, lineBreak: false });
  rect(doc, splitX, iataY, mid - splitX, depY - iataY);
  label(doc, "Account No.", splitX, iataY, mid - splitX);
  const accountNo = model.accountNo || model.agent.accountNo || "";
  doc.font("Sans-Bold").fontSize(7.5).text(accountNo, splitX + 3, iataY + 11, { width: mid - splitX - 6, lineBreak: false });
}

function drawDeparture(doc: Doc, model: AwbPdfModel, layout: Layout, x: number, y: number, mid: number, bottom: number, right: number) {
  const ref = layout === "kope" ? 418.3 : 414.3;
  const opt = layout === "kope" ? 504 : 496.8;
  const h = bottom - y;
  rect(doc, x, y, mid - x, h);
  label(doc, "Airport of Departure (Addr. of First Carrier) and Requested Routing", x, y, mid - x);
  doc.font("Sans-Bold").fontSize(8).fillColor("#111").text(departureShown(model.departure, layout), x + 3, y + 12, {
    width: mid - x - 6,
    lineBreak: false,
  });
  rect(doc, mid, y, ref - mid, h);
  label(doc, "Reference Number", mid, y, ref - mid);
  doc.font("Sans").fontSize(7).text(model.referenceNumber ?? "", mid + 3, y + 12, { width: ref - mid - 6 });
  rect(doc, ref, y, right - ref, h);
  label(doc, "Optional Shipping Information", ref, y, right - ref);
  stroke(doc, 0.5);
  doc.moveTo(ref, y + 9).lineTo(ref + 28, y + 9).lineTo(ref + 36, y).stroke();
  doc.moveTo(opt - 8, y + 9).lineTo(opt, y).stroke();
}

function drawRouting(doc: Doc, model: AwbPdfModel, layout: Layout, x: number, y: number, bottom: number, right: number) {
  const h = bottom - y;
  const cols =
    layout === "kope"
      ? [88.4, 218, 246.1, 267.7, 295.9, 317.5, 344.3, 360.7, 389.5, 418.3, 504, right]
      : [80.5, 208.8, 241.5, 263.1, 292.6, 314.8, 340, 366, 394, 420, 496.8, right];
  const edges = [x, ...cols];
  const captions = [
    "To",
    layout === "ack" ? "By First Carrier\nRouting and Destination" : "By First Carrier",
    "to",
    "by",
    "to",
    "by",
    "Currency",
    "CHGS\nCode",
    "WT/VAL",
    "Other",
    "Declared Value\nfor Carriage",
    "Declared Value\nfor Customs",
  ];
  const values = [
    model.to1 ?? "",
    model.by1 ?? "",
    model.to2 ?? "",
    model.by2 ?? "",
    model.to3 ?? "",
    model.by3 ?? "",
    model.currency,
    model.chgsCode,
    "",
    "",
    model.declaredCarriage,
    model.declaredCustoms,
  ];
  for (let i = 0; i < captions.length; i += 1) {
    const left = edges[i];
    const width = edges[i + 1] - left;
    rect(doc, left, y, width, h);
    const capH = i === 1 && layout === "ack" ? 13 : 10.5;
    clipText(doc, left, y, width, capH, () => {
      doc.font("Sans").fontSize(4.4).fillColor("#222").text(captions[i], left + 1.2, y + 0.6, { width: Math.max(4, width - 2), lineGap: -0.6 });
    });
    if (i === 8 || i === 9) {
      const side = i === 8 ? model.wtVal : model.otherPpc;
      doc.font("Sans").fontSize(4.5).text("PPD", left + 1, y + 12, { width: width / 2, lineBreak: false });
      doc.text("COLL", left + width / 2, y + 12, { width: width / 2 - 1, lineBreak: false });
      if (side !== "COLL") mark(doc, left + 2, y + h - 11, layout);
    } else if (values[i]) {
      const size = i === 1 ? 6.2 : i === 7 ? 7 : 8;
      clipText(doc, left, y + 14, width, h - 14, () => {
        doc.font("Sans-Bold").fontSize(size).fillColor("#111").text(values[i], left + 1, y + h - 9, {
          width: Math.max(4, width - 2),
          lineBreak: false,
        });
      });
    }
  }
}

function flightBox(doc: Doc, text: string, x: number, y: number, width: number) {
  if (!text) return;
  doc.font("Sans-Bold");
  let size = 8;
  while (size > 5 && doc.fontSize(size).widthOfString(text) > width - 1) size -= 0.2;
  const height = doc.currentLineHeight(true);
  // Width makes PDFKit wrap onto Handling Information. Draw one line and clip it to the cell.
  clipText(doc, x, y, width, height + 1, () => {
    doc.font("Sans-Bold").fontSize(size).fillColor("#111").text(text, x, y, { lineBreak: false });
  });
}

function drawDestination(doc: Doc, model: AwbPdfModel, layout: Layout, x: number, y: number, bottom: number, right: number, shade: string) {
  const h = bottom - y;
  if (layout === "kope") {
    const cuts = [188.5, 264.4, 317.5, 382.3, right];
    const edges = [x, ...cuts];
    rect(doc, x, y, cuts[0] - x, h, shade);
    label(doc, "Airport of Destination", x, y, cuts[0] - x);
    doc.font("Sans-Bold").fontSize(9).fillColor("#111").text(destinationShown(model.destination, layout), x + 3, y + 12, {
      width: cuts[0] - x - 6,
      lineBreak: false,
    });
    for (let i = 0; i < 3; i += 1) rect(doc, edges[i + 1], y, edges[i + 2] - edges[i + 1], h);
    label(doc, "Flight Date", edges[1], y, edges[2] - edges[1]);
    flightBox(doc, model.flightDate ?? "", edges[1] + 2, y + 13, edges[2] - edges[1] - 4);
    label(doc, "For Carrier use Only", edges[2], y, edges[3] - edges[2]);
    label(doc, "Flight Date", edges[2], y + 11, edges[3] - edges[2]);
    label(doc, "Amount of Insurance", edges[3], y, edges[4] - edges[3]);
    doc.font("Sans-Bold").fontSize(7).text(model.insurance ?? "", edges[3] + 2, y + 13, { width: edges[4] - edges[3] - 4, lineBreak: false });
    rect(doc, edges[4], y, right - edges[4], h);
    doc.font("Sans").fontSize(4.4).fillColor("#111").text(KOPE_INSURANCE, edges[4] + 2, y + 1.5, { width: right - edges[4] - 4, height: h - 2 });
    return;
  }
  const cuts = [179.3, 314.8, 391.4, right];
  rect(doc, x, y, cuts[0] - x, h);
  stroke(doc, 1.6);
  doc.rect(x, y, cuts[0] - x, h).stroke();
  stroke(doc, 0.7);
  label(doc, "Airport of Destination", x, y, cuts[0] - x);
  doc.font("Sans-Bold").fontSize(8).fillColor("#111").text(destinationShown(model.destination, layout), x + 3, y + 12, {
    width: cuts[0] - x - 6,
    lineBreak: false,
  });
  rect(doc, cuts[0], y, cuts[1] - cuts[0], h);
  label(doc, "Requested Flight Date", cuts[0], y, cuts[1] - cuts[0]);
  flightBox(doc, model.flightDate ?? "", cuts[0] + 2, y + 12, cuts[1] - cuts[0] - 4);
  rect(doc, cuts[1], y, cuts[2] - cuts[1], h);
  label(doc, "Amount of Insurance", cuts[1], y, cuts[2] - cuts[1]);
  doc.font("Sans-Bold").fontSize(7).text(model.insurance ?? "", cuts[1] + 2, y + 12, { width: cuts[2] - cuts[1] - 4 });
  rect(doc, cuts[2], y, right - cuts[2], h);
  doc.font("Sans").fontSize(4.6).text(ACK_INSURANCE, cuts[2] + 2, y + 1.5, { width: right - cuts[2] - 4, height: h - 2 });
}

function handlingWithoutNotify(handling: string, notifyParty: string): string {
  const notify = notifyParty.trim();
  if (!notify) return handling;
  // The extractor joins a notify name and address with " / ". The notify line joins them with ", ".
  // Treat slash, comma, and space as the same separator so the handling copy is removed once.
  const flexible = notify
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/[/,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ /g, "[\\s/,]+");
  return handling
    .replace(new RegExp(`notify\\s*[:\\-]?\\s*${flexible}`, "ig"), "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function drawHandling(doc: Doc, model: AwbPdfModel, layout: Layout, x: number, y: number, bottom: number, right: number) {
  const h = bottom - y;
  const sciX = layout === "kope" ? 504 : 492.9;
  rect(doc, x, y, right - x, h);
  label(doc, "Handling Information", x, y, sciX - x);
  const notifyParty = model.notifyParty?.trim() ?? "";
  const handlingText = handlingWithoutNotify(model.handling ?? "", notifyParty).replace(/\n?FREIGHT PREPAID/gi, "").trim();
  let textY = y + 10;
  if (notifyParty) {
    doc.font("Sans").fontSize(6.4).fillColor("#111").text(`Notify  ${notifyParty}`, x + 3, textY, {
      width: sciX - x - 8,
      height: 8,
      lineBreak: false,
    });
    textY += 9;
  }
  doc.font("Sans").fontSize(7.2).fillColor("#111").text(handlingText, x + 3, textY, { width: sciX - x - 8, height: 16, lineBreak: false });
  const legendW = layout === "kope" ? 250 : 230;
  doc.font("Sans").fontSize(5).text(layout === "kope" ? KOPE_EXPORT : ACK_EXPORT, x + 3, y + h - 22, { width: legendW, height: 20 });
  doc.font("Sans-Bold").fontSize(8).text((model.destCountry ?? "").toUpperCase(), x + legendW, y + h - 18, {
    width: 90,
    align: "center",
    lineBreak: false,
  });
  const divW = layout === "kope" ? 78 : 72;
  const divY = y + h - 24;
  rect(doc, sciX - divW, divY, divW, bottom - divY);
  doc.font("Sans").fontSize(5).text(layout === "kope" ? KOPE_DIVERSION : ACK_DIVERSION, sciX - divW + 2, divY + 3, {
    width: divW - 4,
    height: 18,
  });
  stroke(doc, 0.6);
  doc.moveTo(sciX, y).lineTo(sciX, bottom).stroke();
  label(doc, "SCI", sciX, y, right - sciX);
  doc.font("Sans").fontSize(7).text(model.sci ?? "", sciX + 2, y + 12, { width: right - sciX - 4 });
}

function drawRates(doc: Doc, model: AwbPdfModel, layout: Layout, x: number, y: number, bottom: number, right: number, shade: string) {
  const h = bottom - y;
  const edges =
    layout === "kope"
      ? [x, 88.4, 138.8, 147.9, 154.5, 211.4, 217.3, 267.7, 274.9, 332.5, 339.1, 425.5, 432, right]
      : [x, 84.4, 132.2, 143.3, 149.2, 209.5, 215.3, 265.7, 271, 329.9, 335.8, 424.1, 430, right];
  const shaded = new Set([3, 5, 7, 9, 11]);
  const heads = [
    "No. of\nPieces RCP",
    "Gross\nWeight",
    "kg\nlb",
    "",
    "Rate Class\nCommodity\nItem No.",
    "",
    "Chargeable\nWeight",
    "",
    "Rate /\nCharge",
    "",
    "Total",
    "",
    "Nature and Quantity of Goods\n(incl. Dimensions or Volume)",
  ];
  rect(doc, x, y, right - x, h);
  edges.slice(0, -1).forEach((left, index) => {
    const width = edges[index + 1] - left;
    if (shaded.has(index)) doc.save().fillColor(shade).rect(left, y, width, h).fill().restore();
    if (index < edges.length - 2) {
      stroke(doc, 0.45);
      doc.moveTo(edges[index + 1], y).lineTo(edges[index + 1], bottom).stroke();
    }
    if (heads[index]) {
      doc.font("Sans").fontSize(4.7).fillColor("#222").text(heads[index], left + 1, y + 1.5, { width: width - 2, height: 28, lineGap: -0.4 });
    }
  });
  const line = model.lines.find((item) => item.pieces || item.grossWeight || item.nature) ?? model.lines[0];
  const piecesSum = model.lines.reduce((sum, item) => sum + (item.pieces ?? 0), 0);
  const grossSum = model.lines.reduce((sum, item) => sum + (item.grossWeight ?? 0), 0);
  const totalSum = model.lines.reduce((sum, item) => sum + (item.total ?? 0), 0);
  const unitText = line?.kgLb || "K";
  const figures = [
    line?.pieces ? String(line.pieces) : "",
    line?.grossWeight != null ? amount(line.grossWeight) : "",
    line ? unitText : "",
    "",
    [line?.rateClass, line?.commodity].filter(Boolean).join(" "),
    "",
    line?.chargeableWeight != null ? amount(line.chargeableWeight) : "",
    "",
    model.asArranged ? "AS ARRANGED" : line?.rate != null ? amount(line.rate) : "",
    "",
    model.asArranged ? "AS ARRANGED" : line?.total != null ? amount(line.total) : "",
  ];
  figures.forEach((text, index) => {
    if (!text) return;
    const left = edges[index];
    const arranged = text === "AS ARRANGED";
    doc.font("Sans").fontSize(arranged ? 6 : 10).fillColor("#111").text(text, left + 1, y + (arranged ? 34 : 30), {
      width: edges[index + 1] - left - 2,
      lineBreak: false,
    });
  });
  const nature = model.lines.map((item) => item.nature).filter(Boolean).join("\n");
  const natureX = edges[12];
  clipText(doc, natureX + 1, y + 26, right - natureX - 3, h - 30, () => {
    doc.font("Sans").fontSize(7).fillColor("#111").text(nature, natureX + 2, y + 28, { width: right - natureX - 5, lineGap: 1.1 });
  });
  const totalY = bottom - 14;
  stroke(doc, 0.6);
  doc.moveTo(x, totalY - 3).lineTo(natureX, totalY - 3).stroke();
  const totals = [piecesSum ? String(piecesSum) : "", grossSum ? amount(grossSum) : "", grossSum ? unitText : ""];
  totals.forEach((text, index) => {
    if (!text) return;
    doc.font("Sans").fontSize(10).text(text, edges[index] + 1, totalY, { width: edges[index + 1] - edges[index] - 2, lineBreak: false });
  });
  if (model.asArranged) {
    doc.font("Sans").fontSize(6).text("AS ARRANGED", edges[10] + 1, totalY, { width: edges[11] - edges[10] - 2, lineBreak: false });
  } else if (totalSum) {
    doc.font("Sans").fontSize(10).text(amount(totalSum), edges[10] + 1, totalY, { width: edges[11] - edges[10] - 2, lineBreak: false });
  }
}

function drawCharges(
  doc: Doc,
  model: AwbPdfModel,
  layout: Layout,
  charges: ReturnType<typeof settleCharges>,
  x: number,
  right: number,
  shade: string,
) {
  const kope = layout === "kope";
  const rows = kope
    ? [557, 581.2, 605.5, 629, 653.2, 676.8, 701, 724.6, 748.8, 772.4]
    : [555.1, 580.5, 606.1, 627.7, 654.5, 676.8, 702.3, 723, 744.2, 761.2];
  const c1 = kope ? 160.4 : 155.8;
  const c2 = kope ? 260.5 : 257.9;
  const c3 = kope ? 360.7 : 362;
  const showOther = layout === "ack";
  const agentDue = model.otherPpc === "COLL" ? 0 : charges.otherDueAgent;
  const carrierDue = model.otherPpc === "COLL" ? 0 : charges.otherDueCarrier;
  const captions = [
    "",
    "Valuation Charge",
    "Tax",
    "Total Other Charges Due Agent",
    kope ? "Total Other Clients Due Carrier" : "Total Other Charges Due Carrier",
    "",
    "Total Prepaid",
    "Currency Conversion Rates",
    "For Carriers Use only at Destination",
  ];
  const amounts = [
    charges.weightPrepaid ? amount(charges.weightPrepaid) : "",
    shownAmount(charges.valuationPrepaid, layout, false),
    shownAmount(model.otherPpc === "COLL" ? 0 : charges.tax, layout, false),
    shownAmount(agentDue, layout, showOther),
    shownAmount(carrierDue, layout, showOther),
    "",
    shownAmount(charges.totalPrepaid, layout, charges.totalPrepaid !== 0),
    "",
    "",
  ];
  for (let i = 0; i < captions.length; i += 1) {
    const y = rows[i];
    const h = rows[i + 1] - y;
    const rowRight = i === captions.length - 1 ? c3 : c2;
    const fillAll = kope && (i === 5 || i === 7 || i === 8);
    const fillLast = !kope && i === captions.length - 1;
    rect(doc, x, y, c1 - x, h, fillAll ? shade : undefined);
    rect(doc, c1, y, c2 - c1, h, fillAll ? shade : undefined);
    if (i === captions.length - 1) rect(doc, c2, y, c3 - c2, h, shade);
    else if (fillAll) rect(doc, c2, y, 0, h);
    if (fillLast) {
      doc.save().fillColor(shade).rect(c2, y, c3 - c2, h).fill().restore();
      stroke(doc);
      doc.rect(c2, y, c3 - c2, h).stroke();
    }
    if (i === 0) {
      doc.font("Sans").fontSize(5.5).fillColor("#111").text("Prepaid", x + 8, y + 2, { width: c1 - x - 10, lineBreak: false });
      doc.font("Sans").fontSize(5.5).text("Weight Charge", c1 - 8, y + 2, { width: 70, lineBreak: false });
      doc.font("Sans").fontSize(5.5).text("Collect", c2 - 36, y + 2, { width: 34, align: "right", lineBreak: false });
    } else if (i === 7) {
      doc.font("Sans").fontSize(5).fillColor(kope ? "#111" : "#111").text("Currency Conversion Rates", x + 4, y + 3, { width: c1 - x - 6 });
      doc.font("Sans").fontSize(5).text("CC Charges in Dest. Currency", c1 + 2, y + 3, { width: c2 - c1 - 4 });
    } else if (i === 8) {
      doc.font("Sans").fontSize(5).fillColor("#111").text("For Carriers Use only\nat Destination", x + 3, y + 2, { width: c1 - x - 5, lineGap: 0 });
      doc.font("Sans").fontSize(5).text("Charges at\nDestination", c1 + 2, y + 2, { width: c2 - c1 - 4 });
      doc.font("Sans").fontSize(5).text("Total Collect\nCharges", c2 + 2, y + 2, { width: c3 - c2 - 4 });
    } else if (i === 6) {
      doc.font("Sans").fontSize(5.5).fillColor("#111").text("Total Prepaid", x + 6, y + 2, { width: c1 - x - 8, lineBreak: false });
      doc.font("Sans").fontSize(5.5).text("Total Collect", c1 + 4, y + 2, { width: c2 - c1 - 6, lineBreak: false });
    } else if (captions[i]) {
      doc.font("Sans").fontSize(5).fillColor("#111").text(captions[i], x + 4, y + 3, { width: c2 - x - 8, lineBreak: false });
    }
    if (model.asArranged && i === 0) {
      doc.font("Sans").fontSize(7).fillColor("#111").text("AS ARRANGED", x + 4, y + h - 12, { width: c1 - x - 8, align: "center", lineBreak: false });
    } else if (amounts[i]) {
      doc.font("Sans").fontSize(8).fillColor("#111").text(amounts[i], x + 4, y + h - 12, { width: c1 - x - 8, align: "center", lineBreak: false });
    }
    if (i < captions.length - 1) {
      void rowRight;
    }
  }

  const top = rows[0];
  const otherBottom = rows[3];
  const signBottom = kope ? rows[6] : rows[6];
  const execBottom = kope ? rows[8] : rows[8];
  rect(doc, c2, top, right - c2, otherBottom - top);
  label(doc, "Other Charges", c2, top, right - c2);
  doc.font("Sans").fontSize(7).fillColor("#111").text(model.otherChargesText ?? "", c2 + 3, top + 10, {
    width: right - c2 - 6,
    height: otherBottom - top - 12,
  });
  rect(doc, c2, otherBottom, right - c2, signBottom - otherBottom);
  if (kope) {
    doc.font("Sans").fontSize(5).fillColor("#111").text(KOPE_CERT, c2 + 3, otherBottom + 2, { width: right - c2 - 6, height: 28 });
  } else {
    doc.font("Sans").fontSize(5).fillColor("#111").text(ACK_CERT_LEAD, c2 + 3, otherBottom + 2, {
      width: right - c2 - 6,
      continued: true,
    });
    doc.font("Sans-Bold").text(ACK_CERT_BOLD, { width: right - c2 - 6 });
  }
  const signer = model.shipperSignature ?? "";
  doc.font("Sans-Bold").fontSize(7).fillColor("#111").text(signer, c2 + 4, otherBottom + 30, { width: right - c2 - 8, height: 16 });
  const ruleY = signBottom - 14;
  doc.save().dash(1.4, { space: 1.3 }).lineWidth(0.6).moveTo(c2 + 10, ruleY).lineTo(right - 10, ruleY).stroke().restore();
  doc.font("Sans").fontSize(5.5).fillColor("#111").text("Signature of Shipper or his Agent", c2 + 4, ruleY + 2, {
    width: right - c2 - 8,
    align: "center",
    lineBreak: false,
  });
  rect(doc, c2, signBottom, right - c2, execBottom - signBottom);
  doc.font("Sans").fontSize(8).text(model.executedOn ?? "", c2 + 6, signBottom + 4, { width: 90, lineBreak: false });
  doc.font("Sans").fontSize(8).text(model.executedAt ?? "", c2 + 120, signBottom + 4, { width: 90, lineBreak: false });
  const capY = execBottom - 12;
  doc.font("Sans").fontSize(5).text("Executed on (date)", c2 + 6, capY, { width: 80, lineBreak: false });
  doc.font("Sans").fontSize(5).text("at (place)", c2 + 120, capY, { width: 60, lineBreak: false });
  doc.font("Sans").fontSize(5).text("Signature of Issuing Carrier or its Agent", right - 150, capY, { width: 146, lineBreak: false });
  if (!kope) return;
  doc.font("Sans-Bold").fontSize(10).fillColor("#111").text(`${model.prefix}  ${model.serial}`, right - 120, execBottom + 4, {
    width: 116,
    align: "right",
    lineBreak: false,
  });
}
