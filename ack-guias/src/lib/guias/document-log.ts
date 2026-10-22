import { prisma } from "@/lib/db";
import { driveLibraryName, driveRootId, uploadDrivePdf, type DriveFetch } from "@/lib/guias/drive";
import { GUIA_FILE_KINDS, type GuiaFileKind } from "@/lib/guias/files";

export type DocumentStatus = "UPLOADED" | "FAILED";
export type DocumentSource = "generated" | "import" | "upload";

export function guiaAwbFolder(awb: string, id: string): string {
  const trimmed = awb.trim();
  return trimmed || `draft-${id.slice(0, 8)}`;
}

export function companyKey(value: string): "ack" | null {
  const key = value.trim().toLowerCase().replace(/\./g, "");
  if (key === "ack" || key === "ack logistics" || key === "ack freight" || key === "ack team llc") return "ack";
  return null;
}

export function companyLabel(company: string): string {
  if (company === "ack") return "ACK";
  if (company === "kope") return "Kope";
  return company;
}

export function kindFromFileName(name: string): GuiaFileKind | null {
  const file = name.trim().toLowerCase();
  if (!file) return null;
  if (file.includes("lithium")) return "lithium";
  if (file.includes("tsa_unknown") || file.includes("tsa-unknown") || file.includes("unknown shipper") || file.includes("unknown-shipper")) {
    return "tsa-unknown";
  }
  if (file.endsWith("_ccsp.pdf") || file.includes("ccsf_alternate") || file.includes("ccsf-alternate") || file.includes("alternate")) return "ccsf-alternate";
  if (file.includes("ccsf") || file.includes("ccsp")) return "ccsp";
  if (file.startsWith("tsa_") || file.startsWith("tsa-") || file.includes("tsa letter")) return "tsa";
  if (file.startsWith("pickup")) return "pickup";
  if (file.startsWith("do_") || file.startsWith("do-") || file.includes("delivery")) return "delivery";
  if (file.startsWith("label") || file.includes("labels")) return "labels";
  if (file.startsWith("awb_") || file.startsWith("awb-") || file.includes("guia madre")) return "awb";
  return null;
}

export function resolveKind(kind: string, fileName: string): GuiaFileKind | null {
  const requested = kind.trim().toLowerCase();
  if ((GUIA_FILE_KINDS as readonly string[]).includes(requested)) return requested as GuiaFileKind;
  return kindFromFileName(requested) ?? kindFromFileName(fileName);
}

export function uploadOutcome(
  uploaded: { id: string; url: string } | null,
  error: string | null,
): { status: DocumentStatus; error: string | null; driveFileId: string | null; driveUrl: string | null } {
  if (uploaded?.id) {
    return { status: "UPLOADED", error: null, driveFileId: uploaded.id, driveUrl: uploaded.url };
  }
  return {
    status: "FAILED",
    error: error?.trim() || "Drive upload failed",
    driveFileId: null,
    driveUrl: null,
  };
}

export type LogIdentity = {
  source: DocumentSource;
  guiaId?: string | null;
  awb: string;
  company: string;
  kind: string;
  fileName: string;
};

export function logLookup(input: LogIdentity) {
  if ((input.source === "generated" || input.source === "upload") && input.guiaId) {
    return { source: input.source, guiaId: input.guiaId, kind: input.kind, fileName: input.fileName };
  }
  if (input.source === "upload") {
    return {
      source: "upload" as const,
      awb: input.awb,
      company: input.company,
      kind: input.kind,
      fileName: input.fileName,
    };
  }
  return {
    source: "import" as const,
    awb: input.awb,
    company: input.company,
    kind: input.kind,
    fileName: input.fileName,
  };
}

export function parseImport(input: {
  client: string;
  awb: string;
  kind: string;
  company: string;
  fileName: string;
  bytes: Uint8Array;
}):
  | {
      ok: true;
      value: { client: string; awb: string; company: "ack"; kind: GuiaFileKind; fileName: string; bytes: Buffer };
    }
  | { ok: false; error: string } {
  const client = input.client.replace(/\s+/g, " ").trim();
  const awb = input.awb.replace(/\s+/g, "").trim();
  if (!client) return { ok: false, error: "Client is required" };
  if (!awb) return { ok: false, error: "AWB is required" };
  const company = companyKey(input.company);
  if (!company) return { ok: false, error: "Company must be ACK" };
  const kind = resolveKind(input.kind, input.fileName);
  if (!kind) return { ok: false, error: "Choose a document type" };
  if (input.bytes.byteLength === 0) return { ok: false, error: "Upload a PDF" };
  const header = Buffer.from(input.bytes.subarray(0, 5)).toString("latin1");
  const namedPdf = input.fileName.trim().toLowerCase().endsWith(".pdf");
  if (!namedPdf && header !== "%PDF-") return { ok: false, error: "Upload a PDF" };
  const safeName = (input.fileName.replace(/[\\/]/g, " ").trim() || `${kind}.pdf`).replace(/\s+/g, " ");
  return {
    ok: true,
    value: {
      client,
      awb,
      company,
      kind,
      fileName: safeName.toLowerCase().endsWith(".pdf") ? safeName : `${safeName}.pdf`,
      bytes: Buffer.from(input.bytes),
    },
  };
}

