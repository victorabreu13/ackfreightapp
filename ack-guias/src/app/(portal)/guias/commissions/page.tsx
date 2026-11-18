import Link from "next/link";
import { redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { SelectAll } from "@/components/select-all";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canViewFinance } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isoDay, shortDate, usd } from "@/lib/guias/acct-format";
import { commissionOf } from "@/lib/guias/acct-import";
import { markCommissions } from "@/server/acct-actions";

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function CommissionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!canViewFinance(user)) redirect("/guias?error=The%20accounting%20is%20only%20for%20the%20accounting");
  const params = await searchParams;
  const notice = one(params, "notice");
  const error = one(params, "error");
  const status = one(params, "status") ?? "unpaid";
  const clientPaidOnly = one(params, "clientPaid") === "1";

  const people = await prisma.acctPerson.findMany({ where: { houseShare: false }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const houses = (await prisma.acctPerson.findMany({ where: { houseShare: true }, select: { name: true } })).map((person) => person.name);
  const wanted = one(params, "person") ?? "";
  const person = people.find((item) => item.name === wanted) ?? people[0] ?? null;

  // What each person is owed and has been paid, over every month.
  const every = await prisma.acctSplit.findMany({ where: { payee: { notIn: houses } }, select: { payee: true, pct: true, paid: true, shipment: { select: { profit: true } } } });
  const totals = new Map<string, { owed: number; paid: number }>();
  for (const split of every) {
    const row = totals.get(split.payee) ?? { owed: 0, paid: 0 };
    const amount = commissionOf(split.shipment.profit, split.pct);
    if (split.paid) row.paid += amount;
    else row.owed += amount;
    totals.set(split.payee, row);
  }

  const rows = person
    ? await prisma.acctSplit.findMany({
        where: {
          payee: person.name,
          ...(status === "unpaid" ? { paid: false } : status === "paid" ? { paid: true } : {}),
          ...(clientPaidOnly ? { shipment: { clientPaid: true } } : {}),
        },
        orderBy: [{ shipment: { date: "desc" } }],
        take: 500,
        include: { shipment: true },
      })
    : [];
  const shown = rows.reduce((sum, split) => sum + commissionOf(split.shipment.profit, split.pct), 0);
  const base = (over: Record<string, string>) => `/guias/commissions?${new URLSearchParams({ person: person?.name ?? "", status, ...(clientPaidOnly ? { clientPaid: "1" } : {}), ...over }).toString()}`;

  return (
    <div className="space-y-6">
      <div>
        <GuiaEyebrow />
        <h1 className="font-display text-4xl">Commissions</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">What each person is owed from the profit of the shipments, and what was already paid. The house share is not paid out.</p>
      </div>
      {notice ? <p className="rounded-md bg-secondary px-3 py-2 text-sm">{notice}</p> : null}
      {error ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{error}</p> : null}

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {people.map((item) => {
          const row = totals.get(item.name) ?? { owed: 0, paid: 0 };
          return (
            <Link key={item.id} href={base({ person: item.name })} className={`rounded-lg border p-4 ${person?.name === item.name ? "border-primary bg-card" : "border-border bg-card hover:bg-secondary"}`}>
              <p className="font-medium">{item.name}</p>
              <p className="mt-1 text-sm">
                <span className="font-semibold">{usd(row.owed)}</span> <span className="text-muted-foreground">owed · {usd(row.paid)} paid</span>
              </p>
            </Link>
          );
        })}
      </section>

      {person ? (
        <>
          <form className="flex flex-wrap items-center gap-3 text-sm">
            <input type="hidden" name="person" value={person.name} />
            <select name="status" defaultValue={status} aria-label="Status" className="h-10 rounded-md border border-input bg-background px-3">
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
              <option value="all">All</option>
            </select>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="clientPaid" value="1" defaultChecked={clientPaidOnly} />
              Only where the client has paid
            </label>
            <Button type="submit" variant="outline" size="sm">
              Filter
            </Button>
          </form>

          <form id="commission-form" action={markCommissions} className="space-y-3">
            <input type="hidden" name="person" value={person.name} />
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3 text-sm">
              <span className="text-muted-foreground">
                {rows.length} commissions · {usd(shown)}
              </span>
              <label className="flex items-center gap-2">
                Paid on
                <Input name="paidDate" type="date" defaultValue={isoDay(new Date())} className="h-9 w-40" />
              </label>
              <Button type="submit" name="mode" value="paid" size="sm">
                Mark as paid
              </Button>
              <Button type="submit" name="mode" value="unpaid" variant="outline" size="sm">
                Mark as unpaid
              </Button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">
                      <SelectAll formId="commission-form" name="splitId" />
                    </th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">AWB</th>
                    <th className="px-3 py-2">Client</th>
                    <th className="px-3 py-2">Inv #</th>
                    <th className="px-3 py-2">Client paid</th>
                    <th className="px-3 py-2 text-right">Profit</th>
                    <th className="px-3 py-2 text-right">%</th>
                    <th className="px-3 py-2 text-right">Commission</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-3 py-6 text-muted-foreground">
                        Nothing here for this filter.
                      </td>
                    </tr>
                  ) : (
                    rows.map((split) => (
                      <tr key={split.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">
                          <input type="checkbox" name="splitId" value={split.id} aria-label={`Select ${split.shipment.awb}`} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">{shortDate(split.shipment.date)}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{split.shipment.awb}</td>
                        <td className="px-3 py-2">{split.shipment.client}</td>
                        <td className="px-3 py-2">{split.shipment.invoiceNo ?? ""}</td>
                        <td className="px-3 py-2">{split.shipment.clientPaid ? "Paid" : "Open"}</td>
                        <td className="px-3 py-2 text-right">{usd(split.shipment.profit)}</td>
                        <td className="px-3 py-2 text-right">{split.pct}%</td>
                        <td className="px-3 py-2 text-right font-medium">{usd(commissionOf(split.shipment.profit, split.pct))}</td>
                        <td className="px-3 py-2">{split.paid ? `Paid${split.paidDate ? ` ${shortDate(split.paidDate)}` : ""}` : "Owed"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </form>
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">There is nobody on the team yet.</p>
      )}
    </div>
  );
}
