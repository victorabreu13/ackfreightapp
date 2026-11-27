import Link from "next/link";
import { redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canViewFinance } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { usd } from "@/lib/guias/acct-format";
import { loadReportChoices, loadReportShipments } from "@/lib/guias/acct-report-data";
import { filtersFrom, GROUP_OPTIONS, presets, rubroReport, salesReport, weightReport } from "@/lib/guias/acct-reports";

const SELECT = "h-10 rounded-md border border-input bg-background px-3 text-sm";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const number = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });

function one(params: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!canViewFinance(user)) redirect("/guias?error=The%20accounting%20is%20only%20for%20the%20accounting");
  const filters = filtersFrom(one(await searchParams), today());
  const [shipments, choices] = await Promise.all([loadReportShipments(filters), loadReportChoices()]);
  const weight = weightReport(shipments, filters.groupBy);
  const sales = salesReport(shipments, filters.groupBy);
  const rubros = rubroReport(shipments);
  const groupLabel = GROUP_OPTIONS.find((option) => option.value === filters.groupBy)?.label ?? "Group";

  const query = (over: Record<string, string>) => new URLSearchParams({ from: filters.from, to: filters.to, client: filters.client, dest: filters.dest, airline: filters.airline, groupBy: filters.groupBy, ...over }).toString();
  const csv = (report: string) => `/api/guias/reports?${query({ report })}`;
  const th = "px-3 py-2";

  return (
    <div className="space-y-6">
      <div>
        <GuiaEyebrow />
        <h1 className="font-display text-4xl">Reports</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Kilos, sales and costs of the shipments of a period. Choose the dates, narrow it to a client, a destination or an airline, and group it the way you need. Each table downloads as a CSV.
        </p>
      </div>

      <form className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-xs text-muted-foreground">
            From
            <Input name="from" type="date" defaultValue={filters.from} className="h-10 w-40" />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            To
            <Input name="to" type="date" defaultValue={filters.to} className="h-10 w-40" />
          </label>
          <select name="client" defaultValue={filters.client} aria-label="Client" className={SELECT}>
            <option value="">All clients</option>
            {choices.clients.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select name="dest" defaultValue={filters.dest} aria-label="Destination" className={SELECT}>
            <option value="">All destinations</option>
            {choices.dests.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select name="airline" defaultValue={filters.airline} aria-label="Airline" className={SELECT}>
            <option value="">All airlines</option>
            {choices.airlines.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <label className="space-y-1 text-xs text-muted-foreground">
            Group by
            <select name="groupBy" defaultValue={filters.groupBy} className={`${SELECT} block`}>
              {GROUP_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit">Show</Button>
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="text-muted-foreground">Period:</span>
          {presets(today()).map((preset) => (
            <Link key={preset.label} href={`/guias/reports?${query({ from: preset.from, to: preset.to })}`} className="underline-offset-2 hover:underline">
              {preset.label}
            </Link>
          ))}
        </p>
      </form>

      <section className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Shipments", String(weight.total.shipments), `${number(weight.total.pcs)} pieces`],
          ["Gross kg", number(weight.total.gross), ""],
          ["Chargeable kg", number(weight.total.chw), ""],
          ["Sales", usd(sales.total.sales), `Cost ${usd(sales.total.cost)}`],
          ["Profit", usd(sales.total.profit), `${sales.total.margin.toFixed(1)}% margin`],
        ].map(([label, value, sub]) => (
          <div key={label} className="bg-card p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
            <p className="text-xs text-muted-foreground">{sub}</p>
          </div>
        ))}
      </section>

      {shipments.length === 0 ? <p className="rounded-lg border border-dashed border-border bg-card px-4 py-10 text-sm text-muted-foreground">There are no shipments with these filters.</p> : null}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-2xl">Kilos by {groupLabel.toLowerCase()}</h2>
          <a href={csv("weight")} className="rounded-md border border-border px-3 py-1.5 text-sm">
            Download CSV
          </a>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className={th}>{groupLabel}</th>
                <th className={`${th} text-right`}>Shipments</th>
                <th className={`${th} text-right`}>Pieces</th>
                <th className={`${th} text-right`}>Gross kg</th>
                <th className={`${th} text-right`}>Chargeable kg</th>
              </tr>
            </thead>
            <tbody>
              {weight.rows.map((row) => (
                <tr key={row.key} className="border-b border-border">
                  <td className="px-3 py-2">{row.key}</td>
                  <td className="px-3 py-2 text-right">{row.shipments}</td>
                  <td className="px-3 py-2 text-right">{number(row.pcs)}</td>
                  <td className="px-3 py-2 text-right">{number(row.gross)}</td>
                  <td className="px-3 py-2 text-right">{number(row.chw)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right">{weight.total.shipments}</td>
                <td className="px-3 py-2 text-right">{number(weight.total.pcs)}</td>
                <td className="px-3 py-2 text-right">{number(weight.total.gross)}</td>
                <td className="px-3 py-2 text-right">{number(weight.total.chw)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-2xl">Sales and costs by {groupLabel.toLowerCase()}</h2>
          <a href={csv("sales")} className="rounded-md border border-border px-3 py-1.5 text-sm">
            Download CSV
          </a>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className={th}>{groupLabel}</th>
                <th className={`${th} text-right`}>Shipments</th>
                <th className={`${th} text-right`}>Sales</th>
                <th className={`${th} text-right`}>Cost</th>
                <th className={`${th} text-right`}>Profit</th>
                <th className={`${th} text-right`}>Margin</th>
              </tr>
            </thead>
            <tbody>
              {sales.rows.map((row) => (
                <tr key={row.key} className="border-b border-border">
                  <td className="px-3 py-2">{row.key}</td>
                  <td className="px-3 py-2 text-right">{row.shipments}</td>
                  <td className="px-3 py-2 text-right">{usd(row.sales)}</td>
                  <td className="px-3 py-2 text-right">{usd(row.cost)}</td>
                  <td className={`px-3 py-2 text-right ${row.profit < 0 ? "text-stuck" : ""}`}>{usd(row.profit)}</td>
                  <td className="px-3 py-2 text-right">{row.margin.toFixed(1)}%</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right">{sales.total.shipments}</td>
                <td className="px-3 py-2 text-right">{usd(sales.total.sales)}</td>
                <td className="px-3 py-2 text-right">{usd(sales.total.cost)}</td>
                <td className="px-3 py-2 text-right">{usd(sales.total.profit)}</td>
                <td className="px-3 py-2 text-right">{sales.total.margin.toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-2xl">Sales and costs by rubro</h2>
          <a href={csv("rubro")} className="rounded-md border border-border px-3 py-1.5 text-sm">
            Download CSV
          </a>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className={th}>Rubro</th>
                <th className={`${th} text-right`}>Sales</th>
                <th className={`${th} text-right`}>Cost</th>
                <th className={`${th} text-right`}>Profit</th>
              </tr>
            </thead>
            <tbody>
              {rubros.rows.map((row) => (
                <tr key={row.label} className="border-b border-border">
                  <td className="px-3 py-2">{row.label}</td>
                  <td className="px-3 py-2 text-right">{usd(row.sold)}</td>
                  <td className="px-3 py-2 text-right">{usd(row.cost)}</td>
                  <td className={`px-3 py-2 text-right ${row.profit < 0 ? "text-stuck" : ""}`}>{usd(row.profit)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right">{usd(rubros.total.sold)}</td>
                <td className="px-3 py-2 text-right">{usd(rubros.total.cost)}</td>
                <td className="px-3 py-2 text-right">{usd(rubros.total.profit)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">Choose a client, a destination or an airline above to see its rubros alone. Shipments loaded from the old Sheet may carry their cost in fewer rubros than the new ones.</p>
      </section>
    </div>
  );
}
