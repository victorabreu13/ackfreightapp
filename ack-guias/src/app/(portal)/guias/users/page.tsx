import { redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isAdmin } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ROLE_DETAIL, USER_ROLE_LABEL, USER_ROLES } from "@/lib/users";
import { createUser, removeUser, updateUser } from "@/server/user-actions";

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!isAdmin(user)) redirect("/guias?error=Usuarios%20es%20solo%20para%20administradores");
  const params = await searchParams;
  // Customers are clients of the portal, not staff. Their access is handled in Directorio, so they are not in this table.
  const everyone = await prisma.user.findMany({ orderBy: [{ role: "asc" }, { email: "asc" }] });
  const users = everyone.filter((row) => row.role !== "CUSTOMER");
  const customers = everyone.length - users.length;

  return (
    <div className="space-y-6">
      <div>
        <GuiaEyebrow />
        <h1 className="font-display text-4xl">Usuarios</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Solo entra quien esté en esta lista o en ADMIN_EMAILS. Admin ve todo. Operations arma guías y stock. Accounting
          factura y ve las guías sin editarlas. Viewer solo lee las guías.
        </p>
      </div>
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="font-display text-2xl">Qué puede hacer cada rol</h2>
        <dl className="mt-3 space-y-2 text-sm">
          {ROLE_DETAIL.map((item) => (
            <div key={item.role} className="grid gap-1 md:grid-cols-[8rem_1fr]">
              <dt className="font-medium">{USER_ROLE_LABEL[item.role]}</dt>
              <dd className="text-muted-foreground">{item.summary}</dd>
            </div>
          ))}
        </dl>
        {customers > 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {customers} {customers === 1 ? "cliente tiene" : "clientes tienen"} acceso al portal. No salen en esta lista porque no son del equipo: se ven y se quitan en el Directorio.
          </p>
        ) : null}
      </section>
      {one(params, "saved") ? <p className="text-sm text-muted-foreground">Guardado.</p> : null}
      {one(params, "error") ? <p className="text-sm text-stuck">{one(params, "error")}</p> : null}
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Correo</th>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Rol</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-muted-foreground">
                  Todavía no hay usuarios. Las cuentas de ADMIN_EMAILS se crean al entrar.
                </td>
              </tr>
            ) : (
              users.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2" colSpan={4}>
                    <form action={updateUser} className="grid items-center gap-2 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_10rem_auto]">
                      <input type="hidden" name="id" value={row.id} />
                      <Input name="email" type="email" required defaultValue={row.email} aria-label={`Correo de ${row.email}`} />
                      <Input name="name" defaultValue={row.name ?? ""} aria-label={`Nombre de ${row.email}`} placeholder="Nombre" />
                      <select name="role" defaultValue={row.role} aria-label={`Rol de ${row.email}`} className={selectClass}>
                        {USER_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {USER_ROLE_LABEL[role]}
                          </option>
                        ))}
                      </select>
                      <Button type="submit" variant="outline" size="sm">
                        Guardar
                      </Button>
                    </form>
                    <form action={removeUser} className="mt-2">
                      <input type="hidden" name="id" value={row.id} />
                      <Button type="submit" variant="outline" size="sm">
                        Quitar
                      </Button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <form action={createUser} className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_10rem_auto] lg:items-end">
        <div className="space-y-1 sm:col-span-2 lg:col-span-1">
          <Label htmlFor="new-email">Correo</Label>
          <Input id="new-email" name="email" type="email" required placeholder="nombre@ackfreight.com" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-name">Nombre</Label>
          <Input id="new-name" name="name" placeholder="Opcional" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-role">Rol</Label>
          <select id="new-role" name="role" defaultValue="OPERATIONS" className={selectClass}>
            {USER_ROLES.map((role) => (
              <option key={role} value={role}>
                {USER_ROLE_LABEL[role]}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit">Agregar</Button>
      </form>
    </div>
  );
}
