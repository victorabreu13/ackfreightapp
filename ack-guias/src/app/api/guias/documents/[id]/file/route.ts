import { NextResponse } from "next/server";
import { canReadGuias, isCompanyAccounting } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { contentDisposition, uploadMissingPage } from "@/lib/guias/upload-rules";

/** Serves the copy kept in the database. Rows saved before copies were kept fall back to drawing the document again. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || !canReadGuias(user)) {
    return new NextResponse("Solo el equipo puede abrir este archivo.", {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
    });
  }
  const { id } = await context.params;
  const row = await prisma.guiaDocument.findUnique({ where: { id }, include: { file: true } });
  const blocked = row && isCompanyAccounting(user) && row.company.toLowerCase() !== (user.agentKey ?? "").toLowerCase();
  if (!row || blocked) {
    return new NextResponse(uploadMissingPage(row?.guiaId ?? null), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
    });
  }
  const download = new URL(request.url).searchParams.get("download") === "1";
  if (!row.file) {
    if (row.source === "generated" && row.guiaId) {
      const target = new URL(`/api/guias/${row.guiaId}/file`, request.url);
      target.searchParams.set("kind", row.kind);
      if (download) target.searchParams.set("download", "1");
      return NextResponse.redirect(target);
    }
    return new NextResponse(uploadMissingPage(row.guiaId), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
    });
  }
  const mime = row.mime || "application/pdf";
  const disposition = download || mime !== "application/pdf" ? contentDisposition(row.fileName) : contentDisposition(row.fileName).replace(/^attachment/, "inline");
  return new NextResponse(new Uint8Array(row.file.bytes), {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": disposition,
      "Cache-Control": "private, no-store",
    },
  });
}
