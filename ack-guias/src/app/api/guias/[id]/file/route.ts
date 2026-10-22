import { NextResponse } from "next/server";
import { canReadGuias, guiaWhere } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadCompany } from "@/lib/guias/company";
import { guiaAwbFolder, publishRenderedPdf } from "@/lib/guias/document-log";
import { GUIA_FILE_KINDS, guiaFileName, renderGuiaPdf, type GuiaFileKind, type GuiaPrintOptions, type GuiaRecord } from "@/lib/guias/files";
import type { CompanyView } from "@/lib/guias/company-profile";
import { draftPrintPage } from "@/lib/guias/draft-print-page";
import { guiaBillToName } from "@/lib/guias/guia-client";
import { zipStored } from "@/lib/guias/zip";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || !canReadGuias(user)) return NextResponse.json({ error: "Team only." }, { status: 401 });
  const { id } = await context.params;
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind") ?? "";
  const draft = params.get("draft") === "1" && (kind === "awb" || kind === "labels");
  const labelAwb = (params.get("awb") ?? "").replace(/[^0-9-]/g, "");
  const document = await prisma.airWaybillDocument.findFirst({
    where: { id, ...guiaWhere(user) },
    include: { lines: { orderBy: { sortOrder: "asc" } }, agent: true, guiaClient: true },
  });
  if (!document || document.product !== "guia" || document.agentKey !== "ack") {
    return NextResponse.json({ error: "Guía not found." }, { status: 404 });
  }
  const company = await loadCompany("ack").catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown issuing company";
    return message;
  });
  if (typeof company === "string") return NextResponse.json({ error: company }, { status: 400 });
  const master = "";
  const printOptions = (masterLabel = false): GuiaPrintOptions => ({
    email: user.email,
    name: user.name,
    trucker: params.get("trucker") ?? document.truckerName,
    truckerPhone: params.get("truckerPhone") ?? document.truckerPhone,
    seal: params.get("seal") ?? document.seal,
    driver: params.get("driver") ?? document.driverName,
    masterLabel,
    draft,
    labelAwb,
  });
  if (kind === "all") {
    const packed = await packGuia(document, company, printOptions, master, user.email);
    const zipName = `GUIA ${document.awb.trim() || "DRAFT"} documentos.zip`;
    return new NextResponse(new Uint8Array(packed), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  if (!GUIA_FILE_KINDS.includes(kind as GuiaFileKind)) {
    return NextResponse.json({ error: "Unknown document." }, { status: 400 });
  }
  try {
    const masterLabel = params.get("master") === "1";
    const pdf = await renderGuiaPdf(kind as GuiaFileKind, document, company, printOptions(masterLabel));
    const base = guiaFileName(kind as GuiaFileKind, kind === "labels" && document.status !== "issued" ? labelAwb : document.awb, master, { masterLabel });
    const fileName = draft ? `DRAFT ${base}` : base;
    // A draft print is not a final document, so it is not saved to Documentos or Drive.
    if (!draft) await recordPdf(document, kind, fileName, pdf, user.email);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${params.get("download") === "1" ? "attachment" : "inline"}; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 500;
    const message = error instanceof Error ? error.message : "Could not render that document.";
    const code = Number.isFinite(status) ? status : 500;
    if (code === 409 && (kind === "awb" || kind === "labels")) {
      return new NextResponse(draftPrintPage(id), {
        status: 409,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
      });
    }
    return NextResponse.json({ error: message }, { status: code });
  }
}

async function recordPdf(document: GuiaRecord, kind: string, fileName: string, bytes: Buffer, email: string) {
  try {
    await publishRenderedPdf({
      guiaId: document.id,
      client: guiaBillToName(document) || "No client",
      awb: guiaAwbFolder(document.awb, document.id),
      company: document.agentKey,
      kind,
      fileName,
      bytes,
      generatedBy: email,
    });
  } catch (logError) {
    console.error("guia document log", logError);
  }
}

async function packGuia(
  document: GuiaRecord,
  company: CompanyView,
  printOptions: (masterLabel?: boolean) => GuiaPrintOptions,
  master: string,
  email: string,
): Promise<Buffer> {
  const files: Array<{ name: string; data: Buffer }> = [];
  const errors: string[] = [];
  for (const item of GUIA_FILE_KINDS) {
    try {
      const pdf = await renderGuiaPdf(item, document, company, printOptions(false));
      const fileName = guiaFileName(item, document.awb, master);
      files.push({ name: fileName, data: pdf });
      await recordPdf(document, item, fileName, pdf, email);
    } catch (error) {
      errors.push(`${item}: ${error instanceof Error ? error.message : "Could not render that document."}`);
    }
  }
  if (master) {
    try {
      const pdf = await renderGuiaPdf("labels", document, company, printOptions(true));
      const fileName = guiaFileName("labels", document.awb, master, { masterLabel: true });
      files.push({ name: fileName, data: pdf });
      await recordPdf(document, "labels", fileName, pdf, email);
    } catch (error) {
      errors.push(`master labels: ${error instanceof Error ? error.message : "Could not render that document."}`);
    }
  }
  if (errors.length) files.push({ name: "ERRORS.txt", data: Buffer.from(`${errors.join("\n")}\n`, "utf8") });
  return zipStored(files);
}
