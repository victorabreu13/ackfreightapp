import Link from "next/link";
import { redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { MigrationPending } from "@/components/migration-pending";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ACK_AGENT_KEY, canManageGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeBillToName } from "@/lib/guias/guia-client";
import { isPendingMigration, logMigrationError } from "@/lib/guias/migration-error";
import { ensureDirectorySeeded, normalizePartyName, PARTY_ROLES, PARTY_ROLE_LABEL } from "@/lib/guias/parties";
import { createDirectoryClient, createParty, deleteParty, renameDirectoryClient, saveParty } from "@/server/guia-directory-actions";

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

const SAVED_TEXT: Record<string, string> = {
  added: "Added.",
  saved: "Saved.",
  deleted: "Deleted.",
  renamed: "Client renamed.",
  client: "Client created.",
  exists: "That client already exists.",
};

const AREA = "block w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

export default async function GuiaDirectoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!canManageGuias(user)) redirect("/guias?error=Only%20the%20ACK%20team%20can%20open%20the%20directory");
  const params = await searchParams;
  const q = (one(params, "q") ?? "").trim();
  const selected = (one(params, "client") ?? "").trim();
  const saved = one(params, "saved");
  const error = one(params, "error");
  const key = normalizeBillToName(q);

  let clients: Array<{ id: string; name: string; parties: number; guias: number }> = [];
  let matches: Array<{ id: string; role: string; name: string; address: string | null; clientId: string | null; clientName: string }> = [];
  let parties: Awaited<ReturnType<typeof prisma.guiaParty.findMany>> = [];
  let unassigned = 0;
  let selectedClient: { id: string; name: string } | null = null;
  try {
    await ensureDirectorySeeded(ACK_AGENT_KEY);
    const rows = await prisma.guiaClient.findMany({
      where: { agentKey: ACK_AGENT_KEY, ...(key ? { normalizedName: { contains: key } } : {}) },
      orderBy: { name: "asc" },
      take: 300,
      include: { _count: { select: { parties: true, guias: true } } },
    });
    clients = rows.map((row) => ({ id: row.id, name: row.name, parties: row._count.parties, guias: row._count.guias }));
    unassigned = await prisma.guiaParty.count({ where: { agentKey: ACK_AGENT_KEY, guiaClientId: null } });
    if (key) {
      const found = await prisma.guiaParty.findMany({
        where: { agentKey: ACK_AGENT_KEY, normalizedName: { contains: normalizePartyName(q) } },
        orderBy: { name: "asc" },
        take: 30,
        include: { guiaClient: { select: { id: true, name: true } } },
      });
      matches = found.map((row) => ({
        id: row.id,
        role: row.role,
        name: row.name,
        address: row.address,
        clientId: row.guiaClient?.id ?? null,
        clientName: row.guiaClient?.name ?? "",
      }));
    }
    if (selected === "none") {
      parties = await prisma.guiaParty.findMany({ where: { agentKey: ACK_AGENT_KEY, guiaClientId: null }, orderBy: [{ role: "asc" }, { name: "asc" }] });
    } else if (selected) {
      const client = await prisma.guiaClient.findFirst({ where: { id: selected, agentKey: ACK_AGENT_KEY }, select: { id: true, name: true } });
      if (client) {
        selectedClient = client;
        parties = await prisma.guiaParty.findMany({ where: { agentKey: ACK_AGENT_KEY, guiaClientId: client.id }, orderBy: [{ role: "asc" }, { name: "asc" }] });
      }
    }
  } catch (caught) {
    if (!isPendingMigration(caught)) throw caught;
    logMigrationError("/guias/directory", caught);
    return <MigrationPending />;
  }
  const clientId = selected === "none" ? "none" : (selectedClient?.id ?? "");
  const heading = selected === "none" ? "Sin cliente" : (selectedClient?.name ?? "");

  return (
    <div className="space-y-6">
      <div>
        <GuiaEyebrow />
        <h1 className="font-display text-4xl">Directorio</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Clientes con sus shippers, consignatarios y notify. Al escribir en una guía nueva, estos nombres aparecen como sugerencias y llenan la dirección. Cada guía que guardas agrega lo que falte aquí.
        </p>
      </div>
      {saved ? <p className="text-sm text-muted-foreground">{SAVED_TEXT[saved] ?? "Saved."}</p> : null}
      {error ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{error}</p> : null}

      <form action="/guias/directory" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Buscar cliente, shipper o consignatario</span>
          <Input name="q" defaultValue={q} className="w-72" placeholder="Pacifiko" />
        </label>
        <Button type="submit" variant="outline">
          Buscar
        </Button>
        {q ? (
          <Button asChild variant="ghost">
            <Link href="/guias/directory">Quitar filtro</Link>
          </Button>
        ) : null}
      </form>

      {q && matches.length ? (
        <section className="space-y-2 rounded-lg border border-border bg-card p-4">
          <h2 className="font-display text-2xl">Shippers y consignatarios que coinciden</h2>
          <ul className="space-y-1 text-sm">
            {matches.map((row) => (
              <li key={row.id} className="flex flex-wrap gap-x-3">
                <span className="font-medium">{row.name}</span>
                <span className="text-muted-foreground">{PARTY_ROLE_LABEL[row.role as keyof typeof PARTY_ROLE_LABEL] ?? row.role}</span>
                <Link className="underline-offset-2 hover:underline" href={`/guias/directory?client=${row.clientId ?? "none"}`}>
                  {row.clientName || "Sin cliente"}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="space-y-3">
          <ul className="max-h-[70vh] overflow-auto rounded-lg border border-border bg-card text-sm">
            {clients.map((client) => (
              <li key={client.id} className="border-b border-border last:border-0">
                <Link
                  href={`/guias/directory?client=${client.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                  className={`flex items-baseline justify-between gap-2 px-3 py-2 hover:bg-muted ${client.id === selected ? "bg-muted font-medium" : ""}`}
                >
                  <span>{client.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {client.parties} · {client.guias} guías
                  </span>
                </Link>
              </li>
            ))}
            {unassigned > 0 ? (
              <li>
                <Link href="/guias/directory?client=none" className={`flex justify-between px-3 py-2 hover:bg-muted ${selected === "none" ? "bg-muted font-medium" : ""}`}>
                  <span>Sin cliente</span>
                  <span className="text-xs text-muted-foreground">{unassigned}</span>
                </Link>
              </li>
            ) : null}
            {clients.length === 0 && unassigned === 0 ? <li className="px-3 py-3 text-muted-foreground">No hay clientes todavía.</li> : null}
          </ul>
          <form action={createDirectoryClient} className="space-y-2 rounded-lg border border-border bg-card p-3">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Nuevo cliente</span>
              <Input name="name" required placeholder="Nombre para facturar" />
            </label>
            <Button type="submit" variant="outline" size="sm">
              Crear
            </Button>
          </form>
        </aside>

        <section className="space-y-6">
          {!clientId ? (
            <p className="rounded-lg border border-dashed border-border bg-card px-4 py-10 text-sm text-muted-foreground">
              Elige un cliente de la lista para ver y editar sus shippers, consignatarios y notify.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <h2 className="font-display text-3xl">{heading}</h2>
                {selectedClient ? (
                  <form action={renameDirectoryClient} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="clientId" value={selectedClient.id} />
                    <label className="space-y-1 text-sm">
                      <span className="text-muted-foreground">Nombre del cliente</span>
                      <Input name="name" defaultValue={selectedClient.name} required className="w-80" />
                    </label>
                    <Button type="submit" variant="outline" size="sm">
                      Cambiar nombre
                    </Button>
                  </form>
                ) : null}
              </div>

              {PARTY_ROLES.map((role) => {
                const rows = parties.filter((party) => party.role === role);
                return (
                  <section key={role} className="space-y-3 rounded-lg border border-border bg-card p-4">
                    <h3 className="font-display text-2xl">{PARTY_ROLE_LABEL[role]}</h3>
                    {rows.length === 0 ? <p className="text-sm text-muted-foreground">Ninguno todavía.</p> : null}
                    {rows.map((party) => (
                      <div key={party.id} className="grid gap-2 border-b border-border pb-3 last:border-0 md:grid-cols-2">
                        <form action={saveParty} className="contents">
                          <input type="hidden" name="id" value={party.id} />
                          <label className="space-y-1 text-sm">
                            <span className="text-muted-foreground">Nombre</span>
                            <Input name="name" defaultValue={party.name} required />
                          </label>
                          <label className="space-y-1 text-sm">
                            <span className="text-muted-foreground">Dirección</span>
                            <textarea name="address" rows={2} defaultValue={party.address ?? ""} className={AREA} />
                          </label>
                          <label className="space-y-1 text-sm">
                            <span className="text-muted-foreground">Teléfono</span>
                            <Input name="phone" defaultValue={party.phone ?? ""} />
                          </label>
                          <label className="space-y-1 text-sm">
                            <span className="text-muted-foreground">Email</span>
                            <Input name="email" defaultValue={party.email ?? ""} />
                          </label>
                          <div className="flex gap-2 md:col-span-2">
                            <Button type="submit" size="sm">
                              Guardar
                            </Button>
                          </div>
                        </form>
                        <form action={deleteParty} className="md:col-span-2">
                          <input type="hidden" name="id" value={party.id} />
                          <Button type="submit" variant="ghost" size="sm" className="text-stuck">
                            Eliminar
                          </Button>
                        </form>
                      </div>
                    ))}
                    <form action={createParty} className="grid gap-2 border-t border-border pt-3 md:grid-cols-2">
                      <input type="hidden" name="clientId" value={clientId} />
                      <input type="hidden" name="role" value={role} />
                      <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">Nuevo {PARTY_ROLE_LABEL[role].toLowerCase()}</span>
                        <Input name="name" required placeholder="Nombre" />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">Dirección</span>
                        <textarea name="address" rows={2} className={AREA} />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">Teléfono</span>
                        <Input name="phone" />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">Email</span>
                        <Input name="email" />
                      </label>
                      <div className="md:col-span-2">
                        <Button type="submit" variant="outline" size="sm">
                          Agregar
                        </Button>
                      </div>
                    </form>
                  </section>
                );
              })}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
