import { redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isAdmin } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatRate, rateMargin } from "@/lib/guias/airline-rates";
import { addAirlineRate, deleteAirlineRate, saveAirlineRates } from "@/server/airline-rate-actions";

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function AirlineRatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!isAdmin(user)) redirect("/guias?error=Airline%20rates%20is%20only%20for%20administrators");
  const params = await searchParams;
  const notice = one(params, "notice");
  const error = one(params, "error");
  const rows = await prisma.airlineRate.findMany({ orderBy: [{ airline: "asc" }, { sortOrder: "asc" }, { destination: "asc" }] });
  const airlines = [...new Set(rows.map((row) => row.airline))];

  return (
    <div className="space-y-6">
      <div>
        <GuiaEyebrow />
        <h1 className="font-display text-4xl">Airline rates</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          What ACK charges (sell) and what the airline charges ACK (buy) per kilo to each destination, in dollars. The margin is the sell rate less the buy rate. These are a rate card: they are not applied to a guía on their own.
        </p>
      </div>
      {notice ? <p className="rounded-md bg-secondary px-3 py-2 text-sm">{notice}</p> : null}
      {error ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{error}</p> : null}

      {airlines.map((airline) => {
        const list = rows.filter((row) => row.airline === airline);
        return (
          <form key={airline} action={saveAirlineRates} className="space-y-3 rounded-lg border border-border bg-card p-4">
            <input type="hidden" name="airline" value={airline} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-2xl">{airline}</h2>
              <Button type="submit">Save {airline}</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2">Destination</th>
                    <th className="px-2 py-2">Sell (USD/kg)</th>
                    <th className="px-2 py-2">Buy (USD/kg)</th>
                    <th className="px-2 py-2">Margin</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((row) => {
                    const margin = rateMargin(row.sellRate, row.buyRate);
                    return (
                      <tr key={row.id} className="border-b border-border last:border-0">
                        <td className="px-2 py-1.5 font-mono font-medium">
                          {row.destination}
                          <input type="hidden" name="rateId" value={row.id} />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input name="sellRate" inputMode="decimal" defaultValue={formatRate(row.sellRate)} aria-label={`${airline} ${row.destination} sell`} className="h-9 w-28" />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input name="buyRate" inputMode="decimal" defaultValue={formatRate(row.buyRate)} aria-label={`${airline} ${row.destination} buy`} className="h-9 w-28" />
                        </td>
                        <td className={`px-2 py-1.5 ${margin != null && margin < 0 ? "text-stuck" : ""}`}>{margin == null ? "—" : margin.toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-right">
                          <button type="submit" formAction={deleteAirlineRate} name="id" value={row.id} formNoValidate className="text-xs text-stuck underline-offset-2 hover:underline">
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
        );
      })}

      <form action={addAirlineRate} className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div>
          <h2 className="font-display text-2xl">Add a destination or an airline</h2>
          <p className="mt-1 text-sm text-muted-foreground">Pick an airline from the list or type a new one. The destination is an airport code, like GUA.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-5 md:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="airline">Airline</Label>
            <Input id="airline" name="airline" list="airlines" required />
            <datalist id="airlines">
              {airlines.map((airline) => (
                <option key={airline} value={airline} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="destination">Destination</Label>
            <Input id="destination" name="destination" maxLength={3} required className="uppercase" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="newSell">Sell (USD/kg)</Label>
            <Input id="newSell" name="sellRate" inputMode="decimal" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="newBuy">Buy (USD/kg)</Label>
            <Input id="newBuy" name="buyRate" inputMode="decimal" />
          </div>
          <Button type="submit" variant="outline">
            Add
          </Button>
        </div>
      </form>
    </div>
  );
}
