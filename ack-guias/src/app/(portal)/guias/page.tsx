import Link from "next/link";
import { redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { MigrationPending } from "@/components/migration-pending";
import { canManageGuias, canReadGuias, guiaWhere, isAdmin, isCompanyAccounting } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatNyDate } from "@/lib/guias/documents-index";
import { GuiaRowMenu } from "@/components/guia-row-menu";
import { guiaOnList } from "@/lib/guias/guia-list";
import { isPendingMigration, logMigrationError } from "@/lib/guias/migration-error";

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function GuiasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!canReadGuias(user)) redirect("/login");
  const accounting = isCompanyAccounting(user);
  const readOnly = !canManageGuias(user);
  const params = await searchParams;
  const error = one(params, "error");
  const notice = one(params, "notice");
  let all;
  try {
    all = await prisma.airWaybillDocument.findMany({
    where: guiaWhere(user),
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      guiaClient: { select: { name: true, agentKey: true } },
      agent: { select: { legalName: true } },
      lines: { select: { pieces: true, chargeableWeight: true } },
    },
  });
  } catch (caught) {
    if (!isPendingMigration(caught)) throw caught;
    logMigrationError("/guias", caught);
    return <MigrationPending />;
  }
  // Drafts and guías that have not flown yet. Documentos keeps every guía, and accounting needs the flown ones to invoice.
  const guias = (accounting ? all : all.filter((guia) => guiaOnList(guia))).slice(0, 100);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <GuiaEyebrow />
          <h1 className="font-display text-4xl">Guías</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {accounting
              ? "Solo las guías de tu empresa. Puedes ver kilos cobrables, la tarifa acordada y los documentos."
              : readOnly
                ? "Guías are read-only for this role."
                : "Draft a guía from client instructions, issue a number from airline stock, and print the AWB, orders, letters, and labels."}
          </p>
        </div>
        {canManageGuias(user) ? (
          <Link href="/guias/new" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
            Nueva guía
          </Link>
        ) : null}
      </div>
      {notice ? <p className="rounded-md bg-secondary px-3 py-2 text-sm">{notice}</p> : null}
      {error ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{error}</p> : null}
      {guias.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-4 py-10 text-sm text-muted-foreground">
          {accounting ? "No hay guías de tu empresa." : readOnly ? "No guías yet." : "No guías yet. Nueva guía starts from a pasted email. A sheet arrival is not required."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{accounting ? "Fecha" : "Date"}</th>
                <th className="px-3 py-2">AWB</th>
                <th className="px-3 py-2">{accounting ? "Cliente" : "Client"}</th>
                <th className="px-3 py-2">{accounting ? "Ruta" : "Route"}</th>
                <th className="px-3 py-2">{accounting ? "Piezas" : "Pieces"}</th>
                <th className="px-3 py-2">{accounting ? "Kilos cobrables" : "Chargeable kg"}</th>
                {accounting ? null : <th className="px-3 py-2">Company</th>}
                <th className="px-3 py-2">{accounting ? "Estado" : "Status"}</th>
                {accounting ? <th className="px-3 py-2">Factura</th> : null}
                {readOnly || accounting ? null : <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {guias.map((guia) => {
                const pieces = guia.lines.reduce((sum, line) => sum + (line.pieces ?? 0), 0);
                const kg = guia.lines.reduce((sum, line) => sum + (line.chargeableWeight ?? 0), 0);
                return (
                  <tr key={guia.id} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-3 py-2">{formatNyDate(guia.createdAt)}</td>
                    <td className="px-3 py-2">
                      <Link href={`/guias/${guia.id}`} className="font-medium underline-offset-2 hover:underline">
                        {guia.awb || "Draft"}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{(guia.guiaClient?.agentKey === guia.agentKey ? guia.guiaClient.name : "") || guia.clientLabel || "—"}</td>
                    <td className="px-3 py-2">
                      {guia.departure || "—"} → {guia.destination || "—"}
                    </td>
                    <td className="px-3 py-2">{pieces || "—"}</td>
                    <td className="px-3 py-2">{kg || "—"}</td>
                    {accounting ? null : <td className="px-3 py-2">{guia.agent.legalName}</td>}
                    <td className="px-3 py-2">{guia.status === "issued" ? (accounting ? "Emitida" : "Issued") : accounting ? "Borrador" : "Draft"}</td>
                    {accounting ? <td className="px-3 py-2">{guia.invoiceNumber || guia.qboDocNumber || "—"}</td> : null}
                    {readOnly || accounting ? null : (
                      <td className="px-3 py-2 text-right">
                        <GuiaRowMenu id={guia.id} label={guia.awb || "en borrador"} issued={guia.status === "issued"} canDelete={guia.status !== "issued" || isAdmin(user)} />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
