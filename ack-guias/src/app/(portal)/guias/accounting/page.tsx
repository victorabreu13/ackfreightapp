import Link from "next/link";
import { redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { SelectAll } from "@/components/select-all";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canViewFinance } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { commissionStatus, monthRange, shortDate, usd } from "@/lib/guias/acct-format";
import { commissionOf } from "@/lib/guias/acct-import";
import { createPendingInvoices, importShipments, setClientPaid } from "@/server/acct-actions";
import type { Prisma } from "@prisma/client";

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

const SELECT = "h-10 rounded-md border border-input bg-background px-3 text-sm";

export default async function AccountingShipmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!canViewFinance(user)) redirect("/guias?error=The%20accounting%20is%20only%20for%20the%20accounting");
  const params = await searchParams;
  const notice = one(params, "notice");
  const error = one(params, "error");
  const q = (one(params, "q") ?? "").trim();
  const client = one(params, "client") ?? "";
  const pay = one(params, "pay") ?? "";
  const month = one(params, "month") ?? "";

  const where: Prisma.AcctShipmentWhereInput = {};
  if (q) where.OR = [{ awb: { contains: q, mode: "insensitive" } }, { invoiceNo: { contains: q, mode: "insensitive" } }, { dest: { contains: q, mode: "insensitive" } }, { client: { contains: q, mode: "insensitive" } }];
  if (client) where.client = client;
  if (pay === "open") where.clientPaid = false;
  if (pay === "paid") where.clientPaid = true;
  const range = monthRange(month);
  if (range) where.date = { gte: range.from, lt: range.to };

  const [shipments, totals, awaiting, clients, persons, months] = await Promise.all([
    prisma.acctShipment.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 400, include: { splits: true } }),
    prisma.acctShipment.aggregate({ where, _sum: { invoiced: true, costTotal: true, profit: true }, _count: true }),
    prisma.acctShipment.aggregate({ where: { ...where, clientPaid: false }, _sum: { invoiced: true }, _count: true }),
    prisma.acctShipment.findMany({ distinct: ["client"], select: { client: true }, orderBy: { client: "asc" } }),
    prisma.acctPerson.findMany({ select: { name: true, houseShare: true } }),
    prisma.acctShipment.findMany({ select: { date: true }, orderBy: { date: "desc" } }),
  ]);
  // The shipments of AWBs of the system that have no invoice yet, to catch them up in one go.
  const invoiced = await prisma.invoice.findMany({ where: { shipmentId: { not: null } }, select: { shipmentId: true } });
  const invoicedIds = invoiced.map((invoice) => invoice.shipmentId as string);
  const pendingWhere: Prisma.AcctShipmentWhereInput = { guiaId: { not: null }, id: { notIn: invoicedIds } };
  const [pendingCount, pendingRows, toConfigure] = await Promise.all([
    prisma.acctShipment.count({ where: pendingWhere }),
    prisma.acctShipment.findMany({ where: pendingWhere, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 100, select: { id: true, date: true, awb: true, client: true, invoiced: true } }),
    prisma.acctClient.findMany({ where: { needsSetup: true }, select: { name: true } }),
  ]);
  const unconfigured = new Set(toConfigure.map((row) => row.name));
  const houses = new Set(persons.filter((person) => person.houseShare).map((person) => person.name));
  const monthOptions = [...new Set(months.map((row) => row.date.toISOString().slice(0, 7)))];
  const owed = shipments.reduce((sum, shipment) => sum + shipment.splits.filter((split) => !houses.has(split.payee) && !split.paid).reduce((inner, split) => inner + commissionOf(shipment.profit, split.pct), 0), 0);
  const margin = totals._sum.invoiced ? ((totals._sum.profit ?? 0) / totals._sum.invoiced) * 100 : 0;
  const returnTo = `/guias/accounting?${new URLSearchParams({ ...(q ? { q } : {}), ...(client ? { client } : {}), ...(pay ? { pay } : {}), ...(month ? { month } : {}) }).toString()}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <GuiaEyebrow />
          <h1 className="font-display text-4xl">Shipments</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            What each shipment cost, what ACK invoiced and the profit that is shared. A commission is owed once the client has paid the invoice: click Open in the Client paid column when the client pays.
          </p>
        </div>
        <form action={importShipments} className="flex flex-wrap items-center gap-2">
          <Input type="file" name="csv" accept=".csv,text/csv" required aria-label="Shipments CSV" className="h-10 w-64" />
          <Button type="submit" variant="outline">
            Load from the Sheet (CSV)
          </Button>
        </form>
      </div>
      {notice ? <p className="rounded-md bg-secondary px-3 py-2 text-sm">{notice}</p> : null}
      {error ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{error}</p> : null}

      {pendingCount > 0 ? (
        <details className="rounded-lg border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">
            {pendingCount} shipments have no invoice. Choose which to catch up.
          </summary>
          <form id="pending-form" action={createPendingInvoices} className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Each chosen shipment is worked out again with the rules its client has now (rates, charges and split), and its draft invoice is made. You review the drafts in Invoices before sending. A client still to configure is left out.
            </p>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">
                      <SelectAll formId="pending-form" name="shipmentId" />
                    </th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">AWB</th>
                    <th className="px-3 py-2">Client</th>
                    <th className="px-3 py-2 text-right">Invoiced now</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingRows.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <input type="checkbox" name="shipmentId" value={row.id} aria-label={`Select ${row.awb}`} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{shortDate(row.date)}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{row.awb}</td>
                      <td className="px-3 py-2">
                        {row.client}
                        {unconfigured.has(row.client) ? <span className="ml-2 rounded-full bg-[#fff1e4] px-2 py-0.5 text-xs text-stuck">to configure</span> : null}
                      </td>
                      <td className="px-3 py-2 text-right">{usd(row.invoiced)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pendingCount > pendingRows.length ? <p className="text-xs text-muted-foreground">Showing the latest {pendingRows.length} of {pendingCount}.</p> : null}
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="recalc" value="1" defaultChecked />
                Work the shipment out again with the client rules first
              </label>
              <Button type="submit">Make the invoices of the chosen shipments</Button>
            </div>
          </form>
        </details>
      ) : null}

      <section className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Invoiced", usd(totals._sum.invoiced ?? 0), `${totals._count} shipments`],
          ["Cost", usd(totals._sum.costTotal ?? 0), ""],
          ["Profit", usd(totals._sum.profit ?? 0), `${margin.toFixed(1)}% margin`],
          ["Commissions owed", usd(owed), "on this list"],
          ["Awaiting client payment", usd(awaiting._sum.invoiced ?? 0), `${awaiting._count} invoices open`],
        ].map(([label, value, sub]) => (
          <div key={label} className="bg-card p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
            <p className="text-xs text-muted-foreground">{sub}</p>
          </div>
        ))}
      </section>

      <form className="flex flex-wrap items-end gap-2">
        <Input name="q" defaultValue={q} placeholder="AWB, invoice #, dest…" aria-label="Search" className="h-10 w-56" />
        <select name="client" defaultValue={client} aria-label="Client" className={SELECT}>
          <option value="">All clients</option>
          {clients.map((row) => (
            <option key={row.client} value={row.client}>
              {row.client}
            </option>
          ))}
        </select>
        <select name="pay" defaultValue={pay} aria-label="Client payment" className={SELECT}>
          <option value="">Any client payment</option>
          <option value="open">Open</option>
          <option value="paid">Paid</option>
        </select>
        <select name="month" defaultValue={month} aria-label="Month" className={SELECT}>
          <option value="">All months</option>
          {monthOptions.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          Filter
        </Button>
        <Link href="/guias/accounting" className="text-sm underline-offset-2 hover:underline">
          Clear
        </Link>
      </form>

      <section className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[1040px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">AWB</th>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">Route</th>
              <th className="px-3 py-2">ULD</th>
              <th className="px-3 py-2 text-right">CHW kg</th>
              <th className="px-3 py-2">Inv #</th>
              <th className="px-3 py-2 text-right">Cost</th>
              <th className="px-3 py-2 text-right">Invoiced</th>
              <th className="px-3 py-2 text-right">Profit</th>
              <th className="px-3 py-2">Client paid</th>
              <th className="px-3 py-2">Commission</th>
            </tr>
          </thead>
          <tbody>
            {shipments.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-3 py-6 text-muted-foreground">
                  There are no shipments here yet. Load the Shipments tab of the Sheet as a CSV, or issue an AWB.
                </td>
              </tr>
            ) : (
              shipments.map((shipment) => {
                const status = commissionStatus(shipment.splits, houses);
                return (
                  <tr key={shipment.id} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-3 py-2">{shortDate(shipment.date)}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{shipment.awb}</td>
                    <td className="px-3 py-2">{shipment.client}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {shipment.airline} → {shipment.dest}
                    </td>
                    <td className="px-3 py-2">{shipment.uldText ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{shipment.chw ? shipment.chw.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"}</td>
                    <td className="px-3 py-2">{shipment.invoiceNo ?? ""}</td>
                    <td className="px-3 py-2 text-right">{usd(shipment.costTotal)}</td>
                    <td className="px-3 py-2 text-right">{usd(shipment.invoiced)}</td>
                    <td className={`px-3 py-2 text-right ${shipment.profit < 0 ? "text-stuck" : ""}`}>{usd(shipment.profit)}</td>
                    <td className="px-3 py-2">
                      <form action={setClientPaid}>
                        <input type="hidden" name="id" value={shipment.id} />
                        <input type="hidden" name="paid" value={shipment.clientPaid ? "0" : "1"} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <button type="submit" title={shipment.clientPaid ? "The client paid this invoice. Click to mark it open." : "Click when the client pays this invoice."} className={`rounded-full px-2 py-0.5 text-xs ${shipment.clientPaid ? "bg-[#e7f6ec] text-[#14532d]" : "bg-secondary"}`}>
                          {shipment.clientPaid ? "Paid" : "Open"}
                        </button>
                      </form>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${status === "Owed" ? "bg-[#fff1e4] text-stuck" : status === "Paid" ? "bg-[#e7f6ec] text-[#14532d]" : ""}`}>{status}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
      {totals._count > shipments.length ? <p className="text-xs text-muted-foreground">Showing the latest {shipments.length} of {totals._count}. Filter by client or month to see the rest.</p> : null}
    </div>
  );
}
