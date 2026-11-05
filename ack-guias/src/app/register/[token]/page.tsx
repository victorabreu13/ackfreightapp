import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { prisma } from "@/lib/db";
import { hashInviteToken, inviteState, MIN_PASSWORD_LENGTH } from "@/lib/guias/customer-auth";
import { registerCustomer } from "@/server/customer-actions";

export const dynamic = "force-dynamic";

const MESSAGE = {
  used: "Este enlace ya se usó. Si necesita entrar, inicie sesión o pida un enlace nuevo a ACK.",
  expired: "Este enlace venció. Pida uno nuevo a ACK.",
  missing: "Este enlace no es válido. Revise que lo copió completo o pida uno nuevo a ACK.",
} as const;

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const error = Array.isArray(query.error) ? query.error[0] : query.error;
  const invite = await prisma.customerInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: { guiaClient: { select: { name: true } } },
  });
  const state = inviteState(invite);

  return (
    <div className="flex min-h-full items-center justify-center px-5 py-12">
      <div className="w-full max-w-md space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">ACK TEAM LLC</p>
          <h1 className="font-display text-4xl">ACK Freight App</h1>
        </div>
        {state !== "ok" || !invite ? (
          <p className="rounded-md bg-[#fff1e4] px-3 py-3 text-sm text-stuck">{MESSAGE[state === "ok" ? "missing" : state]}</p>
        ) : (
          <form action={registerCustomer} className="space-y-4 rounded-lg border border-border bg-card p-5">
            <input type="hidden" name="token" value={token} />
            <div>
              <h2 className="font-display text-2xl">Cree su acceso</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Para ver las guías aéreas y el estatus de los vuelos de {invite.guiaClient.name}.
              </p>
            </div>
            {error ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{error}</p> : null}
            <div className="space-y-1.5">
              <Label htmlFor="email">Correo</Label>
              <Input id="email" value={invite.email} readOnly />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Su nombre (opcional)</Label>
              <Input id="name" name="name" autoComplete="name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Clave</Label>
              <Input id="password" name="password" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
              <p className="text-xs text-muted-foreground">Mínimo {MIN_PASSWORD_LENGTH} caracteres, con letras y números.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Repita la clave</Label>
              <Input id="confirm" name="confirm" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
            </div>
            <Button type="submit" className="w-full">
              Crear acceso y entrar
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
