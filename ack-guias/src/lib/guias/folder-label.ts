import PDFDocument from "pdfkit";
import { codeForPlace } from "@/lib/awb/airports";
import type { CompanyView } from "@/lib/guias/company-profile";
import { plain } from "@/lib/guias/corte";
import type { GuiaPrintOptions, GuiaRecord } from "@/lib/guias/files";

/** Portrait 4 x 6 in label for the shipment folder. */
const WIDTH = 4 * 72;
const HEIGHT = 6 * 72;
const SIDE_MARGIN = 14;

/** "MIA-GUA": the airport of departure and the airport of destination. */
export function folderRoute(document: { departure?: string | null; destination?: string | null }): string {
  const origin = codeForPlace(plain(document.departure) || "MIA") || "MIA";
  const destination = codeForPlace(plain(document.destination));
  return destination ? `${origin}-${destination}` : origin;
}

/**
 * The folder label: MAWB, the air waybill number and the route, stacked and centered in big bold letters.
 * It is printed on its own, not with the document pack.
 */
export function renderFolderLabel(document: GuiaRecord, _company: CompanyView, _options: GuiaPrintOptions): Promise<Buffer> {
  const awb = plain(document.awb);
  if (!awb) {
    return Promise.reject(Object.assign(new Error("Issue the guía, or enter its AWB number, before printing the folder label."), { status: 409 }));
  }
  const route = folderRoute(document);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [WIDTH, HEIGHT], margin: 0 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      doc.info.Title = `FOLDER LABEL ${awb}`;
      doc.font("Helvetica-Bold");
      // One size for the three lines, as large as lets the AWB number fill the width of the label.
      const available = WIDTH - 2 * SIDE_MARGIN;
      const size = Math.min(60, (available / doc.fontSize(100).widthOfString(awb)) * 100);
      const lines = ["MAWB", awb, route];
      const lead = size * 1.55;
      let y = (HEIGHT - lead * (lines.length - 1) - size * 0.72) / 2;
      doc.fillColor("#000000").fontSize(size);
      for (const line of lines) {
        const fits = Math.min(size, (available / doc.fontSize(100).widthOfString(line)) * 100);
        doc.fontSize(fits).text(line, 0, y, { width: WIDTH, align: "center", lineBreak: false });
        y += lead;
      }
    } catch (error) {
      reject(error);
      return;
    }
    doc.end();
  });
}
