import Link from "next/link";
import { redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canViewFinance } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dayText, tableLabel } from "@/lib/guias/acct-costs";
import { formatRate, rateMargin } from "@/lib/guias/airline-rates";
import { addAirlineRate, deleteAirlineRate, newRateTable, saveAirlineRates } from "@/server/airline-rate-actions";

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function RatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!canViewFinance(user)) redirect("/guias?error=Rates%20is%20only%20for%20the%20accounting");
  const params = await searchParams;
  const notice = one(params, "notice");
  const error = one(params, "error");
  const tables = (await prisma.airlineRate.groupBy({ by: ["effectiveFrom"], orderBy: { effectiveFrom: "desc" } })).map((row) => row.effectiveFrom);
  const wanted = one(params, "from") ?? "";
  const current = tables.find((date) => dayText(date) === wanted) ?? tables[0] ?? null;
  const lanes = current ? await prisma.airlineRate.findMany({ where: { effectiveFrom: current }, orderBy: [{ sortOrder: "asc" }, { airline: "asc" }, { destination: "asc" }] }) : [];
  const from = current ? dayText(current) : "";

  return (
    <div className="space-y-6">
      <div>
        <GuiaEyebrow />
        <h1 className="font-display text-4xl">Rates</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          What the airline charges ACK (cost) and what ACK charges (sell) per kilo, by airline and destination. A shipment uses the newest table that starts on or before its date. The airline goes by its short code: LATAM, AVI, AJT, SUNR (Sunrise Air Cargo).
        </p>
      </div>
      {notice ? <p className="rounded-md bg-secondary px-3 py-2 text-sm">{notice}</p> : null}
      {error ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        {tables.map((date) => (
          <Link
            key={dayText(date)}
            href={`/guias/rates?from=${dayText(date)}`}
            className={`rounded-md border px-3 py-1.5 text-sm ${current && dayText(date) === from ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary"}`}
          >
            {tableLabel(date)}
          </Link>
        ))}
        <form action={newRateTable} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="copyFrom" value={from} />
          <Input name="newFrom" type="date" required aria-label="Start date of the new table" className="h-9 w-44" />
          <Button type="submit" variant="outline" size="sm">
            New table from this one
          </Button>
        </form>
      </div>

      {current ? (
        <form action={saveAirlineRates} className="space-y-3 rounded-lg border border-border bg-card p-4">
          <input type="hidden" name="from" value={from} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl">{tableLabel(current)}</h2>
            <Button type="submit">Save rates</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">Airline</th>
                  <th className="px-2 py-2">Destination</th>
                  <th className="px-2 py-2">Cost (USD/kg)</th>
                  <th className="px-2 py-2">Sell (USD/kg)</th>
                  <th className="px-2 py-2">Margin</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {lanes.map((lane) => {
                  const margin = rateMargin(lane.sellRate, lane.buyRate);
                  return (
                    <tr key={lane.id} className="border-b border-border last:border-0">
                      <td className="px-2 py-1.5 font-medium">{lane.airline}</td>
                      <td className="px-2 py-1.5 font-mono">
                        {lane.destination}
                        <input type="hidden" name="rateId" value={lane.id} />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input name="buyRate" inputMode="decimal" defaultValue={formatRate(lane.buyRate)} aria-label={`${lane.airline} ${lane.destination} cost`} className="h-9 w-28" />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input name="sellRate" inputMode="decimal" defaultValue={formatRate(lane.sellRate)} aria-label={`${lane.airline} ${lane.destination} sell`} className="h-9 w-28" />
                      </td>
                      <td className={`px-2 py-1.5 ${margin != null && margin < 0 ? "text-stuck" : ""}`}>{margin == null ? "—" : margin.toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right">
                        <button type="submit" formAction={deleteAirlineRate} name="id" value={lane.id} formNoValidate className="text-xs text-stuck underline-offset-2 hover:underline">
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </form>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">There are no rate tables yet. Create the first one with its start date.</p>
      )}

      {current ? (
        <form action={addAirlineRate} className="space-y-3 rounded-lg border border-border bg-card p-4">
          <input type="hidden" name="from" value={from} />
          <div>
            <h2 className="font-display text-2xl">Add a lane</h2>
            <p className="mt-1 text-sm text-muted-foreground">To the table {tableLabel(current)}. The airline is its code, like LATAM, and the destination an airport code, like GUA.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-5 md:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="airline">Airline</Label>
              <Input id="airline" name="airline" required className="uppercase" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="destination">Destination</Label>
              <Input id="destination" name="destination" maxLength={3} required className="uppercase" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newBuy">Cost (USD/kg)</Label>
              <Input id="newBuy" name="buyRate" inputMode="decimal" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newSell">Sell (USD/kg)</Label>
              <Input id="newSell" name="sellRate" inputMode="decimal" />
            </div>
            <Button type="submit" variant="outline">
              Add
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
