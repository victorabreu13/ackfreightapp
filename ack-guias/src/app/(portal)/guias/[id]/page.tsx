import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { GuiaAccountingView } from "@/components/guia-accounting";
import { GuiaBilling } from "@/components/guia-billing";
import { GuiaForm } from "@/components/guia-form";
import { GuiaUploads } from "@/components/guia-uploads";
import { MigrationPending } from "@/components/migration-pending";
import { Button } from "@/components/ui/button";
import { canEditAgreedRate, canInvoiceGuia, canReadGuias, guiaWhere, isCompanyAccounting } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadCompany } from "@/lib/guias/company";
import { missingProfileMessages } from "@/lib/guias/company-profile";
import { GUIA_FILE_LABELS, formatNy } from "@/lib/guias/documents-index";
import { canDeleteGuiaUpload, UPLOAD_KIND } from "@/lib/guias/upload-rules";
import type { GuiaValues } from "@/lib/guias/extract";
import { GUIA_FILE_KINDS, guiaFileName } from "@/lib/guias/files";
import { isPendingMigration, logMigrationError } from "@/lib/guias/migration-error";
import { issueGuia, saveGuiaToDrive } from "@/server/guia-actions";

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function valuesOf(document: {
  clientLabel: string | null;
  guiaClient?: { name: string } | null;
  shipperName: string | null;
  shipperAddress: string | null;
  consigneeName: string | null;
  consigneeAddress: string | null;
  notifyName: string | null;
  notifyAddress: string | null;
  departure: string | null;
  destination: string | null;
  flightNumber: string | null;
  flightDate: string | null;
  handling: string | null;
  aesItn: string | null;
  hawb: string | null;
  agentKey: string;
  lines: Array<{ pieces: number | null; chargeableWeight: number | null; grossWeight: number | null; nature: string | null }>;
}): GuiaValues {
  const line = document.lines[0];
  return {
    client: document.clientLabel || document.guiaClient?.name || "",
    shipper: document.shipperName || "",
    shipperAddress: document.shipperAddress || "",
    consignee: document.consigneeName || "",
    consigneeAddress: document.consigneeAddress || "",
    notify: document.notifyName || "",
    notifyAddress: document.notifyAddress || "",
    origin: document.departure || "",
    destination: document.destination || "",
    flightNumber: document.flightNumber || "",
    flightDate: document.flightDate || "",
    pieces: line?.pieces ? String(line.pieces) : "",
    chargeableKg: line?.chargeableWeight ? String(line.chargeableWeight) : "",
    grossKg: line?.grossWeight ? String(line.grossWeight) : "",
    goods: line?.nature || "",
    handling: document.handling || "",
    aesItn: document.aesItn || "",
    hawb: document.hawb || "",
    issuingCompany: "ack",
  };
}

