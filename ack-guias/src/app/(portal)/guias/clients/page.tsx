import { redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isAdmin } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createCompanyClient, saveCompanyClientRate } from "@/server/guia-client-actions";

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function money(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

type ClientRow = {
  id: string;
  name: string;
  agentKey: string;
  ratePerKg: number | null;
};

function CompanyClients({ agentKey, title, rows }: { agentKey: "ack"; title: string; rows: ClientRow[] }) {
  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div>
        <h2 className="font-display text-2xl">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Clients and rates of ACK TEAM LLC. The rate is dollars per chargeable kilo.</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">There are no clients of {title} yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-2 py-2">Client</th>
                <th className="px-2 py-2">Agreed rate</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-2 py-2 font-medium">{row.name}</td>
                  <td className="px-2 py-2" colSpan={2}>
                    <form action={saveCompanyClientRate} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input type="hidden" name="guiaClientId" value={row.id} />
                      <input type="hidden" name="agentKey" value={row.agentKey} />
                      <Input
                        name="ratePerKg"
                        inputMode="decimal"
                        aria-label={`Agreed rate (USD/chargeable kg) for ${row.name}`}
                        defaultValue={row.ratePerKg ?? ""}
                        placeholder="USD/kg"
                        required
                        className="sm:max-w-40"
                      />
                      <span className="text-xs text-muted-foreground">{row.ratePerKg != null ? `${money(row.ratePerKg)} / kg` : "No agreed rate"}</span>
                      <Button type="submit" variant="outline" size="sm">
                        Save
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form action={createCompanyClient} className="grid gap-3 border-t border-border pt-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-end">
        <input type="hidden" name="agentKey" value={agentKey} />
        <div className="space-y-1">
          <Label htmlFor={`name-${agentKey}`}>New client</Label>
          <Input id={`name-${agentKey}`} name="name" required placeholder="Billing name" />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`rate-${agentKey}`}>Agreed rate (USD/chargeable kg)</Label>
          <Input id={`rate-${agentKey}`} name="ratePerKg" inputMode="decimal" placeholder="Opcional" />
        </div>
        <Button type="submit">Add</Button>
      </form>
    </section>
  );
}

export default async function GuiaClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!isAdmin(user)) redirect("/guias?error=Clients%20and%20rates%20is%20only%20for%20administrators");
  const params = await searchParams;
  const rows = await prisma.guiaClient.findMany({
    where: { agentKey: "ack" },
    orderBy: [{ name: "asc" }],
    include: { agreedRates: { select: { agentKey: true, ratePerKg: true } } },
  });
  const ack = rows.map((row) => ({
    id: row.id,
    name: row.name,
    agentKey: "ack" as const,
    ratePerKg: row.agreedRates.find((rate) => rate.agentKey === "ack")?.ratePerKg ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <GuiaEyebrow />
        <h1 className="font-display text-4xl">Clients and rates</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          The rate is dollars per chargeable kilo of ACK TEAM LLC. It is not mixed with any other company.
        </p>
      </div>
      {one(params, "saved") ? <p className="text-sm text-muted-foreground">Saved.</p> : null}
      {one(params, "error") ? <p className="text-sm text-stuck">{one(params, "error")}</p> : null}
      <CompanyClients agentKey="ack" title="ACK TEAM LLC" rows={ack} />
    </div>
  );
}
