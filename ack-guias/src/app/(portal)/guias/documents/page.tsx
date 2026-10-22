import Link from "next/link";
import { redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { DeleteUploadButton } from "@/components/guia-uploads";
import { MigrationPending } from "@/components/migration-pending";
import { canManageGuias, canReadGuias, isAdmin, isCompanyAccounting } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { filterLoggedDocuments, formatNy, GUIA_FILE_LABELS, groupDocumentsByClient, UPLOAD_KIND, UPLOAD_LABEL, type LoggedDocument } from "@/lib/guias/documents-index";
import { GUIA_FILE_KINDS } from "@/lib/guias/files";
import { canDeleteGuiaUpload } from "@/lib/guias/upload-rules";
import { isPendingMigration, logMigrationError } from "@/lib/guias/migration-error";
import { importGuiaDocument, retryGuiaDocument } from "@/server/guia-document-actions";

/** Client folders per page. */
const PAGE_SIZE = 10;

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function pageHref(filters: Record<string, string | undefined>, page: number) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) search.set(key, value);
  }
  if (page > 1) search.set("page", String(page));
  const query = search.toString();
  return query ? `/guias/documents?${query}` : "/guias/documents";
}

export default async function GuiaDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!canReadGuias(user)) redirect("/guias?error=Only%20the%20ACK%20team%20can%20open%20documents");
  const accountingCompany = isCompanyAccounting(user) ? user.agentKey ?? "" : "";
  const params = await searchParams;
  const filters = {
    kind: one(params, "kind"),
    client: one(params, "client"),
    company: accountingCompany || one(params, "company"),
    awb: one(params, "awb"),
    from: one(params, "from"),
    to: one(params, "to"),
  };
  const requestedPage = Math.max(1, Number(one(params, "page") ?? "1") || 1);
  const admin = isAdmin(user);
  const notice = one(params, "importError");
  const imported = one(params, "imported");
  const retried = one(params, "retried");
  const uploadError = one(params, "uploadError");
  const uploadFlag = one(params, "upload");

  let rows: LoggedDocument[] = [];
  let clients: string[] = [];
  try {
    const logged = await prisma.guiaDocument.findMany({
      where: accountingCompany ? { company: { equals: accountingCompany, mode: "insensitive" } } : {},
      orderBy: { generatedAt: "desc" },
    });
    const indexed: LoggedDocument[] = logged.map((row) => ({
      id: row.id,
      guiaId: row.guiaId,
      client: row.client,
      awb: row.awb,
      company: row.company,
      kind: row.kind,
      fileName: row.fileName,
      driveUrl: row.driveUrl,
      driveFileId: row.driveFileId,
      mime: row.mime,
      size: row.size,
      status: row.status,
      error: row.error,
      generatedAt: row.generatedAt,
      generatedBy: row.generatedBy,
      source: row.source,
    }));
    clients = [...new Set(indexed.map((row) => row.client))].sort((left, right) => left.localeCompare(right));
    rows = filterLoggedDocuments(indexed, filters);
  } catch (caught) {
    if (!isPendingMigration(caught)) throw caught;
    logMigrationError("/guias/documents", caught);
    return <MigrationPending />;
  }

  const folders = groupDocumentsByClient(rows);
  const pages = Math.max(1, Math.ceil(folders.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pages);
  const visible = folders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const guiaFiltered = Boolean(filters.awb?.trim());

  return (
    <div className="space-y-6">
      <div>
        <GuiaEyebrow />
        <h1 className="font-display text-4xl">Documentos</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {accountingCompany
            ? "Solo los documentos de tu empresa."
            : "Every PDF Guías generates is saved here and uploaded to Drive under ACK Guías / client / AWB. Files the team uploads on a guía are listed too, under type Archivo. A failed upload stays on this list so it can be retried."}
        </p>
      </div>
      {uploadFlag === "deleted" ? <p className="text-sm text-muted-foreground">Archivo eliminado.</p> : null}
      {uploadError ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{uploadError}</p> : null}
      {imported === "1" ? <p className="text-sm text-muted-foreground">Imported and uploaded to Drive.</p> : null}
      {retried === "1" ? <p className="text-sm text-muted-foreground">Retried and uploaded to Drive.</p> : null}
      {imported === "failed" ? (
        <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">Saved with status FAILED. {notice}</p>
      ) : notice ? (
        <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{notice}</p>
      ) : null}
      {admin ? (
        <form action={importGuiaDocument} className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="md:col-span-2 lg:col-span-3">
            <h2 className="font-display text-2xl">Import a PDF</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Admins can backfill an existing file. The original file name is kept in Drive.
            </p>
          </div>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Client</span>
            <input name="client" required className="block h-10 w-full rounded-md border border-input bg-background px-3" placeholder="PINTO INTERNATIONAL LOGISTICS" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">AWB</span>
            <input name="awb" required className="block h-10 w-full rounded-md border border-input bg-background px-3" placeholder="729-95048310" />
          </label>
          <input type="hidden" name="company" value="ack" />
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Type</span>
            <select name="kind" required defaultValue="awb" className="block h-10 w-full rounded-md border border-input bg-background px-3">
              {GUIA_FILE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {GUIA_FILE_LABELS[kind]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="text-muted-foreground">PDF</span>
            <input name="file" type="file" accept="application/pdf,.pdf" required className="block w-full text-sm" />
          </label>
          <div className="md:col-span-2 lg:col-span-3">
            <button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
              Import
            </button>
          </div>
        </form>
      ) : null}
      <form action="/guias/documents" className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-2 lg:grid-cols-6">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Type</span>
          <select name="kind" defaultValue={filters.kind ?? ""} className="block h-10 w-full rounded-md border border-input bg-background px-3">
            <option value="">All types</option>
            {GUIA_FILE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {GUIA_FILE_LABELS[kind]}
              </option>
            ))}
            <option value={UPLOAD_KIND}>{UPLOAD_LABEL}</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Client</span>
          <select name="client" defaultValue={filters.client ?? ""} className="block h-10 w-full rounded-md border border-input bg-background px-3">
            <option value="">All clients</option>
            {clients.map((client) => (
              <option key={client} value={client}>
                {client}
              </option>
            ))}
          </select>
        </label>
        <input type="hidden" name="company" value="ack" />
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">AWB</span>
          <input name="awb" defaultValue={filters.awb ?? ""} placeholder="729- or draft-" className="block h-10 w-full rounded-md border border-input bg-background px-3" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">From</span>
          <input name="from" type="date" defaultValue={filters.from ?? ""} className="block h-10 w-full rounded-md border border-input bg-background px-3" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">To</span>
          <input name="to" type="date" defaultValue={filters.to ?? ""} className="block h-10 w-full rounded-md border border-input bg-background px-3" />
        </label>
        <div className="md:col-span-2 lg:col-span-6">
          <button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
            Filter
          </button>
        </div>
      </form>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-4 py-10 text-sm text-muted-foreground">
          No documents yet. Open a file on a guía, issue it, or import a PDF.
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((folder) => (
            <details key={folder.client} open className="rounded-lg border border-border bg-card">
              <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 px-4 py-3">
                <span className="font-display text-2xl">{folder.client}</span>
                <span className="text-sm text-muted-foreground">
                  {folder.guias.length} {folder.guias.length === 1 ? "guía" : "guías"} · {folder.count} {folder.count === 1 ? "documento" : "documentos"}
                </span>
              </summary>
              <div className="space-y-2 border-t border-border px-3 py-3">
                {folder.guias.map((guia) => (
                  <details key={guia.key} open={guiaFiltered || folder.guias.length === 1} className="rounded-md border border-border bg-background">
                    <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 px-3 py-2">
                      <span className="font-medium">{guia.awb}</span>
                      {guia.guiaId ? (
                        <Link href={`/guias/${guia.guiaId}`} className="text-sm underline-offset-2 hover:underline">
                          Abrir guía
                        </Link>
                      ) : null}
                      <span className="text-sm text-muted-foreground">
                        {guia.documents.length} {guia.documents.length === 1 ? "documento" : "documentos"}
                      </span>
                    </summary>
                    <div className="overflow-x-auto border-t border-border">
                      <table className="w-full min-w-[900px] text-left text-sm">
                        <thead className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2">Type</th>
                            <th className="px-3 py-2">File</th>
                            <th className="px-3 py-2">Generated</th>
                            <th className="px-3 py-2">By</th>
                            <th className="px-3 py-2">Status</th>
                            <th className="px-3 py-2">Drive</th>
                            <th className="px-3 py-2">File</th>
                          </tr>
                        </thead>
                        <tbody>
                          {guia.documents.map((row) => {
                            const label = row.kind === UPLOAD_KIND ? UPLOAD_LABEL : (GUIA_FILE_LABELS[row.kind as keyof typeof GUIA_FILE_LABELS] ?? row.kind);
                            return (
                              <tr key={row.id} className="border-b border-border last:border-0 align-top">
                                <td className="px-3 py-2">{label}</td>
                                <td className="px-3 py-2 font-mono text-xs">{row.fileName}</td>
                                <td className="px-3 py-2">{formatNy(row.generatedAt)}</td>
                                <td className="px-3 py-2">{row.generatedBy}</td>
                                <td className="px-3 py-2">
                                  <span className={row.status === "FAILED" ? "text-stuck" : undefined}>{row.status}</span>
                                  {row.status === "FAILED" && row.error ? <span className="mt-1 block text-xs text-stuck">{row.error}</span> : null}
                                </td>
                                <td className="px-3 py-2">
                                  {row.driveUrl ? (
                                    <a className="underline-offset-2 hover:underline" href={row.driveUrl} target="_blank" rel="noreferrer">
                                      Open in Drive
                                    </a>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  {row.source === "upload" ? (
                                    <div className="flex flex-col items-start gap-1">
                                      {row.driveFileId ? (
                                        <a className="underline-offset-2 hover:underline" href={`/api/guias/uploads/${row.id}`}>
                                          Descargar
                                        </a>
                                      ) : (
                                        <span className="text-muted-foreground">Sin archivo</span>
                                      )}
                                      {canDeleteGuiaUpload(user, row.generatedBy) ? (
                                        <DeleteUploadButton id={row.id} fileName={row.fileName} returnTo={pageHref(filters, page)} />
                                      ) : null}
                                    </div>
                                  ) : row.guiaId && row.source === "generated" ? (
                                    <>
                                      <a className="underline-offset-2 hover:underline" href={`/api/guias/${row.guiaId}/file?kind=${row.kind}`} target="_blank" rel="noreferrer">
                                        Open
                                      </a>
                                      <span className="text-muted-foreground"> · </span>
                                      <a className="underline-offset-2 hover:underline" href={`/api/guias/${row.guiaId}/file?kind=${row.kind}&download=1`}>
                                        Download
                                      </a>
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground">Imported file</span>
                                  )}
                                  {row.status === "FAILED" && row.guiaId && row.source === "generated" && canManageGuias(user) ? (
                                    <form action={retryGuiaDocument} className="mt-2">
                                      <input type="hidden" name="id" value={row.id} />
                                      <button type="submit" className="underline-offset-2 hover:underline">
                                        Retry
                                      </button>
                                    </form>
                                  ) : null}
                                  {row.status === "FAILED" && admin && row.source === "import" ? (
                                    <form action={importGuiaDocument} className="mt-2 space-y-1">
                                      <input type="hidden" name="client" value={row.client} />
                                      <input type="hidden" name="awb" value={row.awb} />
                                      <input type="hidden" name="kind" value={row.kind} />
                                      <input type="hidden" name="company" value={row.company} />
                                      <input name="file" type="file" accept="application/pdf,.pdf" required className="block max-w-48 text-xs" />
                                      <button type="submit" className="underline-offset-2 hover:underline">
                                        Retry
                                      </button>
                                    </form>
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
      {pages > 1 ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {page > 1 ? (
            <Link href={pageHref(filters, page - 1)} className="underline-offset-2 hover:underline">
              Previous
            </Link>
          ) : null}
          <span className="text-muted-foreground">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={pageHref(filters, page + 1)} className="underline-offset-2 hover:underline">
              Next
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
