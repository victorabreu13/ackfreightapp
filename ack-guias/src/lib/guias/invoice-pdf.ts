import PDFDocument from "pdfkit";
import type { CompanyView } from "@/lib/guias/company-profile";
import { companyLogo } from "@/lib/guias/corte";

/** The invoice to a client as a PDF, laid out like the QuickBooks invoice ACK sent before. */

export type InvoicePdfLine = {
  serviceDate: string | null;
  product: string;
  description: string;
  qty: number;
  rate: number;
  amount: number;
};

export type InvoicePdfInput = {
  number: number;
  billToName: string;
  billToAddress: string;
  invoiceDate: string;
  dueDate: string;
  terms: string;
  lines: InvoicePdfLine[];
  total: number;
  /** How the client pays, printed under Ways to pay. */
  waysToPay?: string;
};

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

/** 2026-11-04 as 11/04/2026. */
export function usDate(value: string | null | undefined): string {
  const match = (value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : "";
}

/** A quantity without trailing zeros: 1, 278.4. */
function quantity(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(value);
}

/** What the invoice prints at the top. It is the billing office, not the office of the AWB. */
export const INVOICE_LETTERHEAD = {
  name: "ACK TEAM LLC",
  addressLines: ["6450 NW 97th Ave Unit 130", "Doral FL 33178-1770"],
  contactLine: ["andres.alvarado@ackfreight.com", "+1 (305) 915-3461"],
  website: "https://www.ackfreight.com/",
};

export async function renderInvoicePdf(invoice: InvoicePdfInput, company: CompanyView): Promise<Buffer> {
  const logo = companyLogo(company);
  const { name: companyName, addressLines, contactLine, website } = INVOICE_LETTERHEAD;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 0 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      doc.info.Title = `Invoice ${invoice.number}`;
      const L = 44;
      const R = 568;
      const INK = "#111827";
      const MUTED = "#6b7280";
      const LINE = "#d1d5db";
      const write = (value: string, x: number, y: number, options: { size?: number; font?: string; color?: string; width?: number; align?: "left" | "right" | "center" } = {}) => {
        doc.font(options.font ?? "Helvetica").fontSize(options.size ?? 10).fillColor(options.color ?? INK).text(value, x, y, { width: options.width, align: options.align, lineBreak: options.width !== undefined });
      };

      // Header: the company and the logo on the left, the title on the right.
      try {
        doc.image(logo, L, 36, { fit: [150, 56] });
      } catch {
        /* The invoice still prints without the logo. */
      }
      write("INVOICE", R - 220, 40, { size: 26, font: "Helvetica-Bold", width: 220, align: "right" });
      let y = 104;
      write(companyName, L, y, { size: 11, font: "Helvetica-Bold" });
      y += 15;
      for (const line of addressLines) {
        write(line, L, y, { size: 9, color: MUTED });
        y += 12;
      }
      if (contactLine.length) {
        write(contactLine.join("  ·  "), L, y, { size: 9, color: MUTED });
        y += 12;
      }
      if (website) {
        write(website, L, y, { size: 9, color: MUTED });
        y += 12;
      }

      // Bill to on the left and the invoice details on the right.
      y = Math.max(y + 18, 190);
      const top = y;
      write("Bill to", L, y, { size: 10, font: "Helvetica-Bold" });
      y += 15;
      write(invoice.billToName, L, y, { size: 10, font: "Helvetica-Bold" });
      y += 14;
      const billTo = invoice.billToAddress.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      for (const line of billTo) {
        write(line, L, y, { size: 9.5 });
        y += 12.5;
      }
      let detailY = top;
      write("Invoice details", 340, detailY, { size: 10, font: "Helvetica-Bold" });
      detailY += 16;
      const details: Array<[string, string]> = [
        ["Invoice no.", String(invoice.number)],
        ["Terms", invoice.terms],
        ["Invoice date", usDate(invoice.invoiceDate)],
        ["Due date", usDate(invoice.dueDate)],
      ];
      for (const [label, value] of details) {
        write(label, 340, detailY, { size: 9.5, color: MUTED });
        write(value, 430, detailY, { size: 9.5, width: R - 430, align: "right" });
        detailY += 14;
      }
      y = Math.max(y, detailY) + 22;

      // The table.
      const columns = { n: L, date: L + 22, product: L + 90, description: L + 196, qty: R - 150, rate: R - 100, amount: R - 50 };
      const header = () => {
        doc.save().rect(L, y, R - L, 22).fill("#f3f4f6").restore();
        const at = y + 7;
        write("#", columns.n + 4, at, { size: 8.5, font: "Helvetica-Bold" });
        write("Service Date", columns.date, at, { size: 8.5, font: "Helvetica-Bold" });
        write("Product/service", columns.product, at, { size: 8.5, font: "Helvetica-Bold" });
        write("Description/Seal", columns.description, at, { size: 8.5, font: "Helvetica-Bold" });
        write("Qty", columns.qty, at, { size: 8.5, font: "Helvetica-Bold", width: 46, align: "right" });
        write("Rate", columns.rate, at, { size: 8.5, font: "Helvetica-Bold", width: 46, align: "right" });
        write("Amount", columns.amount, at, { size: 8.5, font: "Helvetica-Bold", width: 50, align: "right" });
        y += 22;
      };
      header();
      invoice.lines.forEach((line, index) => {
        const descriptionWidth = columns.qty - columns.description - 8;
        const descriptionHeight = line.description ? doc.font("Helvetica").fontSize(9).heightOfString(line.description, { width: descriptionWidth }) : 0;
        const productHeight = doc.font("Helvetica-Bold").fontSize(9).heightOfString(line.product, { width: columns.description - columns.product - 8 });
        const rowHeight = Math.max(descriptionHeight, productHeight, 12) + 14;
        if (y + rowHeight > 700) {
          doc.addPage({ size: "LETTER", margin: 0 });
          y = 44;
          header();
        }
        const at = y + 7;
        write(String(index + 1), columns.n + 4, at, { size: 9 });
        write(usDate(line.serviceDate), columns.date, at, { size: 9 });
        write(line.product, columns.product, at, { size: 9, font: "Helvetica-Bold", width: columns.description - columns.product - 8 });
        if (line.description) write(line.description, columns.description, at, { size: 9, width: descriptionWidth });
        write(quantity(line.qty), columns.qty, at, { size: 9, width: 46, align: "right" });
        write(money(line.rate), columns.rate - 6, at, { size: 9, width: 52, align: "right" });
        write(money(line.amount), columns.amount - 6, at, { size: 9, width: 56, align: "right" });
        y += rowHeight;
        doc.save().moveTo(L, y).lineTo(R, y).lineWidth(0.5).strokeColor(LINE).stroke().restore();
      });

      // The total and the ways to pay.
      y += 16;
      if (y > 660) {
        doc.addPage({ size: "LETTER", margin: 0 });
        y = 44;
      }
      write("Ways to pay", L, y, { size: 10, font: "Helvetica-Bold" });
      write((invoice.waysToPay ?? "BANK").trim() || "BANK", L, y + 15, { size: 9.5, width: 280 });
      write("Total", R - 220, y, { size: 12, font: "Helvetica-Bold", width: 90 });
      write(money(invoice.total), R - 130, y - 1, { size: 15, font: "Helvetica-Bold", width: 130, align: "right" });
      write(`Due ${usDate(invoice.dueDate)}`, R - 220, y + 22, { size: 9, color: MUTED, width: 220, align: "right" });
    } catch (error) {
      reject(error);
      return;
    }
    doc.end();
  });
}
