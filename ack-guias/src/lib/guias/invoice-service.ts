import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { destinationCode } from "@/lib/guias/acct-service";
import { loadCompany } from "@/lib/guias/company";
import { renderGuiaPdf } from "@/lib/guias/files";
import { renderInvoicePdf } from "@/lib/guias/invoice-pdf";
import { dayFrom, dueDateFor, emailsFrom, invoiceLinesFor, totalOf, type InvoiceLineDraft } from "@/lib/guias/invoice-lines";

/** The invoice to the client of an AWB: a draft made when the AWB is issued, reviewed and sent by accounting. */

const COUNTER = "invoice";
/** The first invoice of ACK Guías is number 3000. */
export const FIRST_INVOICE_NUMBER = 3000;
export const TERMS = "Due on receipt";
export const DUE_DAYS = 10;

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const isoDay = (value: Date) => value.toISOString().slice(0, 10);

/** Today in New York, as YYYY-MM-DD. */
export function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

/** The next invoice number. The counter moves in one statement, so two invoices never take the same number. */
export async function nextInvoiceNumber(): Promise<number> {
  const counter = await prisma.invoiceCounter.upsert({
    where: { id: COUNTER },
    update: { lastNumber: { increment: 1 } },
    create: { id: COUNTER, lastNumber: FIRST_INVOICE_NUMBER },
  });
  return counter.lastNumber;
}

export const linesData = (lines: InvoiceLineDraft[]) =>
  lines.map((line, index) => ({
    sortOrder: index,
    serviceDate: line.serviceDate ? day(line.serviceDate) : null,
    product: line.product,
    description: line.description,
    qty: line.qty,
    rate: line.rate,
    amount: line.amount,
  }));

/**
 * Makes the draft invoice of an AWB from its accounting row, once. It holds only the charges that are not zero. What
 * could not be filled in (the address, the emails) is left for accounting to complete before sending.
 */
export async function createInvoiceForGuia(guiaId: string): Promise<{ created: boolean; number?: number; note?: string }> {
  const shipment = await prisma.acctShipment.findUnique({ where: { guiaId } });
  if (!shipment) return { created: false, note: "The AWB has no accounting row yet." };
  const already = await prisma.invoice.findUnique({ where: { shipmentId: shipment.id }, select: { number: true } });
  if (already) return { created: false, number: already.number };

  const [guia, client, pickup] = await Promise.all([
    prisma.airWaybillDocument.findUnique({ where: { id: guiaId }, select: { departure: true, guiaClientId: true } }),
    prisma.acctClient.findUnique({ where: { name: shipment.client } }),
    prisma.pickupRequest.findFirst({ where: { guiaId }, orderBy: { createdAt: "desc" }, select: { pickupDate: true, shipperName: true, shipperAddress: true } }),
  ]);
  const date = isoDay(shipment.date);
  const pickupDescription = pickup ? [pickup.shipperName, pickup.shipperAddress].map((part) => (part ?? "").replace(/\s+/g, " ").trim()).filter(Boolean).join(", ") : "";
  const lines = invoiceLinesFor(shipment, { origin: destinationCode(guia?.departure) || "MIA", date, pickupDate: dayFrom(pickup?.pickupDate), pickupDescription });
  if (lines.length === 0) return { created: false, note: "Every charge of the shipment is $0, so there is nothing to invoice." };

  const invoiceDate = today();
  const number = await nextInvoiceNumber();
  const notes: string[] = [];
  if (!client?.billToAddress?.trim()) notes.push("The address of the client is not set in Clients & team.");
  if (emailsFrom(client?.billingEmails).length === 0) notes.push("The client has no billing email in Clients & team.");
  await prisma.invoice.create({
    data: {
      number,
      shipmentId: shipment.id,
      guiaId,
      guiaClientId: guia?.guiaClientId ?? null,
      client: shipment.client,
      billToName: client?.billToName?.trim() || shipment.client,
      billToAddress: client?.billToAddress?.trim() || null,
      emails: client?.billingEmails?.trim() || null,
      awb: shipment.awb,
      invoiceDate: day(invoiceDate),
      dueDate: day(dueDateFor(invoiceDate, DUE_DAYS)),
      terms: TERMS,
      total: totalOf(lines),
      note: notes.length ? notes.join(" ") : null,
      lines: { create: linesData(lines) },
    },
  });
  return { created: true, number };
}

export type InvoiceWithLines = Prisma.InvoiceGetPayload<{ include: { lines: true } }>;

/** The text under "Ways to pay". Until the bank details are set it says BANK, as the old invoices did. */
export const waysToPay = () => process.env.INVOICE_WAYS_TO_PAY?.trim() || "BANK";

/** The PDF of an invoice, the one that is emailed and the one the client opens. */
export async function invoicePdf(invoice: InvoiceWithLines): Promise<Buffer> {
  const company = await loadCompany("ack");
  const lines = [...invoice.lines].sort((a, b) => a.sortOrder - b.sortOrder);
  return renderInvoicePdf(
    {
      number: invoice.number,
      billToName: invoice.billToName,
      billToAddress: invoice.billToAddress ?? "",
      invoiceDate: isoDay(invoice.invoiceDate),
      dueDate: isoDay(invoice.dueDate),
      terms: invoice.terms,
      lines: lines.map((line) => ({ serviceDate: line.serviceDate ? isoDay(line.serviceDate) : null, product: line.product, description: line.description, qty: line.qty, rate: line.rate, amount: line.amount })),
      total: invoice.total,
      waysToPay: waysToPay(),
    },
    company,
  );
}

/** The customer copy of the AWB of an invoice, the one that goes with the invoice. Null when the AWB is not issued. */
export async function guiaCopyPdf(guiaId: string, viewer: { email: string; name?: string | null }): Promise<{ pdf: Buffer; awb: string } | null> {
  const document = await prisma.airWaybillDocument.findFirst({
    where: { id: guiaId, product: "guia", agentKey: "ack", status: "issued" },
    include: { lines: { orderBy: { sortOrder: "asc" } }, agent: true, guiaClient: true, _count: { select: { houses: true } } },
  });
  if (!document) return null;
  const company = await loadCompany("ack");
  return { pdf: await renderGuiaPdf("awb", document, company, { email: viewer.email, name: viewer.name, customerCopy: true }), awb: document.awb };
}
