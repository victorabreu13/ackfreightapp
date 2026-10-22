/** Team file attached to a guía. Not a generated PDF kind. */
export const UPLOAD_KIND = "UPLOAD";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  zip: "application/zip",
};

export function safeUploadFileName(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 180) || "archivo";
}

export function mimeForUpload(fileName: string, declared: string): string {
  const given = declared.split(";")[0]?.trim().toLowerCase() ?? "";
  if (given && given !== "application/octet-stream") return given;
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return MIME_BY_EXT[ext] ?? (given || "application/octet-stream");
}

export function acceptUpload(input: { name: string; type: string; byteLength: number }):
  | { ok: true; fileName: string; mime: string; size: number }
  | { ok: false; error: string } {
  const fileName = safeUploadFileName(input.name);
  if (input.byteLength <= 0) return { ok: false, error: `«${fileName}» está vacío.` };
  if (input.byteLength > MAX_UPLOAD_BYTES) return { ok: false, error: `«${fileName}» supera 20 MB.` };
  return { ok: true, fileName, mime: mimeForUpload(fileName, input.type), size: input.byteLength };
}

export function formatBytes(size: number | null | undefined): string {
  if (size == null || size < 0) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  const mb = size / (1024 * 1024);
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

/** Delete is for Admin or Operations, or the person who uploaded the file. */
export function canDeleteGuiaUpload(user: { role: string; email: string }, uploadedBy: string): boolean {
  if (user.role === "ADMIN" || user.role === "OPERATIONS" || user.role === "TEAM") return true;
  const owner = uploadedBy.trim().toLowerCase();
  return Boolean(owner) && user.email.trim().toLowerCase() === owner;
}

export function safeGuiaReturn(value: string, fallback: string): string {
  const path = value.trim();
  if (!path.startsWith("/guias")) return fallback;
  if (path.startsWith("//") || path.includes("\\") || path.includes("://")) return fallback;
  if (/[\u0000-\u001f]/.test(path)) return fallback;
  return path;
}

export function contentDisposition(fileName: string): string {
  const safe = safeUploadFileName(fileName);
  const ascii = safe.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export function uploadFailureMessage(error: string | null | undefined): string {
  const text = error?.trim() ?? "";
  if (!text || text === "Drive is not configured" || text === "Drive upload failed") {
    return "Drive no está configurado. El archivo quedó registrado en la guía.";
  }
  return `No se pudo subir a Drive. ${text}`;
}

export function uploadMissingPage(guiaId: string | null): string {
  const id = (guiaId ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
  const back = id ? `/guias/${id}` : "/guias/documents";
  const label = id ? "Volver a la guía" : "Volver a Documentos";
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>No se encontró el archivo</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; max-width: 36rem; margin: 4rem auto; padding: 0 1.25rem; color: #1c1917; }
  a { color: #1a3848; }
</style>
</head>
<body>
  <h1>No se encontró el archivo</h1>
  <p>Ese archivo no está en Drive, o ya se eliminó. Sigue en la guía solo si la subida quedó registrada.</p>
  <p><a href="${back}">${label}</a></p>
</body>
</html>
`;
}
