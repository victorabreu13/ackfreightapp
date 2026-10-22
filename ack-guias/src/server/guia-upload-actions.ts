"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { guiaAwbFolder } from "@/lib/guias/document-log";
import { guiaBillToName } from "@/lib/guias/guia-client";
import { acceptUpload, safeGuiaReturn } from "@/lib/guias/upload-rules";
import { deleteUploadedFile, storeGuiaUpload } from "@/lib/guias/uploads";

function text(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function withQuery(path: string, query: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${query}`;
}

export async function uploadGuiaFiles(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canManageGuias(user)) redirect("/guias?error=Only%20the%20Kope%20team%20can%20change%20a%20gu%C3%ADa");
  const id = text(formData.get("id"));
  const back = `/guias/${id}`;
  const document = await prisma.airWaybillDocument.findUnique({
    where: { id },
    include: { guiaClient: true },
  });
  if (!document || document.product !== "guia") {
    redirect(`/guias?error=${encodeURIComponent("No se encontró la guía.")}`);
  }
  const files = formData.getAll("files").filter((item): item is File => item instanceof File);
  if (files.length === 0) {
    redirect(withQuery(back, `uploadError=${encodeURIComponent("Elige al menos un archivo.")}`));
  }
  const errors: string[] = [];
  let saved = 0;
  for (const file of files) {
    const accepted = acceptUpload({ name: file.name, type: file.type, byteLength: file.size });
    if (!accepted.ok) {
      errors.push(accepted.error);
      continue;
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const row = await storeGuiaUpload({
      guiaId: document.id,
      client: guiaBillToName(document) || "No client",
      awb: guiaAwbFolder(document.awb, document.id),
      company: document.agentKey,
      fileName: accepted.fileName,
      mime: accepted.mime,
      size: accepted.size,
      bytes,
      uploadedBy: user.email,
    });
    if (row.status === "FAILED") errors.push(`«${accepted.fileName}»: ${row.error ?? "No se pudo subir a Drive."}`);
    else saved += 1;
  }
  revalidatePath(back);
  revalidatePath("/guias/documents");
  if (saved === 0) {
    redirect(withQuery(back, `uploadError=${encodeURIComponent(errors.join(" ") || "No se pudo subir el archivo.")}`));
  }
  if (errors.length) {
    redirect(withQuery(back, `upload=partial&uploadError=${encodeURIComponent(errors.join(" "))}`));
  }
  redirect(withQuery(back, "upload=ok"));
}

export async function deleteGuiaUpload(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const id = text(formData.get("id"));
  const result = await deleteUploadedFile({ id, actor: user });
  const fallback = result.guiaId ? `/guias/${result.guiaId}` : "/guias/documents";
  const back = safeGuiaReturn(text(formData.get("returnTo")), fallback);
  if (result.guiaId) revalidatePath(`/guias/${result.guiaId}`);
  revalidatePath("/guias/documents");
  if (!result.ok) redirect(withQuery(back, `uploadError=${encodeURIComponent(result.error)}`));
  redirect(withQuery(back, "upload=deleted"));
}
