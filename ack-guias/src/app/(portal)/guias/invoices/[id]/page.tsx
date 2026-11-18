import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { canViewFinance } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { usd } from "@/lib/guias/acct-format";
import { emailsFrom } from "@/lib/guias/invoice-lines";
import { deleteDraftInvoice, resendInvoice, saveInvoice, sendInvoice, setInvoicePaid } from "@/server/invoice-actions";

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

const day = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : "");
/** How many empty rows are offered to add a charge. */
const SPARE_ROWS = 3;

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!canViewFinance(user)) redirect("/guias?error=The%20accounting%20is%20only%20for%20the%20accounting");
  const { id } = await params;
  const query = await searchParams;
  const notice = one(query, "notice");
  const error = one(query, "error");
  const invoice = await prisma.invoice.findUnique({ where: { id }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
  if (!invoice) notFound();
  const shipment = invoice.shipmentId ? await prisma.acctShipment.findUnique({ where: { id: invoice.shipmentId }, select: { clientPaid: true } }) : null;
  const draft = invoice.status === "draft";
  const recipients = emailsFrom(invoice.emails);
  const rows = draft ? [...invoice.lines, ...Array.from({ length: SPARE_ROWS }, () => null)] : invoice.lines;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <GuiaEyebrow />
          <h1 className="font-display text-4xl">Invoice {invoice.number}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {invoice.client}
            {invoice.awb ? ` · AWB ${invoice.awb}` : ""} ·{" "}
            <span className={`rounded-full px-2 py-0.5 text-xs ${draft ? "bg-[#fff1e4] text-stuck" : "bg-secondary"}`}>{draft ? "Draft" : `Sent ${invoice.sentAt?.toLocaleDateString("en-US", { timeZone: "America/New_York" }) ?? ""}`}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/api/guias/invoices/${invoice.id}`} target="_blank" rel="noreferrer" className="rounded-md border border-border px-3 py-2 text-sm">
            View PDF
          </a>
          <Link href="/guias/invoices" className="text-sm underline-offset-2 hover:underline">
            All invoices
          </Link>
        </div>
      </div>
      {notice ? <p className="rounded-md bg-secondary px-3 py-2 text-sm">{notice}</p> : null}
      {error ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{error}</p> : null}
      {draft && invoice.note ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{invoice.note} You can type it here, and set it for good under Clients &amp; team.</p> : null}

      {draft ? (
        <form action={saveInvoice} className="space-y-5">
          <input type="hidden" name="id" value={invoice.id} />
          <section className="grid gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-2">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="billToName">Bill to</Label>
                <Input id="billToName" name="billToName" defaultValue={invoice.billToName} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="billToAddress">Address</Label>
                <Textarea id="billToAddress" name="billToAddress" rows={3} defaultValue={invoice.billToAddress ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emails">Send to (emails, one per line)</Label>
                <Textarea id="emails" name="emails" rows={2} defaultValue={invoice.emails ?? ""} placeholder="accounting@client.com" />
              </div>
            </div>
            <div className="grid content-start gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="invoiceDate">Invoice date</Label>
                <Input id="invoiceDate" name="invoiceDate" type="date" defaultValue={day(invoice.invoiceDate)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dueDate">Due date</Label>
                <Input id="dueDate" name="dueDate" type="date" defaultValue={day(invoice.dueDate)} required />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="terms">Terms</Label>
                <Input id="terms" name="terms" defaultValue={invoice.terms} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="note">Internal note (not printed)</Label>
                <Input id="note" name="note" defaultValue={invoice.note ?? ""} />
              </div>
            </div>
          </section>

          <section className="overflow-x-auto rounded-lg border border-border bg-card p-4">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-1 py-2">Service date</th>
                  <th className="px-1 py-2">Product / service</th>
                  <th className="px-1 py-2">Description</th>
                  <th className="px-1 py-2 text-right">Qty</th>
                  <th className="px-1 py-2 text-right">Rate</th>
                  <th className="px-1 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((line, index) => (
                  <tr key={line?.id ?? `new-${index}`}>
                    <td className="px-1 py-1">
                      <Input name="serviceDate" type="date" defaultValue={day(line?.serviceDate ?? null)} aria-label="Service date" className="h-9 w-40" />
                    </td>
                    <td className="px-1 py-1">
                      <Input name="product" defaultValue={line?.product ?? ""} aria-label="Product or service" className="h-9 w-44 uppercase" />
                    </td>
                    <td className="px-1 py-1">
                      <Input name="description" defaultValue={line?.description ?? ""} aria-label="Description" className="h-9 min-w-56" />
                    </td>
                    <td className="px-1 py-1">
                      <Input name="qty" inputMode="decimal" defaultValue={line ? String(line.qty) : ""} aria-label="Quantity" className="h-9 w-24 text-right" />
                    </td>
                    <td className="px-1 py-1">
                      <Input name="rate" inputMode="decimal" defaultValue={line ? String(line.rate) : ""} aria-label="Rate" className="h-9 w-24 text-right" />
                    </td>
                    <td className="px-1 py-1 text-right">{line ? usd(line.amount) : ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border">
                  <td colSpan={5} className="px-1 py-2 text-right font-semibold">
                    Total
                  </td>
                  <td className="px-1 py-2 text-right text-lg font-semibold">{usd(invoice.total)}</td>
                </tr>
              </tfoot>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">Amount is quantity times rate. Empty a row to take it out; the total is updated when you save.</p>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="submit" formAction={deleteDraftInvoice} formNoValidate className="text-xs text-stuck underline-offset-2 hover:underline">
              Delete draft
            </button>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="outline">
                Save
              </Button>
              <Button type="submit" formAction={sendInvoice} title={recipients.length ? `Sends it to ${recipients.join(", ")}` : "Type an email to send it"}>
                Save and send to the client
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Send emails the invoice and the copy of the guía from billing@ackfreight.com, and shows the invoice in the portal of the client. A sent invoice can no longer be edited.
          </p>
        </form>
      ) : (
        <>
          <section className="grid gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-2">
            <div className="space-y-1 text-sm">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Bill to</p>
              <p className="font-semibold">{invoice.billToName}</p>
              <p className="whitespace-pre-line text-muted-foreground">{invoice.billToAddress}</p>
              <p className="pt-2 text-xs text-muted-foreground">Sent to {invoice.sentTo}</p>
            </div>
            <dl className="grid grid-cols-2 gap-1 text-sm">
              <dt className="text-muted-foreground">Invoice date</dt>
              <dd className="text-right">{day(invoice.invoiceDate)}</dd>
              <dt className="text-muted-foreground">Due date</dt>
              <dd className="text-right">{day(invoice.dueDate)}</dd>
              <dt className="text-muted-foreground">Terms</dt>
              <dd className="text-right">{invoice.terms}</dd>
              <dt className="text-muted-foreground">Total</dt>
              <dd className="text-right text-lg font-semibold">{usd(invoice.total)}</dd>
            </dl>
          </section>
          <section className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Service date</th>
                  <th className="px-3 py-2">Product / service</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((line) => (
                  <tr key={line.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{day(line.serviceDate)}</td>
                    <td className="px-3 py-2 font-medium">{line.product}</td>
                    <td className="px-3 py-2">{line.description}</td>
                    <td className="px-3 py-2 text-right">{line.qty}</td>
                    <td className="px-3 py-2 text-right">{usd(line.rate)}</td>
                    <td className="px-3 py-2 text-right">{usd(line.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <div className="flex flex-wrap items-center gap-3">
            <form action={setInvoicePaid}>
              <input type="hidden" name="id" value={invoice.id} />
              <Button type="submit" variant="outline">
                {shipment?.clientPaid ? "Paid by the client: mark as open" : "The client paid this invoice"}
              </Button>
            </form>
            <form action={resendInvoice}>
              <input type="hidden" name="id" value={invoice.id} />
              <Button type="submit" variant="outline">
                Send again
              </Button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
