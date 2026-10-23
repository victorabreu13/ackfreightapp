import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { GuiaAccountingView } from "@/components/guia-accounting";
import { GuiaBilling } from "@/components/guia-billing";
import { GuiaForm } from "@/components/guia-form";
import { GuiaUploads } from "@/components/guia-uploads";
import { MigrationPending } from "@/components/migration-pending";
import { Button } from "@/components/ui/button";
import { canEditAgreedRate, canInvoiceGuia, canManageGuias, canReadGuias, guiaWhere } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadCompany } from "@/lib/guias/company";
import { missingProfileMessages } from "@/lib/guias/company-profile";
import { GUIA_FILE_LABELS, formatNy } from "@/lib/guias/documents-index";
import { canDeleteGuiaUpload, UPLOAD_KIND } from "@/lib/guias/upload-rules";
import type { GuiaValues } from "@/lib/guias/extract";
import { GUIA_FILE_KINDS, guiaFileName } from "@/lib/guias/files";
import { isPendingMigration, logMigrationError } from "@/lib/guias/migration-error";
import { FLIGHT_STATUS_LABEL, isFlightStatus } from "@/lib/guias/flight-status";
import { assignGuiaAwb, checkGuiaFlight, issueGuia, releaseGuiaAwb, saveGuiaToDrive } from "@/server/guia-actions";

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
  dgDeclarable: boolean;
  unNumbers: string | null;
  bup: boolean;
  lithiumPi: string | null;
  agentKey: string;
  lines: Array<{ pieces: number | null; chargeableWeight: number | null; grossWeight: number | null; rate: number | null; nature: string | null }>;
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
    rate: line?.rate != null ? String(line.rate) : "",
    grossKg: line?.grossWeight ? String(line.grossWeight) : "",
    goods: line?.nature || "",
    handling: document.handling || "",
    aesItn: document.aesItn || "",
    hawb: document.hawb || "",
    dg: document.dgDeclarable ? "1" : "",
    unNumbers: document.unNumbers || "",
    bup: document.bup ? "1" : "",
    lithiumPi: document.lithiumPi || "",
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
  if (!canManageGuias(user)) {
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
  const assignedStock = document.awb.trim() ? await prisma.awbStockNumber.findFirst({ where: { documentId: document.id } }) : null;
  const assigned = document.status !== "issued" && assignedStock != null;
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
      {one(query, "flight") === "ok" ? <p className="text-sm text-muted-foreground">Estatus del vuelo revisado.</p> : null}
      {one(query, "flight") && one(query, "flight") !== "ok" ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">Vuelo: {one(query, "flight")}</p> : null}
      {one(query, "assigned") ? <p className="text-sm text-muted-foreground">AWB asignado. El borrador y los labels ya salen con ese número.</p> : null}
      {one(query, "released") ? <p className="text-sm text-muted-foreground">AWB devuelto al stock.</p> : null}
      {one(query, "issued") ? <p className="text-sm text-muted-foreground">Issued. The PDF download does not depend on Drive.</p> : null}
      {drive && drive !== "ok" ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">Drive: {drive}</p> : null}
      {drive === "ok" ? <p className="text-sm text-muted-foreground">Saved to Drive.</p> : null}
      {one(query, "invoiced") ? <p className="text-sm text-muted-foreground">Factura guardada.</p> : null}
      {one(query, "qbo") ? <p className="text-sm text-muted-foreground">Factura creada en QuickBooks.</p> : null}
      {one(query, "rate") ? <p className="text-sm text-muted-foreground">Tarifa guardada.</p> : null}

      {document.status === "issued" && document.flightNumber ? (
        <section className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4">
          <div>
            <h2 className="font-display text-2xl">Estatus del vuelo</h2>
            <p className="text-sm text-muted-foreground">
              {document.flightNumber}
              {document.flightDate ? ` · ${document.flightDate}` : ""}
              {document.flightCheckedAt ? ` · revisado ${formatNy(document.flightCheckedAt)}` : " · todavía no se ha revisado"}
            </p>
          </div>
          <p className="text-xl font-semibold">{isFlightStatus(document.flightStatus) ? FLIGHT_STATUS_LABEL[document.flightStatus] : "Sin información"}</p>
          <form action={checkGuiaFlight}>
            <input type="hidden" name="id" value={document.id} />
            <Button type="submit" variant="outline" size="sm">
              Revisar ahora
            </Button>
          </form>
          <p className="w-full text-xs text-muted-foreground">
            Se revisa solo cada pocas horas, desde el día antes del vuelo hasta el día después. Cuando cambia, el cliente recibe un correo.
          </p>
        </section>
      ) : null}

      <GuiaBilling {...billing} />

      {document.status !== "issued" ? (
        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <h2 className="font-display text-2xl">AWB asignado</h2>
          {assigned ? (
            <div className="flex flex-wrap items-center gap-4">
              <p className="font-mono text-xl font-semibold">{document.awb}</p>
              <p className="text-sm text-muted-foreground">Reservado para esta guía. El borrador, los labels y el Folder Label salen con este número.</p>
              <form action={releaseGuiaAwb}>
                <input type="hidden" name="id" value={document.id} />
                <Button type="submit" variant="outline" size="sm">
                  Devolver al stock
                </Button>
              </form>
            </div>
          ) : (
            <form action={assignGuiaAwb} className="flex flex-col gap-3 md:flex-row md:items-end">
              <input type="hidden" name="id" value={document.id} />
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
                <input name="manualAwb" className="block h-10 rounded-md border border-input bg-background px-3 font-mono" placeholder="123-12345675" />
              </label>
              <Button type="submit" variant="outline" size="lg">
                Asignar AWB
              </Button>
            </form>
          )}
        </section>
      ) : null}

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
              {assigned ? (
                <p className="text-sm">
                  Se emite con el AWB asignado <span className="font-mono font-semibold">{document.awb}</span>.
                </p>
              ) : (
                <>
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
                </>
              )}
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

      {document.status !== "issued" ? (
        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div>
            <h2 className="font-display text-2xl">Imprimir sin emitir</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Labels, Folder Label y borrador de la guía. No usan stock ni emiten el número, y no se guardan en Documentos ni en Drive.
            </p>
          </div>
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <form action={fileBase} method="get" target="_blank" className="flex flex-col gap-3 md:flex-row md:items-end">
              <input type="hidden" name="draft" value="1" />
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">AWB number for the labels and the folder label</span>
                <input name="awb" required defaultValue={document.awb} className="block h-10 rounded-md border border-input bg-background px-3 font-mono" placeholder="123-12345675" />
              </label>
              <Button type="submit" name="kind" value="labels" variant="outline" size="lg">
                Imprimir labels
              </Button>
              <Button type="submit" name="kind" value="folder-label" variant="outline" size="lg">
                Imprimir Folder Label
              </Button>
            </form>
            <Button asChild variant="outline" size="lg">
              <a href={`${fileBase}?kind=awb&draft=1`} target="_blank" rel="noreferrer">
                Imprimir borrador de la guía (1 copia)
              </a>
            </Button>
          </div>
        </section>
      ) : null}

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
          <div className="flex flex-wrap gap-2">
            {document.dgDeclarable && document.unNumbers ? (
              <Button asChild variant="outline">
                <Link href={`/guias/dg-labels?un=${encodeURIComponent(document.unNumbers)}&copies=${Math.max(1, pieces)}&guia=${document.id}`}>Labels DG ({document.unNumbers})</Link>
              </Button>
            ) : null}
            <Button asChild>
              <a href={`${fileBase}?kind=all`}>Todos los documentos</a>
            </Button>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {GUIA_FILE_KINDS.map((kind) => {
            const saved = document.driveFiles.find((file) => file.kind === kind && (file.driveUrl || file.driveFileId));
            const href = `${fileBase}?kind=${kind}`;
            const masterAwb = "";
            const needsIssue = ((kind === "awb" || kind === "labels") && document.status !== "issued") || (kind === "folder-label" && !document.awb);
            const needsTrucker = (kind === "delivery" || kind === "pickup") && !document.truckerName?.trim();
            const note = needsIssue ? "Emite la guía o usa Imprimir sin emitir" : needsTrucker ? "Enter a trucker and save" : saved ? "On Drive" : "Ready";
            return (
              <div key={kind} className="flex flex-col gap-1">
                {needsIssue ? (
                  <span title="Emite la guía o usa Imprimir sin emitir" className="inline-flex w-full cursor-not-allowed">
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
                    <span title="Emite la guía o usa Imprimir sin emitir" className="inline-flex cursor-not-allowed">
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
          Todos los documentos downloads one zip: the shipment checklist, the 12-page AWB, delivery order, pickup order, TSA letter with the company logo, TSA unknown-shipper letter, CCSF certificate, CCSP certification and the lithium battery letter. ACK prints the ACK logo and letterhead. Delivery and pickup need a trucker. The AWB and labels wait until the number is issued. The cargo labels and the folder label are printed on their own and are not in that zip. Opening a file also uploads it to Drive under ACK Guías / client / AWB.
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
