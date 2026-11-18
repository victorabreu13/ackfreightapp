import PDFDocument from "pdfkit";
import { KOPE_LOGO_PNG } from "@/lib/sheets/kope-logo";
import {
  formatFlightDate,
  KOPE_CCSF_ALTERNATE_DSA,
  KOPE_CCSF_ALTERNATE_FACILITY,
  placeName,
  sheetDate,
  type Identity,
} from "@/lib/sheets/layout";

/** Handmade Guías letters. They do not call or patch the original sheet renderers. */
export type ExtraLetter = {
  agentKey: string;
  identity: Identity;
  logo: Buffer | null;
  legAwb: string;
  destination: string;
  shipperName: string;
  flightDate: string;
  trucker: string;
  seal: string;
  driver: string;
  signerName: string;
  documentDate: Date;
};

export { KOPE_LOGO_PNG };

function pdf(size: [number, number] | "LETTER", draw: (doc: PDFKit.PDFDocument) => void | Promise<void>, margin = 28): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size, margin });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    Promise.resolve(draw(doc))
      .then(() => doc.end())
      .catch(reject);
  });
}

function underline(doc: PDFKit.PDFDocument, x: number, y: number, width: number) {
  doc.save().moveTo(x, y).lineTo(x + width, y).lineWidth(0.6).strokeColor("#000000").stroke().restore();
}

function logoAt(doc: PDFKit.PDFDocument, loaded: ExtraLetter, x: number, y: number, width: number) {
  if (!loaded.logo || loaded.logo.length === 0) return;
  try {
    doc.image(loaded.logo, x, y, { width });
  } catch {
    /* The certification still prints. */
  }
}

export async function tsaUnknownLetter(loaded: ExtraLetter): Promise<Buffer> {
  const id = loaded.identity;
  const date = sheetDate(loaded.documentDate);
  const departure = formatFlightDate(loaded.flightDate, "short");
  return pdf("LETTER", (doc) => {
    logoAt(doc, loaded, 219, 28, 167);
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#000000").text("INDIRECT AIR CARRIER WRITTEN CERTIFICATION FOR AN ALL", 40, 124, { width: 532, align: "center" });
    doc.text("CARGO AIRCRAFT ONLY", 40, 146, { width: 532, align: "center" });
    doc.font("Helvetica").fontSize(11).text(
      `${id.name} is in compliance with its TSA-approved security program and all applicable security directives. Our number assigned by TSA is ${id.tsaNumber}. This shipment contains cargo originating from an UNKNOWN SHIPPER not exempted by TSA. This shipment must be transported ONLY ON\nALL-CARGO AIRCRAFT. The individual whose name appears below certifies that he or she is an employee or authorized representative of ${id.name} and understands that any fraudulent or false statement made in connection with this certification may subject this individual and ${id.name} to both civil penalties under 49 CFR Part 1,540.103(b) and fines and/or imprisonment of not more than 5 years under 18 U.S.C. 1001.`,
      44,
      186,
      { width: 524, align: "justify", lineGap: 1 },
    );
    doc.font("Helvetica").fontSize(10).text(`Printed Name and Signature of IAC Employee: ${loaded.signerName}`, 42, 360, { width: 530, lineBreak: false });
    underline(doc, 268, 372, 200);
    doc.text(`Name of IAC or Authorized Agent's employee tendering cargo: ${loaded.trucker}`, 42, 392, { width: 530, lineBreak: false });
    doc.text("Origin: Miami", 42, 424, { width: 220, lineBreak: false });
    doc.text(`Destination: ${placeName(loaded.destination)}`, 282, 424, { width: 280, lineBreak: false });
    doc.text(`Date: ${date}`, 42, 456, { width: 200, lineBreak: false });
    if (departure) doc.text(`Departure Date: ${departure}`, 220, 456, { width: 280, lineBreak: false });
    doc.text(`Master Airway Bill No.: ${loaded.legAwb}`, 42, 488, { width: 400, lineBreak: false });
    doc.text("Number of items less than 16 oz.: 0", 42, 548, { width: 400, lineBreak: false });
    doc.fontSize(11).text(
      "This records contains sensitive information that is controlled under 49 CFR parts 15 and 1520 and No. part of this training may be disclosure to persons without a 'need to know', as defined in 49 CFR parts 15 and 1520, except with written permission of the Administrator of the Transportation Security Administration or the Secretary of Transportation. Unauthorized release may result in Civil penalty or other action. For U.S. government agencies, public disclosure is governed by U.S.C. 552 and 49 CFR part and 1520.",
      27,
      586,
      { width: 558, align: "justify", lineGap: 1 },
    );
    doc.font("Helvetica-Bold").fontSize(12).text(id.name, 48, 686, { width: 516, align: "center", lineBreak: false });
    doc.font("Helvetica").fontSize(9).text(id.letterFooter, 36, 712, { width: 540, align: "center" });
  }, 18);
}

