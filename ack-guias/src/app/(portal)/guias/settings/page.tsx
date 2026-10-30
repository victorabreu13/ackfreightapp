import { redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isAdmin } from "@/lib/access";
import { resolveAppUrl } from "@/lib/app-url";
import { getSessionUser } from "@/lib/auth";
import { loadCompany } from "@/lib/guias/company";
import { missingProfileMessages, profileGap } from "@/lib/guias/company-profile";
import { prisma } from "@/lib/db";
import { companyTitle, qboCredentials, qboRedirectUri, qboTokenKeyIsDedicated } from "@/lib/guias/qbo";
import { saveCompanyProfile } from "@/server/guia-actions";
import { disconnectQuickBooks } from "@/server/guia-billing-actions";

const FIELDS = [
  ["brandName", "Brand name"],
  ["letterheadName", "Letterhead name"],
  ["address", "Address"],
  ["phone", "Phone"],
  ["fax", "Fax"],
  ["opsEmail", "Ops email"],
  ["contactName", "Contact name"],
  ["contactTitle", "Contact title"],
  ["termsUrl", "Terms URL"],
  ["tsaIacId", "TSA IAC id"],
  ["ccsfId", "CCSF id"],
  ["warehouseName", "Warehouse name"],
  ["warehouseAddress", "Warehouse address"],
  ["signerName", "Signer name"],
  ["signerTitle", "Signer title"],
] as const;

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function GuiaSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!isAdmin(user)) redirect("/guias?error=Settings%20are%20for%20admins");
  const params = await searchParams;
  const profiles = await prisma.companyProfile.findMany({ orderBy: { agentKey: "asc" } });
  const agents = (await prisma.issuingAgent.findMany({ orderBy: { key: "asc" } })).filter((agent) => agent.key === "ack");
  const views = await Promise.all(agents.map((agent) => loadCompany(agent.key)));
  const connections = await prisma.quickBooksConnection.findMany({
    select: { agentKey: true, realmId: true, connectedBy: true, connectedAt: true },
  });
  const redirectUri = qboRedirectUri(resolveAppUrl());

  return (
    <div className="space-y-6">
      <div>
        <GuiaEyebrow />
        <h1 className="font-display text-4xl">Company profiles</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          ACK TEAM LLC is the only issuer. Letters leave a blank field off the page. A missing TSA IAC, CCSF, warehouse, or signer is flagged here and on the guía. The AWB legal entity stays ACK TEAM LLC.
        </p>
      </div>
      {one(params, "saved") ? <p className="text-sm text-muted-foreground">Saved.</p> : null}
      {one(params, "error") ? <p className="text-sm text-stuck">{one(params, "error")}</p> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        {agents.map((agent) => {
          const profile = profiles.find((row) => row.agentKey === agent.key);
          const view = views.find((item) => item.agentKey === agent.key);
          const gaps = view ? missingProfileMessages(view) : [];
          return (
            <form key={agent.key} action={saveCompanyProfile} className="space-y-3 rounded-lg border border-border bg-card p-4">
              <h2 className="font-display text-2xl">ACK TEAM LLC</h2>
              <p className="text-xs text-muted-foreground">AWB face stays {agent.legalName}.</p>
              {gaps.length ? (
                <ul className="space-y-1 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {gaps.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              ) : null}
              <input type="hidden" name="agentKey" value={agent.key} />
              {FIELDS.map(([key, label]) => {
                const gap = view ? profileGap(key, view) : null;
                return (
                  <div key={key} className="space-y-1">
                    <Label htmlFor={`${agent.key}-${key}`}>{label}</Label>
                    <Input id={`${agent.key}-${key}`} name={key} defaultValue={profile?.[key] ?? ""} className={gap ? "border-amber-500" : ""} />
                    {gap ? <p className="text-xs text-amber-800">{gap}</p> : null}
                  </div>
                );
              })}
              <div className="space-y-1">
                <Label htmlFor={`${agent.key}-logo`}>Logo</Label>
                <input id={`${agent.key}-logo`} name="logo" type="file" accept="image/*" className="block text-sm" />
                <p className="text-xs text-muted-foreground">{profile?.logo ? "A logo is on file." : "No logo. Letters show the company name."}</p>
              </div>
              <Button type="submit">Save ACK</Button>
            </form>
          );
        })}
      </div>
      <section className="space-y-4">
        <div>
          <h2 className="font-display text-3xl">QuickBooks</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            QuickBooks se conecta solo a ACK TEAM LLC. El redirect de Intuit es {redirectUri || "AUTH_URL/api/guias/qbo/callback"}.
          </p>
          {qboTokenKeyIsDedicated() ? null : (
            <p className="mt-2 text-sm text-stuck">Falta el secreto QBO_TOKEN_KEY. Sin esa clave los tokens no quedan cifrados con una llave propia.</p>
          )}
        </div>
        {one(params, "saved") === "qbo" ? <p className="text-sm text-muted-foreground">QuickBooks de {companyTitle(one(params, "company") || "")} actualizado.</p> : null}
        <div className="grid gap-4 lg:grid-cols-2">
          {agents.map((agent) => {
            const connection = connections.find((row) => row.agentKey === agent.key);
            const creds = qboCredentials(agent.key);
            return (
              <div key={`qbo-${agent.key}`} className="space-y-3 rounded-lg border border-border bg-card p-4">
                <h3 className="font-display text-2xl">ACK TEAM LLC</h3>
                {connection ? (
                  <p className="text-sm text-muted-foreground">
                    Conectado. Compañía QuickBooks {connection.realmId}. Por {connection.connectedBy}.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Sin conectar.</p>
                )}
                {creds ? (
                  <a href={`/api/guias/qbo/connect?agentKey=${agent.key}`} className="inline-flex rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
                    {connection ? "Volver a conectar" : "Conectar QuickBooks"}
                  </a>
                ) : (
                  <p className="text-sm text-stuck">Faltan QBO_CLIENT_ID y QBO_CLIENT_SECRET para ACK.</p>
                )}
                {connection ? (
                  <form action={disconnectQuickBooks}>
                    <input type="hidden" name="agentKey" value={agent.key} />
                    <Button type="submit" variant="outline">
                      Desconectar ACK
                    </Button>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
