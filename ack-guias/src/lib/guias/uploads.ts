import { prisma } from "@/lib/db";
import { guiaAwbFolder, saveDocumentLog, uploadOutcome } from "@/lib/guias/document-log";
import { trashDriveFile, uploadDrivePdf, type DriveFetch } from "@/lib/guias/drive";
import {
  UPLOAD_KIND,
  canDeleteGuiaUpload,
  uploadFailureMessage,
} from "@/lib/guias/upload-rules";

export async function storeGuiaUpload(input: {
  guiaId: string;
  client: string;
  awb: string;
  company: string;
  fileName: string;
  mime: string;
  size: number;
  bytes: Buffer;
  uploadedBy: string;
  rootId?: string;
  libraryName?: string;
  fetchImpl?: DriveFetch;
  serviceAccountJson?: string;
}) {
  const client = input.client.trim() || "No client";
  const awb = input.awb.trim() || guiaAwbFolder("", input.guiaId);
  let outcome: ReturnType<typeof uploadOutcome>;
  try {
    const uploaded = await uploadDrivePdf({
      rootId: input.rootId ?? process.env.ACK_GUIAS_DRIVE_ROOT_ID?.trim() ?? "",
      libraryName: input.libraryName,
      clientName: client,
      awbFolder: awb,
      fileName: input.fileName,
      bytes: input.bytes,
      mime: input.mime,
      fetchImpl: input.fetchImpl,
      serviceAccountJson: input.serviceAccountJson,
    });
    outcome = uploadOutcome(uploaded, null);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Drive upload failed";
    outcome = uploadOutcome(null, message);
  }
  const saved = await saveDocumentLog({
    source: "upload",
    guiaId: input.guiaId,
    client,
    awb,
    company: input.company,
    kind: UPLOAD_KIND,
    fileName: input.fileName,
    generatedBy: input.uploadedBy,
    mime: input.mime,
    size: input.size,
    bytes: input.bytes,
    ...outcome,
    error: outcome.status === "FAILED" ? uploadFailureMessage(outcome.error) : null,
  });
  return saved;
}

export async function deleteUploadedFile(input: {
  id: string;
  actor: { role: string; email: string };
  fetchImpl?: DriveFetch;
  serviceAccountJson?: string;
}): Promise<{ ok: true; guiaId: string | null } | { ok: false; error: string; guiaId: string | null }> {
  const row = await prisma.guiaDocument.findUnique({ where: { id: input.id } });
  if (!row || row.kind !== UPLOAD_KIND || row.source !== "upload") {
    return { ok: false, error: "File not found.", guiaId: row?.guiaId ?? null };
  }
  if (!canDeleteGuiaUpload(input.actor, row.generatedBy)) {
    return { ok: false, error: "Only the team or whoever uploaded the file can delete it.", guiaId: row.guiaId };
  }
  if (row.driveFileId) {
    try {
      await trashDriveFile({
        fileId: row.driveFileId,
        fetchImpl: input.fetchImpl,
        serviceAccountJson: input.serviceAccountJson,
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      if (!/HTTP 404/.test(message)) {
        return { ok: false, error: "The file could not be deleted in Drive. It stays on the guía.", guiaId: row.guiaId };
      }
    }
  }
  await prisma.guiaDocument.delete({ where: { id: row.id } });
  return { ok: true, guiaId: row.guiaId };
}
