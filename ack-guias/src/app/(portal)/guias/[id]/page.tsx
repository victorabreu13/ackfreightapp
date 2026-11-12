import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { GuiaAccountingView } from "@/components/guia-accounting";
import { GuiaBilling } from "@/components/guia-billing";
import { companyTitle } from "@/lib/guias/qbo";
import { GuiaForm } from "@/components/guia-form";
import { CategoryUpload } from "@/components/category-upload";
import { setGuiaCompleted } from "@/server/guia-actions";
import { GuiaUploads } from "@/components/guia-uploads";
import { MigrationPending } from "@/components/migration-pending";
import { Button } from "@/components/ui/button";
import { canEditAgreedRate, canInvoiceGuia, canManageGuias, canReadGuias, guiaWhere } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadCarrierOptions } from "@/lib/guias/carriers";
import { applyReceiptsToGuia, receiptNumber, receiptTotals } from "@/lib/guias/wr";
import { guiaFieldLabel, MANUAL_FIELDS, manualFieldOf, manualKeysOf, parseDismissed } from "@/lib/guias/guia-manual";
import { receiptFeeds } from "@/lib/guias/wr-sync";
import { keepGuiaValueOverReceipt, linkReceiptToGuia, refreshGuiaFromReceipts, resetGuiaFromReceipts, unlinkReceiptFromGuia } from "@/server/wr-actions";
import { loadCompany } from "@/lib/guias/company";
import { missingProfileMessages } from "@/lib/guias/company-profile";
import { GUIA_FILE_LABELS, formatNy } from "@/lib/guias/documents-index";
import { canDeleteGuiaUpload, isCategoryUpload, UPLOAD_KIND } from "@/lib/guias/upload-rules";
import { guiaValuesOf as valuesOf } from "@/lib/guias/guia-data";
import { guiaFileName } from "@/lib/guias/files";
import { isPendingMigration, logMigrationError } from "@/lib/guias/migration-error";
import { requestAckTripRequest } from "@/server/ack-freight-actions";
import { FLIGHT_STATUS_LABEL, isFlightStatus } from "@/lib/guias/flight-status";
import { SubmitButton } from "@/components/submit-button";
import { LABEL_KINDS, OPTIONAL_KINDS, packKinds } from "@/lib/guias/guia-pack";
import { assignGuiaAwb, checkGuiaFlight, issueGuia, releaseGuiaAwb, saveGuiaToDrive } from "@/server/guia-actions";

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
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
  const carrierOptions = await loadCarrierOptions();
  const [linkedReceipts, freeReceipts] = await Promise.all([
    prisma.warehouseReceipt.findMany({ where: { guiaId: id }, orderBy: { seq: "asc" }, include: { lines: true } }),
    prisma.warehouseReceipt.findMany({ where: { guiaId: null }, orderBy: { seq: "desc" }, take: 50, select: { id: true, seq: true, clientLabel: true, shipperName: true } }),
  ]);
  const receiptsNotice = one(query, "receipts");
  // A draft shows what its receipts say that its own numbers do not: the choice between the two, and a Dangerous
  // Goods suggestion. An issued guía is never touched by a receipt, so it shows nothing.
  const issuedGuia = document.status === "issued";
  const manualKeys = manualKeysOf(document);
  const fromReceipts = linkedReceipts.length && !issuedGuia ? applyReceiptsToGuia(valuesOf(document), receiptFeeds(linkedReceipts), manualKeys) : null;
  const dismissed = parseDismissed(document.wrDismissed);
  const conflicts = (fromReceipts?.conflicts ?? []).filter((conflict) => dismissed[conflict.field] !== conflict.wr);
  const dgSuggestion = fromReceipts?.dangerousGoods ?? null;
  const changeHistory = canManageGuias(user) ? await prisma.guiaChangeLog.findMany({ where: { guiaId: id }, orderBy: { createdAt: "desc" }, take: 25 }) : [];
  const uploadRows = uploads.map((file) => ({
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
  }));
  const dgdFiles = uploadRows.filter((file) => isCategoryUpload("dgd", file.fileName));
  const invoiceFiles = uploadRows.filter((file) => isCategoryUpload("invoice", file.fileName));
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
    const uploadNotice = one(query, "upload") === "ok" ? "Files saved on the guía." : one(query, "invoiced") ? "Invoice saved." : one(query, "qbo") ? "Invoice created in QuickBooks." : one(query, "rate") ? "Rate saved." : null;
    return (
      <GuiaAccountingView
        {...billing}
        id={document.id}
        awb={document.awb}
        status={document.status}
        origin={document.departure || ""}
        destination={document.destination || ""}
        files={packKinds(document)}
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
    uploadFlag === "ok" ? "Files saved on the guía." : uploadFlag === "deleted" ? "File deleted." : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
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
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <a href="https://uldflow.lovable.app/" target="_blank" rel="noreferrer">
              Request BUP
            </a>
          </Button>
          <form action={requestAckTripRequest}>
            <input type="hidden" name="id" value={document.id} />
            <SubmitButton pendingLabel="Solicitando…">Trip request</SubmitButton>
          </form>
        </div>
      </div>
      {error ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{error}</p> : null}
      {one(query, "saved") ? <p className="text-sm text-muted-foreground">Saved.</p> : null}
      {one(query, "ack") ? (
        <p
          className={
            one(query, "ack") === "failed"
              ? "rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck"
              : "rounded-md bg-[#e7f6ec] px-3 py-2 text-sm text-[#14532d]"
          }
        >
          {one(query, "ackMsg") ?? ""}
        </p>
      ) : null}
      {one(query, "flight") === "ok" ? <p className="text-sm text-muted-foreground">Flight status checked.</p> : null}
      {one(query, "flight") && one(query, "flight") !== "ok" ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">Vuelo: {one(query, "flight")}</p> : null}
      {one(query, "assigned") ? <p className="text-sm text-muted-foreground">AWB assigned. The draft and the labels already print with that number.</p> : null}
      {one(query, "released") ? <p className="text-sm text-muted-foreground">AWB returned to stock.</p> : null}
      {one(query, "issued") ? <p className="text-sm text-muted-foreground">Issued. The PDF download does not depend on Drive.</p> : null}
      {drive && drive !== "ok" ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">Drive: {drive}</p> : null}
      {drive === "ok" ? <p className="text-sm text-muted-foreground">Saved to Drive.</p> : null}
      {one(query, "invoiced") ? <p className="text-sm text-muted-foreground">Invoice saved.</p> : null}
      {one(query, "qbo") ? <p className="text-sm text-muted-foreground">Invoice created in QuickBooks.</p> : null}
      {one(query, "rate") ? <p className="text-sm text-muted-foreground">Rate saved.</p> : null}

      {document.status === "issued" && document.flightNumber ? (
        <section className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4">
          <div>
            <h2 className="font-display text-2xl">Flight status</h2>
            <p className="text-sm text-muted-foreground">
              {document.flightNumber}
              {document.flightDate ? ` · ${document.flightDate}` : ""}
              {document.flightCheckedAt ? ` · checked ${formatNy(document.flightCheckedAt)}` : " · not checked yet"}
            </p>
          </div>
          <p className="text-xl font-semibold">{isFlightStatus(document.flightStatus) ? FLIGHT_STATUS_LABEL[document.flightStatus] : "No information"}</p>
          <form action={checkGuiaFlight}>
            <input type="hidden" name="id" value={document.id} />
            <Button type="submit" variant="outline" size="sm">
              Check now
            </Button>
          </form>
          <p className="w-full text-xs text-muted-foreground">
            It is checked on its own every few hours, from the day before the flight to the day after. When it changes, the client gets an email.
          </p>
        </section>
      ) : null}

      {document.status !== "issued" ? (
        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <h2 className="font-display text-2xl">AWB asignado</h2>
          {assigned ? (
            <div className="flex flex-wrap items-center gap-4">
              <p className="font-mono text-xl font-semibold">{document.awb}</p>
              <p className="text-sm text-muted-foreground">Reserved for this guía. The draft, the labels and the Folder Label print with this number.</p>
              <form action={releaseGuiaAwb}>
                <input type="hidden" name="id" value={document.id} />
                <Button type="submit" variant="outline" size="sm">
                  Return to stock
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
              <SubmitButton variant="outline" size="lg" pendingLabel="Asignando…">
                Assign AWB
              </SubmitButton>
            </form>
          )}
        </section>
      ) : null}

      <section className="space-y-3 rounded-lg border-2 border-primary bg-card p-4">
        <h2 className="font-display text-2xl">Issue</h2>
        {document.status === "issued" ? (
          <p className="text-sm text-muted-foreground">This guía is already issued as {document.awb}.</p>
        ) : (
          <>
            {review.length ? (
              <p className="text-sm text-amber-800">Some fields are under review. They do not stop you from issuing.</p>
            ) : null}
            <form action={issueGuia} className="flex flex-col gap-3 md:flex-row md:items-end">
              <input type="hidden" name="id" value={document.id} />
              <input type="hidden" name="agentKey" value={document.agentKey} />
              {assigned ? (
                <p className="text-sm">
                  It is issued with the assigned AWB <span className="font-mono font-semibold">{document.awb}</span>.
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
              <SubmitButton size="lg" pendingLabel="Issuing… do not close the page">
                Issue
              </SubmitButton>
            </form>
          </>
        )}
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div>
          <h2 className="font-display text-2xl">Guías screen</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {document.completedAt
              ? `Marked completed${document.completedBy ? ` by ${document.completedBy}` : ""}. It does not appear on the Guías screen.`
              : "Drafts and guías that have not flown yet appear on the Guías screen. A guía leaves on its own the day after its flight, or you mark it completed."}
          </p>
        </div>
        <form action={setGuiaCompleted}>
          <input type="hidden" name="id" value={document.id} />
          <input type="hidden" name="done" value={document.completedAt ? "0" : "1"} />
          <input type="hidden" name="returnTo" value={document.completedAt ? `/guias/${document.id}` : "/guias"} />
          <Button type="submit" variant="outline">
            {document.completedAt ? "Back to the list" : "Mark completed"}
          </Button>
        </form>
      </section>

      {document.status !== "issued" ? (
        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div>
            <h2 className="font-display text-2xl">Print without issuing</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Labels, Folder Label and guía draft. They do not use stock or issue the number, and they are not saved to Documents or Drive.
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
                Print guía draft (1 copy)
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
        aircraft={document.aircraft || ""}
        screened={document.screened}
        carrierOptions={carrierOptions}
        carrierId={document.carrierId || ""}
      />

      {canManageGuias(user) ? (
        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div>
            <h2 className="font-display text-2xl">Warehouse receipts</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The cargo received at the warehouse for this guía. {document.status === "issued" ? "The guía is already issued: linking or releasing a receipt does not modify it, it only saves the relation." : "While it is a draft, it takes the pieces, the weights, the shipper, the consignee and the goods from its receipts. What you type by hand in pieces or weights is not overwritten."}
            </p>
          </div>
          {receiptsNotice ? <p className="rounded-md bg-secondary px-3 py-2 text-sm">{receiptsNotice}</p> : null}
          {conflicts.map((conflict) => {
            const field = manualFieldOf(conflict.field);
            const unit = field.unit ? ` ${field.unit}` : "";
            return (
              <div key={conflict.field} className="space-y-2 rounded-md border border-amber-500 bg-[#fff8e6] px-3 py-2 text-sm">
                <p>
                  <strong>{field.label}.</strong> Guía: {conflict.guia}
                  {unit} / WR: {conflict.wr}
                  {unit}. The guía keeps the value you typed.
                </p>
                <div className="flex flex-wrap gap-2">
                  <form action={keepGuiaValueOverReceipt}>
                    <input type="hidden" name="guiaId" value={document.id} />
                    <input type="hidden" name="field" value={conflict.field} />
                    <input type="hidden" name="receiptValue" value={conflict.wr} />
                    <Button type="submit" variant="outline" size="sm">
                      Keep the guía value
                    </Button>
                  </form>
                  <form action={resetGuiaFromReceipts}>
                    <input type="hidden" name="guiaId" value={document.id} />
                    <input type="hidden" name="field" value={conflict.field} />
                    <Button type="submit" variant="outline" size="sm">
                      Use the WR value
                    </Button>
                  </form>
                </div>
              </div>
            );
          })}
          {dgSuggestion ? (
            <p className="rounded-md border border-amber-500 bg-[#fff8e6] px-3 py-2 text-sm">
              <strong>Suggestion.</strong> A warehouse receipt carries {dgSuggestion.text}
              {dgSuggestion.unNumbers.length ? ` (${dgSuggestion.unNumbers.join(", ")})` : ""}. If it applies, check Dangerous Goods{dgSuggestion.unNumbers.length ? " and the UN numbers" : ""} on the guía. It was not changed on its own.
            </p>
          ) : null}
          {!issuedGuia && linkedReceipts.length && manualKeys.size ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-muted-foreground">Typed by hand:</span>
              {MANUAL_FIELDS.filter((field) => manualKeys.has(field.key)).map((field) => (
                <form key={field.key} action={resetGuiaFromReceipts} className="flex items-center gap-1.5">
                  <input type="hidden" name="guiaId" value={document.id} />
                  <input type="hidden" name="field" value={field.key} />
                  <span>{field.label}</span>
                  <button type="submit" className="text-xs underline-offset-2 hover:underline">
                    Reset from WR
                  </button>
                </form>
              ))}
              {manualKeys.size > 1 ? (
                <form action={resetGuiaFromReceipts}>
                  <input type="hidden" name="guiaId" value={document.id} />
                  <input type="hidden" name="field" value="all" />
                  <Button type="submit" variant="outline" size="sm">
                    Reset everything from WR
                  </Button>
                </form>
              ) : null}
            </div>
          ) : null}
          {linkedReceipts.length ? (
            <ul className="space-y-2 text-sm">
              {linkedReceipts.map((receipt) => {
                const totals = receiptTotals(receipt.lines.map((line) => ({ pieces: line.pieces, length: line.length, width: line.width, height: line.height, weightKg: line.weightKg })));
                return (
                  <li key={receipt.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                    <span>
                      <Link href={`/guias/warehouse/${receipt.id}`} className="font-medium underline-offset-2 hover:underline">
                        {receiptNumber(receipt.seq)}
                      </Link>
                      <span className="ml-3 text-muted-foreground">
                        {totals.pieces} pcs · {totals.weightKg.toFixed(2)} kg · {totals.volumeWeightKg.toFixed(2)} VKg
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <a href={`/api/guias/warehouse/${receipt.id}/pdf`} target="_blank" rel="noreferrer" className="text-xs underline-offset-2 hover:underline">
                        PDF
                      </a>
                      <form action={unlinkReceiptFromGuia}>
                        <input type="hidden" name="guiaId" value={document.id} />
                        <input type="hidden" name="receiptId" value={receipt.id} />
                        <button type="submit" className="text-xs text-stuck underline-offset-2 hover:underline">
                          Release
                        </button>
                      </form>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">This guía has no warehouse receipts yet.</p>
          )}
          <div className="flex flex-wrap items-end gap-3">
            {freeReceipts.length ? (
              <form action={linkReceiptToGuia} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="guiaId" value={document.id} />
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">Link a receipt with no guía</span>
                  <select name="receiptId" required className="block h-10 rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">Choose</option>
                    {freeReceipts.map((receipt) => (
                      <option key={receipt.id} value={receipt.id}>
                        {receiptNumber(receipt.seq)} · {receipt.clientLabel || receipt.shipperName || "no client"}
                      </option>
                    ))}
                  </select>
                </label>
                <Button type="submit" variant="outline">
                  Link
                </Button>
              </form>
            ) : null}
            {linkedReceipts.length ? (
              <form action={refreshGuiaFromReceipts}>
                <input type="hidden" name="guiaId" value={document.id} />
                <Button type="submit" variant="outline">
                  Update the guía from its receipts
                </Button>
              </form>
            ) : null}
            <Button asChild variant="outline">
              <Link href="/guias/warehouse/new">New warehouse receipt</Link>
            </Button>
          </div>
        </section>
      ) : null}

      <section className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Documents</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Printing as ACK TEAM LLC. Only the documents this cargo needs.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {document.status === "issued" ? (
              <Button asChild>
                <a href={`${fileBase}?kind=all`}>Download all documents</a>
              </Button>
            ) : (
              <span title="Issue the guía to download all documents" className="inline-flex cursor-not-allowed">
                <Button type="button" disabled>
                  Download all documents
                </Button>
              </span>
            )}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {packKinds(document).map((kind) => {
            const saved = document.driveFiles.find((file) => file.kind === kind && (file.driveUrl || file.driveFileId));
            const href = `${fileBase}?kind=${kind}`;
            const masterAwb = "";
            const needsIssue = ((kind === "awb" || kind === "labels") && document.status !== "issued") || (kind === "folder-label" && !document.awb);
            const needsTrucker = (kind === "delivery" || kind === "pickup") && !document.truckerName?.trim();
            const note = needsIssue ? "Issue the guía or use Print without issuing" : needsTrucker ? "Enter a trucker and save" : saved ? "On Drive" : "Ready";
            return (
              <div key={kind} className="flex flex-col gap-1">
                {needsIssue ? (
                  <span title="Issue the guía or use Print without issuing" className="inline-flex w-full cursor-not-allowed">
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
                    <span title="Issue the guía or use Print without issuing" className="inline-flex cursor-not-allowed">
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
          {document.dgDeclarable ? (
            <CategoryUpload guiaId={document.id} category="dgd" title="Signed DGD" missing="Missing: two copies signed by the shipper" files={dgdFiles} buttonLabel="Upload signed DGD" />
          ) : null}
          <CategoryUpload
            guiaId={document.id}
            category="invoice"
            title="Invoices or manifests"
            missing="Upload the client invoices or manifests"
            files={invoiceFiles}
            multiple
            buttonLabel="Upload invoices or manifests"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Download all documents downloads one zip with the files above, plus what you uploaded (signed DGD, invoices or manifests). The TSA letter depends on the aircraft, and the CCSF and the CCSP only come when the cargo goes screened: both are set in the guía form. The delivery order needs a trucker and the guía waits until it is issued. The pickup order and the warehouse receipts are kept, but they do not go with the documents: the pickup is in Pickups and the receipts are in the section above. Opening a file also uploads it to Drive under ACK Guías / client / AWB.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {OPTIONAL_KINDS.map((kind) => (
            <div key={kind} className="flex flex-col gap-1">
              <Button asChild variant="outline" className="h-auto justify-between px-3 py-3">
                <a href={`${fileBase}?kind=${kind}`} target="_blank" rel="noreferrer">
                  <span>{GUIA_FILE_LABELS[kind]}</span>
                  <span className="text-xs font-normal text-muted-foreground">Opcional</span>
                </a>
              </Button>
              <span className="px-1 text-xs text-muted-foreground">{guiaFileName(kind, document.awb, "")}</span>
            </div>
          ))}
        </div>
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
            <SubmitButton variant="outline" pendingLabel="Guardando en Drive…">
              Save to Drive
            </SubmitButton>
          </form>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Labels</h2>
            <p className="mt-1 text-sm text-muted-foreground">Printed on their own, not with the documents.</p>
          </div>
          {document.dgDeclarable && document.unNumbers ? (
            <Button asChild variant="outline">
              <Link href={`/guias/dg-labels?un=${encodeURIComponent(document.unNumbers)}&copies=${Math.max(1, pieces)}&guia=${document.id}`}>Labels DG ({document.unNumbers})</Link>
            </Button>
          ) : null}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {LABEL_KINDS.map((kind) => {
            const needsIssue = (kind === "labels" && document.status !== "issued") || (kind === "folder-label" && !document.awb);
            const note = needsIssue ? "Issue the guía or use Print without issuing" : "Ready";
            return (
              <div key={kind} className="flex flex-col gap-1">
                {needsIssue ? (
                  <span title="Issue the guía or use Print without issuing" className="inline-flex w-full cursor-not-allowed">
                    <Button type="button" disabled variant="outline" className="h-auto w-full justify-between px-3 py-3">
                      <span>{GUIA_FILE_LABELS[kind]}</span>
                      <span className="text-xs font-normal text-muted-foreground">{note}</span>
                    </Button>
                  </span>
                ) : (
                  <Button asChild variant="outline" className="h-auto justify-between px-3 py-3">
                    <a href={`${fileBase}?kind=${kind}`} target="_blank" rel="noreferrer">
                      <span>{GUIA_FILE_LABELS[kind]}</span>
                      <span className="text-xs font-normal text-muted-foreground">{note}</span>
                    </a>
                  </Button>
                )}
                <span className="px-1 text-xs text-muted-foreground">{guiaFileName(kind, document.awb, "")}</span>
              </div>
            );
          })}
        </div>
      </section>

      <GuiaUploads
        guiaId={document.id}
        notice={uploadNotice}
        error={uploadError ?? null}
        files={uploadRows}
      />

      <details className="group space-y-3" open={Boolean(one(query, "invoiced") || one(query, "qbo") || one(query, "rate"))}>
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-4">
          <span className="font-display text-2xl">Factura {companyTitle(document.agentKey)}</span>
          <span className="rounded-md border border-border px-3 py-1.5 text-sm font-medium">
            <span className="group-open:hidden">View invoice</span>
            <span className="hidden group-open:inline">Hide invoice</span>
          </span>
        </summary>
        <GuiaBilling {...billing} />
      </details>

      {changeHistory.length ? (
        <details className="group rounded-lg border border-border bg-card p-4">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
            <span className="font-display text-2xl">Historial de cambios</span>
            <span className="rounded-md border border-border px-3 py-1.5 text-sm font-medium">
              <span className="group-open:hidden">View history ({changeHistory.length})</span>
              <span className="hidden group-open:inline">Hide history</span>
            </span>
          </summary>
          <p className="mt-3 text-sm text-muted-foreground">Who changed each field of the guía, when, and from which value to which. The last 25.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5">When</th>
                  <th className="px-2 py-1.5">Who</th>
                  <th className="px-2 py-1.5">Campo</th>
                  <th className="px-2 py-1.5">Before</th>
                  <th className="px-2 py-1.5">After</th>
                  <th className="px-2 py-1.5">Origen</th>
                </tr>
              </thead>
              <tbody>
                {changeHistory.map((entry) => (
                  <tr key={entry.id} className="border-b border-border align-top last:border-0">
                    <td className="whitespace-nowrap px-2 py-1.5">{formatNy(entry.createdAt)}</td>
                    <td className="px-2 py-1.5">{entry.changedBy}</td>
                    <td className="px-2 py-1.5">{guiaFieldLabel(entry.field)}</td>
                    <td className="max-w-[16rem] truncate px-2 py-1.5">{entry.oldValue || "—"}</td>
                    <td className="max-w-[16rem] truncate px-2 py-1.5">{entry.newValue || "—"}</td>
                    <td className="px-2 py-1.5">{entry.source === "receipt" ? "Warehouse receipt" : entry.source === "reset" ? "Reset from WR" : "By hand"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </div>
  );
}
