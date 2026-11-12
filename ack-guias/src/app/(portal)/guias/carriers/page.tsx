import { redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canManageGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteCarrier, saveCarrier } from "@/server/carrier-actions";

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

const AREA = "block w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

function CarrierFields({ carrier }: { carrier?: { name: string; address: string; prefix: string | null; iata: string | null } }) {
  return (
    <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">Name (prints in By First Carrier and in Issued By)</span>
        <Input name="name" required defaultValue={carrier?.name ?? ""} placeholder="LATAM AIRLINES CARGO (MIA)" />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">AWB prefix</span>
        <Input name="prefix" inputMode="numeric" maxLength={3} defaultValue={carrier?.prefix ?? ""} placeholder="045" />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">IATA code</span>
        <Input name="iata" maxLength={2} defaultValue={carrier?.iata ?? ""} placeholder="LA" />
      </label>
      <label className="space-y-1 text-sm md:col-span-3">
        <span className="text-muted-foreground">Address and phone (as it prints on the AWB)</span>
        <textarea
          name="address"
          rows={3}
          defaultValue={carrier?.address ?? ""}
          className={AREA}
          placeholder={"1801 NW 66 AVENUE BLDG 709, MIAMI, FL 33122, UNITED STATES\nPhone: +1-786 265-6000"}
        />
      </label>
    </div>
  );
}

export default async function CarriersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!canManageGuias(user)) redirect("/guias?error=Only%20the%20ACK%20team%20can%20open%20the%20carriers");
  const params = await searchParams;
  const notice = one(params, "notice");
  const error = one(params, "error");
  const [carriers, usage] = await Promise.all([
    prisma.carrier.findMany({ orderBy: { name: "asc" } }),
    prisma.airWaybillDocument.groupBy({ by: ["carrierId"], where: { carrierId: { not: null } }, _count: true }),
  ]);
  const usedBy = (id: string) => usage.find((row) => row.carrierId === id)?._count ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <GuiaEyebrow />
        <h1 className="font-display text-4xl">Carriers</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Each carrier has the name and address that print on the AWB: the name goes in By First Carrier and both go at the top right, under Issued By. On the guía you pick the carrier in the Carrier field, after Destination. If you pick none, the one with the AWB prefix is used.
        </p>
      </div>
      {notice ? <p className="rounded-md bg-secondary px-3 py-2 text-sm">{notice}</p> : null}
      {error ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{error}</p> : null}

      <section className="space-y-3">
        {carriers.length === 0 ? <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">There are no carriers yet.</p> : null}
        {carriers.map((carrier) => (
          <details key={carrier.id} className="rounded-lg border border-border bg-card">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span className="font-medium">{carrier.name}</span>
              <span className="text-muted-foreground">
                {[carrier.prefix ? `Prefix ${carrier.prefix}` : "", carrier.iata ? `IATA ${carrier.iata}` : "", usedBy(carrier.id) ? `${usedBy(carrier.id)} guías` : ""].filter(Boolean).join(" · ")}
              </span>
            </summary>
            <div className="space-y-3 border-t border-border p-4">
              <form action={saveCarrier} className="space-y-3">
                <input type="hidden" name="id" value={carrier.id} />
                <CarrierFields carrier={carrier} />
                <Button type="submit">Save</Button>
              </form>
              <form action={deleteCarrier}>
                <input type="hidden" name="id" value={carrier.id} />
                <button type="submit" className="text-sm text-stuck underline-offset-2 hover:underline">
                  Borrar carrier
                </button>
              </form>
            </div>
          </details>
        ))}
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="font-display text-2xl">New carrier</h2>
        <form action={saveCarrier} className="space-y-3">
          <CarrierFields />
          <Button type="submit">Add</Button>
        </form>
      </section>
    </div>
  );
}
