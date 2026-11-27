import Link from "next/link";
import { redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canViewFinance } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { shortDate, usd } from "@/lib/guias/acct-format";
import type { Prisma } from "@prisma/client";

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

const SELECT = "h-10 rounded-md border border-input bg-background px-3 text-sm";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!canViewFinance(user)) redirect("/guias?error=The%20accounting%20is%20only%20for%20the%20accounting");
  const params = await searchParams;
  const notice = one(params, "notice");
  const error = one(params, "error");
  const q = (one(params, "q") ?? "").trim();
  const status = one(params, "status") ?? "";

  const where: Prisma.InvoiceWhereInput = {};
  if (status === "draft" || status === "sent") where.status = status;
  if (q) where.OR = [{ client: { contains: q, mode: "insensitive" } }, { billToName: { contains: q, mode: "insensitive" } }, { awb: { contains: q, mode: "insensitive" } }, ...(Number(q) ? [{ number: Number(q) }] : [])];

  const [invoices, drafts, sentRows] = await Promise.all([
    prisma.invoice.findMany({ where, orderBy: { number: "desc" }, take: 300 }),
    prisma.invoice.count({ where: { status: "draft" } }),
    prisma.invoice.findMany({ where: { status: "sent" }, select: { shipmentId: true, total: true } }),
  ]);
  const shipmentIds = [...new Set([...invoices.map((invoice) => invoice.shipmentId), ...sentRows.map((row) => row.shipmentId)].filter((id): id is string => Boolean(id)))];
  const shipments = await prisma.acctShipment.findMany({ where: { id: { in: shipmentIds } }, select: { id: true, clientPaid: true } });
  const paidIds = new Set(shipments.filter((shipment) => shipment.clientPaid).map((shipment) => shipment.id));
  const isPaid = (shipmentId: string | null) => Boolean(shipmentId && paidIds.has(shipmentId));
  const awaiting = sentRows.filter((row) => !isPaid(row.shipmentId)).reduce((sum, row) => sum + row.total, 0);
  const awaitingCount = sentRows.filter((row) => !isPaid(row.shipmentId)).length;

  return (
    <div className="space-y-6">
      <div>
        <GuiaEyebrow />
        <h1 className="font-display text-4xl">Invoices</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Each AWB that is issued makes the invoice of its client as a draft, with the charges of its accounting row. Review it, correct what is needed and send it: the client gets it by email with the copy of the AWB and sees it in its portal.
        </p>
      </div>
      {notice ? <p className="rounded-md bg-secondary px-3 py-2 text-sm">{notice}</p> : null}
      {error ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{error}</p> : null}

      <section className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
        {[
          ["Drafts to review", String(drafts), "not sent yet"],
          ["Sent, not paid", usd(awaiting), `${awaitingCount} invoices`],
          ["Invoices", String(invoices.length), "on this list"],
        ].map(([label, value, sub]) => (
          <div key={label} className="bg-card p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
            <p className="text-xs text-muted-foreground">{sub}</p>
          </div>
        ))}
      </section>

      <form className="flex flex-wrap items-end gap-2">
        <Input name="q" defaultValue={q} placeholder="Invoice #, client, AWB…" aria-label="Search" className="h-10 w-56" />
        <select name="status" defaultValue={status} aria-label="Status" className={SELECT}>
          <option value="">Drafts and sent</option>
          <option value="draft">Drafts</option>
          <option value="sent">Sent</option>
        </select>
        <Button type="submit" variant="outline">
          Filter
        </Button>
        <Link href="/guias/invoices" className="text-sm underline-offset-2 hover:underline">
          Clear
        </Link>
      </form>

      <section className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Invoice #</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">AWB</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-muted-foreground">
                  There are no invoices here yet. The next AWB that is issued makes one.
                </td>
              </tr>
            ) : (
              invoices.map((invoice) => {
                const paid = invoice.status === "sent" && isPaid(invoice.shipmentId);
                const label = invoice.status === "draft" ? "Draft" : paid ? "Paid" : "Sent";
                const tone = invoice.status === "draft" ? "bg-[#fff1e4] text-stuck" : paid ? "bg-[#e7f6ec] text-[#14532d]" : "bg-secondary";
                return (
                  <tr key={invoice.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-mono">{invoice.number}</td>
                    <td className="whitespace-nowrap px-3 py-2">{shortDate(invoice.invoiceDate)}</td>
                    <td className="px-3 py-2">{invoice.client}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{invoice.awb ?? ""}</td>
                    <td className="px-3 py-2 text-right">{usd(invoice.total)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${tone}`}>{label}</span>
                      {invoice.note && invoice.status === "draft" ? <span title={invoice.note} className="ml-2 text-xs text-muted-foreground">needs data</span> : null}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link href={`/guias/invoices/${invoice.id}`} className="rounded-md border border-border px-3 py-1 text-sm">
                        {invoice.status === "draft" ? "Review" : "Open"}
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