export type DocumentLogInput = LogIdentity & {
  client: string;
  generatedBy: string;
  status: DocumentStatus;
  error?: string | null;
  driveFileId?: string | null;
  driveUrl?: string | null;
  mime?: string | null;
  size?: number | null;
};

export async function saveDocumentLog(input: DocumentLogInput) {
  const generatedAt = new Date();
  const driveFileId = input.driveFileId ?? null;
  const driveUrl = input.driveUrl ?? null;
  const measured = {
    ...(input.mime !== undefined ? { mime: input.mime } : {}),
    ...(input.size !== undefined ? { size: input.size } : {}),
  };
  return prisma.$transaction(async (tx) => {
    const existing = await tx.guiaDocument.findFirst({
      where: logLookup(input),
      orderBy: { generatedAt: "desc" },
    });
    const saved = existing
      ? await tx.guiaDocument.update({
          where: { id: existing.id },
          data: {
            guiaId: input.guiaId ?? existing.guiaId,
            client: input.client,
            awb: input.awb,
            company: input.company,
            kind: input.kind,
            fileName: input.fileName,
            status: input.status,
            error: input.error ?? null,
            generatedBy: input.generatedBy,
            generatedAt,
            source: input.source,
            ...measured,
            ...(driveFileId ? { driveFileId, driveUrl } : {}),
          },
        })
      : await tx.guiaDocument.create({
          data: {
            guiaId: input.guiaId ?? null,
            client: input.client,
            awb: input.awb,
            company: input.company,
            kind: input.kind,
            fileName: input.fileName,
            status: input.status,
            error: input.error ?? null,
            generatedBy: input.generatedBy,
            generatedAt,
            source: input.source,
            driveFileId,
            driveUrl,
            mime: input.mime ?? null,
            size: input.size ?? null,
          },
        });
    if (input.guiaId && input.source === "generated") {
      await tx.guiaDriveFile.upsert({
        where: { documentId_kind: { documentId: input.guiaId, kind: input.kind } },
        create: {
          documentId: input.guiaId,
          kind: input.kind,
          fileName: input.fileName,
          driveFileId,
          driveUrl,
          error: input.error ?? null,
        },
        update: {
          fileName: input.fileName,
          error: input.error ?? null,
          ...(driveFileId ? { driveFileId, driveUrl } : {}),
        },
      });
    }
    return saved;
  });
}

async function sendToDrive(input: {
  client: string;
  awb: string;
  fileName: string;
  bytes: Buffer;
  rootId?: string;
  libraryName?: string;
  fetchImpl?: DriveFetch;
  serviceAccountJson?: string;
}) {
  try {
    const uploaded = await uploadDrivePdf({
      rootId: input.rootId ?? driveRootId(),
      libraryName: input.libraryName,
      clientName: input.client,
      awbFolder: input.awb,
      fileName: input.fileName,
      bytes: input.bytes,
      fetchImpl: input.fetchImpl,
      serviceAccountJson: input.serviceAccountJson,
    });
    return uploadOutcome(uploaded, null);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Drive upload failed";
    return uploadOutcome(null, message);
  }
}

export async function publishRenderedPdf(input: {
  guiaId: string;
  client: string;
  awb: string;
  company: string;
  kind: string;
  fileName: string;
  bytes: Buffer;
  generatedBy: string;
  rootId?: string;
  libraryName?: string;
  fetchImpl?: DriveFetch;
  serviceAccountJson?: string;
}) {
  const client = input.client.trim() || "No client";
  const awb = input.awb.trim() || guiaAwbFolder("", input.guiaId);
  const outcome = await sendToDrive({ ...input, client, awb });
  const saved = await saveDocumentLog({
    source: "generated",
    guiaId: input.guiaId,
    client,
    awb,
    company: input.company,
    kind: input.kind,
    fileName: input.fileName,
    generatedBy: input.generatedBy,
    ...outcome,
  });
  return { ...outcome, id: saved.id };
}

export async function importGuiaPdf(input: {
  client: string;
  awb: string;
  company: "ack";
  kind: GuiaFileKind;
  fileName: string;
  bytes: Buffer;
  generatedBy: string;
  rootId?: string;
  libraryName?: string;
  fetchImpl?: DriveFetch;
  serviceAccountJson?: string;
}) {
  const guia = await prisma.airWaybillDocument.findFirst({
    where: { product: "guia", awb: input.awb, agentKey: input.company },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  const outcome = await sendToDrive(input);
  const saved = await saveDocumentLog({
    source: "import",
    guiaId: guia?.id ?? null,
    client: input.client,
    awb: input.awb,
    company: input.company,
    kind: input.kind,
    fileName: input.fileName,
    generatedBy: input.generatedBy,
    ...outcome,
  });
  return { ...outcome, id: saved.id, guiaId: guia?.id ?? null };
}
