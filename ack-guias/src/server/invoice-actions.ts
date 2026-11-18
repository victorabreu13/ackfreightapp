"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canViewFinance } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { amountOf, dayFrom, dueDateFor, emailsFrom, totalOf, type InvoiceLineDraft } from "@/lib/guias/invoice-lines";
import { DUE_DAYS, guiaCopyPdf, invoicePdf, linesData, TERMS } from "@/lib/guias/invoice-service";
import { sendMail } from "@/lib/guias/mailer";

function text(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

async function requireFinance() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canViewFinance(user)) redirect("/guias?error=The%20accounting%20is%20only%20for%20the%20accounting");
  return user;
}

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

function back(id: string, message: string, kind: "notice" | "error" = "notice"): never {
  redirect(`/guias/invoices/${id}?${kind}=${encodeURIComponent(message)}`);
}

/** A number typed in a box: dollars and commas are allowed. Null when it is not a number. */
function numberFrom(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The lines of the form. A row with nothing in it is dropped; a row with an amount that is not a number stops the save. */
function linesFromForm(formData: FormData): { lines: InvoiceLineDraft[]; error: string | null } {
  const products = formData.getAll("product").map(String);
  const descriptions = formData.getAll("description").map(String);
  const dates = formData.getAll("serviceDate").map(String);
  const quantities = formData.getAll("qty").map(String);
  const rates = formData.getAll("rate").map(String);
  const lines: InvoiceLineDraft[] = [];
  for (let index = 0; index < products.length; index += 1) {
    const product = products[index].trim();
    const description = (descriptions[index] ?? "").trim();
    const rateText = (rates[index] ?? "").trim();
    if (!product && !description && !rateText) continue;
    if (!product) return { lines, error: `Line ${index + 1} has no product or service.` };
    const qty = numberFrom(quantities[index] ?? "") ?? 1;
    const rate = numberFrom(rateText);
    if (rate == null) return { lines, error: `Line ${index + 1} (${product}) has no valid rate.` };
    const serviceText = (dates[index] ?? "").trim();
    const serviceDate = serviceText ? dayFrom(serviceText) : null;
    if (serviceText && !serviceDate) return { lines, error: `Line ${index + 1} (${product}) has a date that is not valid.` };
    lines.push({ serviceDate, product: product.toUpperCase(), description, qty, rate, amount: amountOf(qty, rate) });
  }
  return { lines, error: null };
}

/** Saves what the form holds into a draft. Returns where to go with an error, or null when it was saved. */
async function saveDraft(id: string, formData: FormData): Promise<string | null> {
  const invoice = await prisma.invoice.findUnique({ where: { id }, select: { status: true } });
  if (!invoice) return "That invoice was not found.";
  if (invoice.status !== "draft") return "That invoice was already sent, so it can no longer be edited.";
  const billToName = text(formData.get("billToName"));
  if (!billToName) return "Type who the invoice is billed to.";
  const invoiceDate = dayFrom(text(formData.get("invoiceDate")));
  if (!invoiceDate) return "The invoice date is not valid.";
  const dueText = text(formData.get("dueDate"));
  const dueDate = dueText ? dayFrom(dueText) : dueDateFor(invoiceDate, DUE_DAYS);
  if (!dueDate) return "The due date is not valid.";
  const { lines, error } = linesFromForm(formData);
  if (error) return error;
  if (lines.length === 0) return "The invoice has no lines.";
  const emails = emailsFrom(text(formData.get("emails")));
  await prisma.$transaction([
    prisma.invoiceLine.deleteMany({ where: { invoiceId: id } }),
    prisma.invoice.update({
      where: { id },
      data: {
        billToName,
        billToAddress: text(formData.get("billToAddress")) || null,
        emails: emails.join("\n") || null,
        invoiceDate: day(invoiceDate),
        dueDate: day(dueDate),
        terms: text(formData.get("terms")) || TERMS,
        total: totalOf(lines),
        note: text(formData.get("note")) || null,
        lines: { create: linesData(lines) },
      },
    }),
  ]);
  return null;
}

/** Saves the draft the accounting is reviewing. */
export async function saveInvoice(formData: FormData) {
  await requireFinance();
  const id = text(formData.get("id"));
  const problem = await saveDraft(id, formData);
  if (problem) back(id, `${problem} Nothing was saved.`, "error");
  revalidatePath("/guias/invoices");
  back(id, "Invoice saved.");
}

const FROM = () => process.env.INVOICE_MAIL_FROM?.trim() || "ACK TEAM LLC <billing@ackfreight.com>";
const REPLY_TO = () => process.env.INVOICE_REPLY_TO?.trim() || "billing@ackfreight.com";

/** Emails the invoice, with its PDF and the copy of the guía, to the client. Returns an error text, or null when it went. */
async function deliver(id: string, viewer: { email: string; name?: string | null }): Promise<string | null> {
  const invoice = await prisma.invoice.findUnique({ where: { id }, include: { lines: true } });
  if (!invoice) return "That invoice was not found.";
  const recipients = emailsFrom(invoice.emails);
  if (recipients.length === 0) return "Add at least one email to send the invoice to.";
  const attachments = [{ filename: `Invoice ${invoice.number} from ACK TEAM LLC.pdf`, content: await invoicePdf(invoice), contentType: "application/pdf" }];
  if (invoice.guiaId) {
    const copy = await guiaCopyPdf(invoice.guiaId, viewer);
    if (copy) attachments.push({ filename: `${copy.awb} - AWB.pdf`, content: copy.pdf, contentType: "application/pdf" });
  }
  const due = invoice.dueDate.toISOString().slice(0, 10).split("-");
  const dueText = `${due[1]}/${due[2]}/${due[0]}`;
  const total = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(invoice.total);
  const awb = invoice.awb ? ` - AWB ${invoice.awb}` : "";
  const sent = await sendMail({
    to: recipients,
    subject: `Invoice ${invoice.number} from ACK TEAM LLC${awb}`,
    from: FROM(),
    replyTo: REPLY_TO(),
    attachments,
    text: [
      `Hello ${invoice.billToName},`,
      "",
      `Attached is invoice ${invoice.number} for ${total}, due ${dueText}${invoice.awb ? `, with the copy of the air waybill ${invoice.awb}` : ""}.`,
      "You can also see it in your ACK Guías account.",
      "",
      `Hola, adjuntamos la factura ${invoice.number} por ${total}, con vencimiento ${dueText}${invoice.awb ? `, y la copia de la guía aérea ${invoice.awb}` : ""}. También puede verla en su cuenta de ACK Guías.`,
      "",
      "Thank you / Gracias,",
      "ACK TEAM LLC",
      REPLY_TO(),
    ].join("\n"),
  });
  if (!sent.ok) return `The email was not sent: ${sent.error}`;
  await prisma.invoice.update({ where: { id }, data: { status: "sent", sentAt: new Date(), sentTo: recipients.join(", ") } });
  return null;
}

/** Saves the draft and sends it. From then on the client sees it in its portal and the invoice is locked. */
export async function sendInvoice(formData: FormData) {
  const user = await requireFinance();
  const id = text(formData.get("id"));
  const problem = await saveDraft(id, formData);
  if (problem) back(id, `${problem} Nothing was sent.`, "error");
  const failed = await deliver(id, { email: user.email, name: user.name });
  revalidatePath("/guias/invoices");
  revalidatePath("/portal");
  if (failed) back(id, `${failed} The draft was saved.`, "error");
  const sent = await prisma.invoice.findUnique({ where: { id }, select: { sentTo: true } });
  back(id, `Invoice sent to ${sent?.sentTo ?? "the client"}. It now shows in the client portal.`);
}

/** Sends a sent invoice again, as it is, to the emails it was made for. */
export async function resendInvoice(formData: FormData) {
  const user = await requireFinance();
  const id = text(formData.get("id"));
  const found = await prisma.invoice.findUnique({ where: { id }, select: { status: true } });
  if (!found) back(id, "That invoice was not found.", "error");
  if (found.status !== "sent") back(id, "Only a sent invoice can be sent again.", "error");
  const failed = await deliver(id, { email: user.email, name: user.name });
  revalidatePath("/guias/invoices");
  if (failed) back(id, failed, "error");
  back(id, "Invoice sent again.");
}

/** Marks that the client paid the invoice, which is the same as paying the invoice of its shipment in Shipments. */
export async function setInvoicePaid(formData: FormData) {
  await requireFinance();
  const id = text(formData.get("id"));
  const invoice = await prisma.invoice.findUnique({ where: { id }, select: { shipmentId: true } });
  if (!invoice) back(id, "That invoice was not found.", "error");
  if (!invoice.shipmentId) back(id, "This invoice has no shipment to mark.", "error");
  const shipment = await prisma.acctShipment.findUnique({ where: { id: invoice.shipmentId }, select: { clientPaid: true } });
  if (!shipment) back(id, "The shipment of this invoice was not found.", "error");
  const paid = !shipment.clientPaid;
  await prisma.acctShipment.update({ where: { id: invoice.shipmentId }, data: { clientPaid: paid, clientPaidDate: paid ? new Date() : null } });
  revalidatePath("/guias/invoices");
  revalidatePath("/guias/accounting");
  revalidatePath("/guias/commissions");
  back(id, paid ? "Marked as paid by the client." : "Marked as open.");
}

/** A draft that is not going to be sent is deleted. A sent invoice stays, since the client has it. */
export async function deleteDraftInvoice(formData: FormData) {
  await requireFinance();
  const id = text(formData.get("id"));
  const invoice = await prisma.invoice.findUnique({ where: { id }, select: { status: true, number: true } });
  if (!invoice) redirect("/guias/invoices?error=That%20invoice%20was%20not%20found");
  if (invoice.status !== "draft") back(id, "A sent invoice cannot be deleted.", "error");
  await prisma.invoice.delete({ where: { id } });
  revalidatePath("/guias/invoices");
  redirect(`/guias/invoices?notice=${encodeURIComponent(`Draft ${invoice.number} deleted.`)}`);
}
