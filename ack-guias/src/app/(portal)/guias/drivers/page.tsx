import { redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canManageGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteTruckDriver, saveTruckDriver } from "@/server/driver-actions";

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function DriverFields({ driver }: { driver?: { carrier: string; name: string; license: string | null; phone: string | null } }) {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">Carrier (empresa de transporte)</span>
        <Input name="carrier" defaultValue={driver?.carrier ?? ""} placeholder="KAY AIR DELIVERY" />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">Driver</span>
        <Input name="name" required defaultValue={driver?.name ?? ""} />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">License</span>
        <Input name="license" defaultValue={driver?.license ?? ""} />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">Teléfono</span>
        <Input name="phone" defaultValue={driver?.phone ?? ""} />
      </label>
    </div>
  );
}

export default async function DriversPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!canManageGuias(user)) redirect("/guias?error=Only%20the%20ACK%20team%20can%20open%20the%20drivers");
  const params = await searchParams;
  const notice = one(params, "notice");
  const error = one(params, "error");
  const drivers = await prisma.truckDriver.findMany({ orderBy: [{ carrier: "asc" }, { name: "asc" }] });

  return (
    <div className="space-y-6">
      <div>
        <GuiaEyebrow />
        <h1 className="font-display text-4xl">Drivers</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Los drivers que entregan carga en la bodega, con su carrier y su license. Cada warehouse receipt guarda aquí al driver que escribes, y la próxima vez lo sugiere mientras escribes el Carrier o el Driver.
        </p>
      </div>
      {notice ? <p className="rounded-md bg-secondary px-3 py-2 text-sm">{notice}</p> : null}
      {error ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{error}</p> : null}

      <section className="space-y-3">
        {drivers.length === 0 ? <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">Todavía no hay drivers. Se guardan solos con los warehouse receipts.</p> : null}
        {drivers.map((driver) => (
          <details key={driver.id} className="rounded-lg border border-border bg-card">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span className="font-medium">{driver.name}</span>
              <span className="text-muted-foreground">{[driver.carrier, driver.license, driver.phone].filter(Boolean).join(" · ")}</span>
            </summary>
            <div className="space-y-3 border-t border-border p-4">
              <form action={saveTruckDriver} className="space-y-3">
                <input type="hidden" name="id" value={driver.id} />
                <DriverFields driver={driver} />
                <Button type="submit">Guardar</Button>
              </form>
              <form action={deleteTruckDriver}>
                <input type="hidden" name="id" value={driver.id} />
                <button type="submit" className="text-sm text-stuck underline-offset-2 hover:underline">
                  Borrar driver
                </button>
              </form>
            </div>
          </details>
        ))}
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="font-display text-2xl">Nuevo driver</h2>
        <form action={saveTruckDriver} className="space-y-3">
          <DriverFields />
          <Button type="submit">Agregar</Button>
        </form>
      </section>
    </div>
  );
}
