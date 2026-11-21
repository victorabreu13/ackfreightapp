import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { downloadDriveFile } from "@/lib/guias/drive";
import { UPLOAD_KIND, contentDisposition, isCategoryUpload } from "@/lib/guias/upload-rules";

/**
 * The commercial invoice or the manifest uploaded to a guía, for the client that owns the guía. Any other file the team
 * uploaded (signed DGD, internal papers) is not shown to the client.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || user.role !== "CUSTOMER" || !user.clientId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await context.params;
  const row = await prisma.guiaDocument.findFirst({
    where: { id, kind: UPLOAD_KIND, source: "upload", guia: { product: "guia", status: "issued", agentKey: "ack", guiaClientId: user.clientId } },
    include: { file: true },
  });
  if (!row || !isCategoryUpload("invoice", row.fileName) || (!row.file && !row.driveFileId)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const bytes = row.file ? Buffer.from(row.file.bytes) : await downloadDriveFile({ fileId: row.driveFileId ?? "" });
    const mime = row.mime || "application/octet-stream";
    const viewable = mime === "application/pdf" || mime.startsWith("image/");
    const disposition = contentDisposition(row.fileName);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": viewable ? disposition.replace(/^attachment/, "inline") : disposition,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("customer upload", error);
    return NextResponse.json({ error: "Could not open the file." }, { status: 502 });
  }
}
