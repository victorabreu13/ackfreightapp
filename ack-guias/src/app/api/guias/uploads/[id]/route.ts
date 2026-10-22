import { NextResponse } from "next/server";
import { canReadGuias, isCompanyAccounting } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { downloadDriveFile } from "@/lib/guias/drive";
import { UPLOAD_KIND, contentDisposition, uploadMissingPage } from "@/lib/guias/upload-rules";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || !canReadGuias(user)) {
    return new NextResponse("Solo el equipo puede descargar este archivo.", {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
    });
  }
  const { id } = await context.params;
  const row = await prisma.guiaDocument.findUnique({ where: { id }, include: { file: true } });
  if (!row || row.kind !== UPLOAD_KIND || row.source !== "upload" || (!row.file && !row.driveFileId) || (isCompanyAccounting(user) && row.company.toLowerCase() !== (user.agentKey ?? "").toLowerCase())) {
    return new NextResponse(uploadMissingPage(row?.guiaId ?? null), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
    });
  }
  try {
    const bytes = row.file ? Buffer.from(row.file.bytes) : await downloadDriveFile({ fileId: row.driveFileId ?? "" });
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": row.mime || "application/octet-stream",
        "Content-Disposition": contentDisposition(row.fileName),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Guía upload download", error);
    return new NextResponse(uploadMissingPage(row.guiaId), {
      status: 502,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
    });
  }
}