export default async function GuiaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!canReadGuias(user)) redirect("/guias?error=Only%20the%20ACK%20team%20can%20open%20a%20gu%C3%ADa");
  const { id } = await params;
  const query = await searchParams;
  let document;
  let uploads: Awaited<ReturnType<typeof prisma.guiaDocument.findMany>> = [];
  try {
    document = await prisma.airWaybillDocument.findFirst({
      where: { id, ...guiaWhere(user) },
      include: {
        guiaClient: { select: { id: true, name: true, agentKey: true } },
        agent: true,
        lines: { orderBy: { sortOrder: "asc" } },
        driveFiles: { orderBy: { kind: "asc" } },
      },
    });
    if (document?.product === "guia") {
      uploads = await prisma.guiaDocument.findMany({
        where: { guiaId: id, kind: UPLOAD_KIND, source: "upload" },
        orderBy: { generatedAt: "desc" },
      });
    }
  } catch (caught) {
    if (!isPendingMigration(caught)) throw caught;
    logMigrationError("/guias/[id]", caught);
    return <MigrationPending />;
  }
  if (!document || document.product !== "guia") notFound();
  const pieces = document.lines.reduce((sum, line) => sum + (line.pieces ?? 0), 0);
  const chargeableKg = document.lines.reduce((sum, line) => sum + (line.chargeableWeight ?? 0), 0);
  const linked = document.guiaClient?.agentKey === document.agentKey ? document.guiaClient : null;
  const agreed = linked
    ? await prisma.clientAgreedRate.findUnique({ where: { agentKey_guiaClientId: { agentKey: document.agentKey, guiaClientId: linked.id } } })
    : null;
  const canEditRate = canEditAgreedRate(user);
  const companyClients = canEditRate
    ? (
        await prisma.guiaClient.findMany({
          where: { agentKey: document.agentKey },
          orderBy: { name: "asc" },
          include: { agreedRates: { where: { agentKey: document.agentKey }, select: { ratePerKg: true } } },
        })
      ).map((row) => ({ id: row.id, name: row.name, ratePerKg: row.agreedRates[0]?.ratePerKg ?? null }))
    : [];
  const qbo = await prisma.quickBooksConnection.findUnique({ where: { agentKey: document.agentKey }, select: { agentKey: true } });
  const billing = {
    guiaId: document.id,
    agentKey: document.agentKey,
    issued: document.status === "issued",
    pieces,
    chargeableKg,
    agreedRatePerKg: agreed?.ratePerKg ?? null,
    clientName: linked?.name ?? null,
    companyClients,
    selectedClientId: linked?.id ?? null,
    canEditRate,
    canInvoice: canInvoiceGuia(user, document.agentKey),
    qboConnected: qbo?.agentKey === document.agentKey,
    invoiceNumber: document.invoiceNumber,
    invoiceDate: document.invoiceDate,
    invoiceAmount: document.invoiceAmount,
    qboInvoiceId: document.qboInvoiceId,
    qboDocNumber: document.qboDocNumber,
  };
  if (isCompanyAccounting(user)) {
    const uploadNotice = one(query, "upload") === "ok" ? "Archivos guardados en la guía." : one(query, "invoiced") ? "Factura guardada." : one(query, "qbo") ? "Factura creada en QuickBooks." : one(query, "rate") ? "Tarifa guardada." : null;
    return (
      <GuiaAccountingView
        {...billing}
        id={document.id}
        awb={document.awb}
        status={document.status}
        origin={document.departure || ""}
        destination={document.destination || ""}
        files={[...GUIA_FILE_KINDS]}
        notice={uploadNotice}
        error={one(query, "error") ?? null}
        uploads={uploads.map((file) => ({
          id: file.id,
          fileName: file.fileName,
          mime: file.mime,
          size: file.size,
          uploadedBy: file.generatedBy,
          createdAt: formatNy(file.generatedAt),
          status: file.status,
          error: file.error,
          driveUrl: file.driveUrl,
          canDownload: Boolean(file.driveFileId),
          canDelete: false,
        }))}
      />
    );
  }
  const prefixes = await prisma.airlinePrefix.findMany({ orderBy: { prefix: "asc" }, take: 200 });
  const stock = await prisma.awbStockNumber.groupBy({
    by: ["prefix", "agentKey"],
    where: { status: "available", agentKey: document.agentKey },
    _count: true,
  });
  let review: string[] = [];
  let snippets: Record<string, string> = {};
  try {
    const parsed = JSON.parse(document.reviewJson || "[]") as unknown;
    if (Array.isArray(parsed)) review = parsed.map(String);
  } catch {
    review = [];
  }
  try {
    const parsed = JSON.parse(document.snippetJson || "{}") as Record<string, string>;
    if (parsed && typeof parsed === "object") snippets = parsed;
  } catch {
    snippets = {};
  }
  let profileGaps: string[] = [];
  let companyName = document.agent.legalName;
  try {
    const company = await loadCompany(document.agentKey);
    companyName = company.letterheadName || company.brandName || companyName;
    profileGaps = missingProfileMessages(company);
  } catch (error) {
    console.error("Guía company profile", error);
  }
  const fileBase = `/api/guias/${document.id}/file`;
  const error = one(query, "error");
  const drive = one(query, "drive");
  const uploadFlag = one(query, "upload");
  const uploadError = one(query, "uploadError");
  const uploadNotice =
    uploadFlag === "ok" ? "Archivos guardados en la guía." : uploadFlag === "deleted" ? "Archivo eliminado." : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <Link href="/guias">Guías</Link>
          </p>
          <h1 className="font-display text-4xl">{document.awb || "Draft guía"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {document.status === "issued" ? "Issued" : "Draft"} · {document.agent.legalName}
            {linked?.name || document.clientLabel ? ` · ${linked?.name || document.clientLabel}` : ""}
          </p>
        </div>
      </div>
      {error ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{error}</p> : null}
      {one(query, "saved") ? <p className="text-sm text-muted-foreground">Saved.</p> : null}
      {one(query, "issued") ? <p className="text-sm text-muted-foreground">Issued. The PDF download does not depend on Drive.</p> : null}
      {drive && drive !== "ok" ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">Drive: {drive}</p> : null}
      {drive === "ok" ? <p className="text-sm text-muted-foreground">Saved to Drive.</p> : null}
      {one(query, "invoiced") ? <p className="text-sm text-muted-foreground">Factura guardada.</p> : null}
      {one(query, "qbo") ? <p className="text-sm text-muted-foreground">Factura creada en QuickBooks.</p> : null}
      {one(query, "rate") ? <p className="text-sm text-muted-foreground">Tarifa guardada.</p> : null}

      <GuiaBilling {...billing} />

      <section className="space-y-3 rounded-lg border-2 border-primary bg-card p-4">
        <h2 className="font-display text-2xl">Emitir</h2>
        {document.status === "issued" ? (
          <p className="text-sm text-muted-foreground">This guía is already issued as {document.awb}.</p>
        ) : (
          <>
            {review.length ? (
              <p className="text-sm text-amber-800">Hay campos en revisión. No impiden emitir.</p>
            ) : null}
            <form action={issueGuia} className="flex flex-col gap-3 md:flex-row md:items-end">
              <input type="hidden" name="id" value={document.id} />
              <input type="hidden" name="agentKey" value={document.agentKey} />
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Airline prefix stock</span>
                <select name="prefix" className="block h-10 rounded-md border border-input bg-background px-3">
                  <option value="">Choose</option>
                  {prefixes.map((row) => {
                    const count = stock.find((item) => item.prefix === row.prefix)?._count ?? 0;
                    return (
                      <option key={row.prefix} value={row.prefix}>
                        {row.prefix} {row.airline} ({count} left)
                      </option>
                    );
                  })}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Or an in-stock number</span>
                <input name="manualAwb" className="block h-10 rounded-md border border-input bg-background px-3" placeholder="123-12345675" />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">AES ITN (optional)</span>
                <input
                  name="aesItn"
                  defaultValue={document.aesItn ?? ""}
                  className="block h-10 rounded-md border border-input bg-background px-3 font-mono"
                  placeholder="X20261021165293"
                />
              </label>
              <Button type="submit" size="lg">
                Issue
              </Button>
            </form>
          </>
        )}
      </section>

      <GuiaForm
        mode="edit"
        id={document.id}
        values={valuesOf(document)}
        review={review}
        snippets={snippets}
        truckerName={document.truckerName || ""}
        truckerPhone={document.truckerPhone || ""}
        driverName={document.driverName || ""}
        seal={document.seal || ""}
      />

      <section className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Documents</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Printing as ACK TEAM LLC. Every file below is generated here.
            </p>
          </div>
          <Button asChild>
            <a href={`${fileBase}?kind=all`}>Todos los documentos</a>
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {GUIA_FILE_KINDS.map((kind) => {
            const saved = document.driveFiles.find((file) => file.kind === kind && (file.driveUrl || file.driveFileId));
            const href = `${fileBase}?kind=${kind}`;
            const masterAwb = "";
            const needsIssue = (kind === "awb" || kind === "labels") && document.status !== "issued";
            const needsTrucker = (kind === "delivery" || kind === "pickup") && !document.truckerName?.trim();
            const note = needsIssue ? "Emite la guía primero" : needsTrucker ? "Enter a trucker and save" : saved ? "On Drive" : "Ready";
            return (
              <div key={kind} className="flex flex-col gap-1">
                {needsIssue ? (
                  <span title="Emite la guía primero" className="inline-flex w-full cursor-not-allowed">
                    <Button type="button" disabled variant="outline" className="h-auto w-full justify-between px-3 py-3">
                      <span>{GUIA_FILE_LABELS[kind]}</span>
                      <span className="text-xs font-normal text-muted-foreground">{note}</span>
                    </Button>
                  </span>
                ) : (
                  <Button asChild variant="outline" className="h-auto justify-between px-3 py-3">
                    <a href={href} target="_blank" rel="noreferrer">
                      <span>{GUIA_FILE_LABELS[kind]}</span>
                      <span className="text-xs font-normal text-muted-foreground">{note}</span>
                    </a>
                  </Button>
                )}
                <span className="px-1 text-xs text-muted-foreground">{guiaFileName(kind, document.awb, masterAwb)}</span>
                {kind === "labels" && masterAwb ? (
                  needsIssue ? (
                    <span title="Emite la guía primero" className="inline-flex cursor-not-allowed">
                      <Button type="button" disabled variant="outline" size="sm">
                        Master labels (MIA)
                      </Button>
                    </span>
                  ) : (
                    <Button asChild variant="outline" size="sm">
                      <a href={`${href}&master=1`} target="_blank" rel="noreferrer">
                        Master labels (MIA)
                      </a>
                    </Button>
                  )
                ) : null}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Todos los documentos downloads one zip: the 12-page AWB, delivery order, pickup order, TSA letter with the company logo, TSA unknown-shipper letter, CCSF certificate, CCSP certification, lithium battery letter, and Magaya labels. ACK prints the ACK logo and letterhead. Delivery and pickup need a trucker. The AWB and labels wait until the number is issued. Opening a file also uploads it to Drive under ACK Guías / client / AWB.
        </p>
        {profileGaps.length ? (
          <ul className="space-y-1 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {profileGaps.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : null}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Drive</h3>
          {document.driveFiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing uploaded yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {document.driveFiles.map((file) => (
                <li key={file.id} className="flex flex-wrap gap-2">
                  <span>{file.fileName}</span>
                  {file.driveUrl ? (
                    <a className="underline-offset-2 hover:underline" href={file.driveUrl} target="_blank" rel="noreferrer">
                      Open in Drive
                    </a>
                  ) : null}
                  {file.error ? <span className="text-stuck">{file.error}</span> : null}
                </li>
              ))}
            </ul>
          )}
          <form action={saveGuiaToDrive}>
            <input type="hidden" name="id" value={document.id} />
            <Button type="submit" variant="outline">
              Save to Drive
            </Button>
          </form>
        </div>
      </section>

      <GuiaUploads
        guiaId={document.id}
        notice={uploadNotice}
        error={uploadError ?? null}
        files={uploads.map((file) => ({
          id: file.id,
          fileName: file.fileName,
          mime: file.mime,
          size: file.size,
          uploadedBy: file.generatedBy,
          createdAt: formatNy(file.generatedAt),
          status: file.status,
          error: file.error,
          driveUrl: file.driveUrl,
          canDownload: Boolean(file.driveFileId),
          canDelete: canDeleteGuiaUpload(user, file.generatedBy),
        }))}
      />
    </div>
  );
}
