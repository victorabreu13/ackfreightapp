"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageGuias, isAdmin } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadCompany } from "@/lib/guias/company";
import { backupStoredDocument, guiaAwbFolder, importGuiaPdf, parseImport, publishRenderedPdf } from "@/lib/guias/document-log";
import { guiaBillToName } from "@/lib/guias/guia-client";
import { GUIA_FILE_KINDS, guiaFileName, renderGuiaPdf, type GuiaFileKind } from "@/lib/guias/files";

function text(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function documentsRedirect(query: string): never {
  redirect(query ? `/guias/documents?${query}` : "/guias/documents");
}

export async function importGuiaDocument(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) documentsRedirect(`importError=${encodeURIComponent("Import is for admins")}`);
  const file = formData.get("file");
  if (!(file instanceof File)) documentsRedirect(`importError=${encodeURIComponent("Upload a PDF")}`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const parsed = parseImport({
    client: text(formData.get("client")),
    awb: text(formData.get("awb")),
    kind: text(formData.get("kind")),
    company: text(formData.get("company")),
    fileName: file.name,
    bytes,
  });
  if (!parsed.ok) documentsRedirect(`importError=${encodeURIComponent(parsed.error)}`);
  const saved = await importGuiaPdf({ ...parsed.value, generatedBy: user.email });
  revalidatePath("/guias/documents");
  if (saved.guiaId) revalidatePath(`/guias/${saved.guiaId}`);
  if (saved.status === "FAILED") {
    documentsRedirect(`imported=failed&importError=${encodeURIComponent(saved.error ?? "Drive upload failed")}`);
  }
  documentsRedirect("imported=1");
}

export async function retryGuiaDocument(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canManageGuias(user)) documentsRedirect(`importError=${encodeURIComponent("Only the ACK team can retry a document")}`);
  const id = text(formData.get("id"));
  const row = await prisma.guiaDocument.findUnique({ where: { id } });
  if (!row) documentsRedirect(`importError=${encodeURIComponent("Document not found")}`);
  const stored = await prisma.guiaDocumentFile.findUnique({ where: { documentId: row.id }, select: { documentId: true } });
  if (stored) {
    const backup = await backupStoredDocument(row.id);
    revalidatePath("/guias/documents");
    if (!backup.ok || backup.status === "FAILED") {
      documentsRedirect(`imported=failed&importError=${encodeURIComponent(backup.ok ? (backup.error ?? "Drive upload failed") : backup.error)}`);
    }
    documentsRedirect("retried=1");
  }
  if (!row.guiaId || row.source !== "generated" || !GUIA_FILE_KINDS.includes(row.kind as GuiaFileKind)) {
    documentsRedirect(`importError=${encodeURIComponent("Upload that PDF again from Import")}`);
  }
  const document = await prisma.airWaybillDocument.findUnique({
    where: { id: row.guiaId },
    include: { lines: { orderBy: { sortOrder: "asc" } }, agent: true, guiaClient: true },
  });
  if (!document || document.product !== "guia" || document.agentKey !== "ack") {
    documentsRedirect(`importError=${encodeURIComponent("Guía not found")}`);
  }
  try {
    const company = await loadCompany("ack");
    const master = "";
    const bytes = await renderGuiaPdf(row.kind as GuiaFileKind, document, company, {
      email: user.email,
      name: user.name,
      trucker: document.truckerName,
      truckerPhone: document.truckerPhone,
      seal: document.seal,
      driver: document.driverName,
    });
    const saved = await publishRenderedPdf({
      guiaId: document.id,
      client: guiaBillToName(document) || row.client,
      awb: guiaAwbFolder(document.awb, document.id),
      company: document.agentKey,
      kind: row.kind,
      fileName: row.fileName || guiaFileName(row.kind as GuiaFileKind, document.awb, master),
      bytes,
      generatedBy: user.email,
    });
    revalidatePath("/guias/documents");
    revalidatePath(`/guias/${document.id}`);
    if (saved.status === "FAILED") {
      documentsRedirect(`imported=failed&importError=${encodeURIComponent(saved.error ?? "Drive upload failed")}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not retry that document";
    documentsRedirect(`importError=${encodeURIComponent(message)}`);
  }
  documentsRedirect("retried=1");
}

/**
 * Removes from Documentos the documents of an AWB whose guía no longer exists, and gives its number back to stock.
 * Admin only. It does nothing for an AWB that a guía still uses.
 */
export async function removeOrphanDocuments(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) documentsRedirect(`importError=${encodeURIComponent("Only an admin can remove documents")}`);
  const awb = text(formData.get("awb"));
  if (!awb) documentsRedirect(`importError=${encodeURIComponent("Falta el AWB")}`);
  const inUse = await prisma.airWaybillDocument.findFirst({ where: { awb }, select: { id: true } });
  if (inUse) documentsRedirect(`importError=${encodeURIComponent(`La guía ${awb} todavía existe. Elimínala desde la lista de Guías.`)}`);
  const [removed, stock] = await prisma.$transaction([
    prisma.guiaDocument.deleteMany({ where: { guiaId: null, awb } }),
    prisma.awbStockNumber.updateMany({ where: { awb, documentId: null, status: { not: "available" } }, data: { status: "available" } }),
  ]);
  revalidatePath("/guias/documents");
  documentsRedirect(
    `removed=${encodeURIComponent(`${awb}: ${removed.count} ${removed.count === 1 ? "documento eliminado" : "documentos eliminados"}.${stock.count ? " El número AWB volvió al stock." : ""}`)}`,
  );
}
