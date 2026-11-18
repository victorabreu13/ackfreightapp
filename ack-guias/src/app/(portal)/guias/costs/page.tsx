import { redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canViewFinance } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { COST_MODES, MIN_SETTINGS } from "@/lib/guias/acct-costs";
import { addProvider, addUld, deleteProvider, deleteUld, saveMinimums, saveProvider, saveUldCosts } from "@/server/acct-cost-actions";

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

const SELECT = "block h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const num = (value: number | null) => (value == null ? "" : String(value));

type Provider = Awaited<ReturnType<typeof prisma.acctProvider.findMany>>[number];

/** The boxes of one way of charging: a pickup or a transfer. */
function RuleFields({ provider, kind }: { provider: Provider; kind: "pickup" | "transfer" }) {
  const pick = kind === "pickup";
  const mode = pick ? provider.pickupMode : provider.transferMode;
  return (
    <fieldset className="space-y-3 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-semibold">{pick ? "Pickup" : "Transfer"}</legend>
      <div className="space-y-1.5">
        <Label htmlFor={`${kind}Mode-${provider.id}`}>How it charges</Label>
        <select id={`${kind}Mode-${provider.id}`} name={`${kind}Mode`} defaultValue={mode} className={SELECT}>
          {COST_MODES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${kind}Trip-${provider.id}`}>Price per trip ($)</Label>
          <Input id={`${kind}Trip-${provider.id}`} name={`${kind}TripCost`} inputMode="decimal" defaultValue={num(pick ? provider.pickupTripCost : provider.transferTripCost)} />
        </div>
        <div />
        <div className="space-y-1.5">
          <Label htmlFor={`${kind}Base-${provider.id}`}>Base price ($)</Label>
          <Input id={`${kind}Base-${provider.id}`} name={`${kind}BaseCost`} inputMode="decimal" defaultValue={num(pick ? provider.pickupBaseCost : provider.transferBaseCost)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${kind}BaseP-${provider.id}`}>Pallets the base covers</Label>
          <Input id={`${kind}BaseP-${provider.id}`} name={`${kind}BasePallets`} inputMode="numeric" defaultValue={num(pick ? provider.pickupBasePallets : provider.transferBasePallets)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${kind}Step-${provider.id}`}>Step price ($)</Label>
          <Input id={`${kind}Step-${provider.id}`} name={`${kind}StepCost`} inputMode="decimal" defaultValue={num(pick ? provider.pickupStepCost : provider.transferStepCost)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${kind}StepP-${provider.id}`}>Pallets in each step</Label>
          <Input id={`${kind}StepP-${provider.id}`} name={`${kind}StepPallets`} inputMode="numeric" defaultValue={num(pick ? provider.pickupStepPallets : provider.transferStepPallets)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${kind}Cap-${provider.id}`}>Most it can cost ($, optional)</Label>
          <Input id={`${kind}Cap-${provider.id}`} name={`${kind}Cap`} inputMode="decimal" defaultValue={num(pick ? provider.pickupCap : provider.transferCap)} />
        </div>
      </div>
    </fieldset>
  );
}

export default async function CostsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!canViewFinance(user)) redirect("/guias?error=Costs%20is%20only%20for%20the%20accounting");
  const params = await searchParams;
  const notice = one(params, "notice");
  const error = one(params, "error");
  const [providers, ulds, settings] = await Promise.all([
    prisma.acctProvider.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.acctUldCost.findMany({ orderBy: { uld: "asc" } }),
    prisma.acctSetting.findMany(),
  ]);
  const minimum = (key: string) => String(settings.find((row) => row.key === key)?.value ?? "");

  return (
    <div className="space-y-6">
      <div>
        <GuiaEyebrow />
        <h1 className="font-display text-4xl">Costs</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          What the pickups, the transfers and the handling of each ULD cost ACK, and the minimums charged on the sell side. The cost of a shipment is filled in from here and from the Rates.
        </p>
      </div>
      {notice ? <p className="rounded-md bg-secondary px-3 py-2 text-sm">{notice}</p> : null}
      {error ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{error}</p> : null}

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-2xl">Pickups and transfers</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Who does the job and how it charges. One price per trip is for a trip that carries several guías, usually all of the day: its cost goes to the biggest guía of the trip. Base price, then steps is by pallets: the base covers the first pallets and each further group of pallets, or a pallet or piece left over, adds the step price, up to the most it can cost when one is set.
          </p>
        </div>
        {providers.map((provider) => (
          <form key={provider.id} action={saveProvider} className="space-y-3 rounded-lg border border-border bg-card p-4">
            <input type="hidden" name="id" value={provider.id} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display text-xl">{provider.name}</h3>
              <div className="flex items-center gap-3">
                <button type="submit" formAction={deleteProvider} formNoValidate className="text-xs text-stuck underline-offset-2 hover:underline">
                  Remove
                </button>
                <Button type="submit">Save {provider.name}</Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`aliases-${provider.id}`}>Names its trucker goes by</Label>
              <Input id={`aliases-${provider.id}`} name="aliases" defaultValue={provider.aliases ?? ""} placeholder="ACK TEAM, ACK LOGISTICS" />
              <p className="text-xs text-muted-foreground">
                The trucker of the pickup order and of the delivery order tells which provider did the job. It is matched by these names, without capitals or punctuation, separated by commas.
              </p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <RuleFields provider={provider} kind="pickup" />
              <RuleFields provider={provider} kind="transfer" />
            </div>
          </form>
        ))}
        <form action={addProvider} className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
          <div className="space-y-1.5">
            <Label htmlFor="providerName">New provider</Label>
            <Input id="providerName" name="name" required />
          </div>
          <Button type="submit" variant="outline">
            Add
          </Button>
        </form>
      </section>

      <form action={saveUldCosts} className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Handling of each ULD</h2>
            <p className="mt-1 text-sm text-muted-foreground">What handling one ULD costs ACK. The cost of handling in a shipment is its ULDs times these prices.</p>
          </div>
          <Button type="submit">Save handling costs</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-2 py-2">ULD</th>
                <th className="px-2 py-2">Handling ($)</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {ulds.map((row) => (
                <tr key={row.uld} className="border-b border-border last:border-0">
                  <td className="px-2 py-1.5 font-mono font-medium">
                    {row.uld}
                    <input type="hidden" name="uld" value={row.uld} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input name="handlingCost" inputMode="decimal" defaultValue={num(row.handlingCost)} aria-label={`${row.uld} handling`} className="h-9 w-28" />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button type="submit" formAction={deleteUld} name="uld" value={row.uld} formNoValidate className="text-xs text-stuck underline-offset-2 hover:underline">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </form>

      <form action={addUld} className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <div className="space-y-1.5">
          <Label htmlFor="newUld">New ULD type</Label>
          <Input id="newUld" name="uld" placeholder="AKE" required className="w-32 uppercase" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="newHandling">Handling ($)</Label>
          <Input id="newHandling" name="handlingCost" inputMode="decimal" className="w-28" />
        </div>
        <Button type="submit" variant="outline">
          Add ULD
        </Button>
      </form>

      <form action={saveMinimums} className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Minimum charges</h2>
            <p className="mt-1 text-sm text-muted-foreground">The least ACK charges on the sell side for each of these lines, when the line is on Auto.</p>
          </div>
          <Button type="submit">Save minimums</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {MIN_SETTINGS.map((setting) => (
            <div key={setting.key} className="space-y-1.5">
              <Label htmlFor={setting.key}>{setting.label}</Label>
              <Input id={setting.key} name={setting.key} inputMode="decimal" defaultValue={minimum(setting.key)} />
            </div>
          ))}
        </div>
      </form>
    </div>
  );
}