function letterBodyName(name: string): string {
  return name.endsWith(".") ? name.slice(0, -1) : name;
}

export async function ccsfAlternateLetter(loaded: ExtraLetter): Promise<Buffer> {
  const id = loaded.identity;
  const legal = letterBodyName(id.name);
  const date = sheetDate(loaded.documentDate);
  const kope = loaded.agentKey !== "ack";
  const facility = kope ? KOPE_CCSF_ALTERNATE_FACILITY : id.facility;
  const ccsfNumber = kope ? `${id.ccsfNumber}, ${KOPE_CCSF_ALTERNATE_DSA}` : id.ccsfNumber;
  return pdf("LETTER", (doc) => {
    logoAt(doc, loaded, 232, 15, 149);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#000000").text("CCSF CERTIFICATE OF TENDER TO A CARGO CARRIER", 40, 100, { width: 532, align: "center" });
    doc.font("Helvetica").fontSize(10).text("Date:", 20, 132, { lineBreak: false });
    doc.text(date, 64, 132, { lineBreak: false });
    underline(doc, 50, 144, 120);
    doc.text("Air waybill, bill of lading, company inventory, or other internal shipping document number:", 20, 156, { width: 572 });
    doc.text(loaded.legAwb, 61, 176, { lineBreak: false });
    underline(doc, 20, 188, 160);
    const body = { width: 574, align: "justify" as const, lineGap: -1 };
    doc.text(
      `${legal} is in compliance with its TSA-approved security program and all appropriate security directive(s). Our number assigned by the TSA is ${id.tsaNumber}. All cargo tendered in conjunction with this certificate was either: 1) accepted from a Known Shipper or an Unknown Shipper in accordance with TSA requirements specified in the Indirect Air Carrier Standard Security Program, or 2) accepted under transfer from another direct or indirect air carrier operating under a TSA approved or accepted security program. This IAC is also a TSA-certified cargo screening facility (CCSF) and is in compliance with the TSA-approved certified cargo screening standard security program (CCSSSP). Our CCSF number assigned by TSA is ${ccsfNumber}, which is applicable only to this facility, located at ${facility}.`,
      19,
      198,
      body,
    );
    doc.text(
      `All cargo has been screened and transported in accordance with the CCSSSP requirements. A chain of custody method has been applied, and the cargo is being tendered with the chain of custody method intact. The individual whose name appears below certifies that he or she is an employee or authorized representative of ${legal} and understands that any fraudulent or false statement made in connection with this certification may subject ${legal} and the individual to both (1) civil penalties under 49 CFR 1540.103(b) and (2) fines and/or imprisonment of not more than five years under 18 U.S.C. 1001. The cargo associated with this Master Air Waybill was screened at 100 percent.`,
      19,
      doc.y + 8,
      body,
    );
    doc.text("Check the applicable box below:", 19, 386, { width: 560 });
    doc.text("(X) Locked vehicle", 19, 410, { width: 560 });
    doc.text(`${loaded.seal ? "(X)" : "( )"} Tamper evident number seal. If used, write the number of the seal associated with this cargo shipment below:`, 19, 430, { width: 574 });
    doc.text(`SEAL # ${loaded.seal}`, 19, 452, { lineBreak: false });
    underline(doc, 58, 464, 220);
    doc.text("If an escort is used, write the name of the escort associated with this cargo shipment below:", 20, 476, { width: 560 });
    underline(doc, 20, 500, 280);
    doc.text("Name and signature of employee or authorized representative attesting to the above certification:", 19, 522, { width: 560 });
    doc.text(loaded.signerName, 24, 542, { lineBreak: false });
    underline(doc, 20, 554, 280);
    doc.text("Name of company and name of driver delivering the cargo shipment:", 19, 568, { width: 560 });
    const delivery = [loaded.trucker, loaded.driver].filter(Boolean).join(" | ");
    if (delivery) doc.text(delivery, 24, 584, { lineBreak: false });
    underline(doc, 20, 596, 250);
    underline(doc, 290, 596, 250);
    doc.text(
      "Print name of the accepting entity's employee or authorized representative who is verifying that the seal number written above matches the seal number on the conveyance OR is verifying the government issued identification of the escort and ensuring the name matches the name written above OR is verifying that the cargo arrived in a locked conveyance. Accepting Employee or Authorized Representative:",
      19,
      612,
      { width: 574, lineGap: 0 },
    );
    underline(doc, 19, 662, 280);
    doc.text(`${id.name} | ${id.ccsfFooter}`, 40, 736, { width: 532, align: "center" });
  }, 18);
}
