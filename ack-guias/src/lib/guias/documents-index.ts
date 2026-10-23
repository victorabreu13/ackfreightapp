import { GUIA_FILE_KINDS, type GuiaFileKind } from "@/lib/guias/files";
import { UPLOAD_KIND } from "@/lib/guias/upload-rules";

export { UPLOAD_KIND };

export const GUIA_FILE_LABELS: Record<GuiaFileKind, string> = {
  checklist: "Shipment checklist",
  awb: "AWB (12 pages)",
  delivery: "Delivery order",
  pickup: "Pickup order",
  tsa: "TSA letter",
  "tsa-unknown": "TSA unknown shipper",
  ccsp: "CCSF certificate",
  "ccsf-alternate": "CCSP certification",
  lithium: "Lithium battery letter",
  labels: "Cargo Labels",
  "folder-label": "Folder label",
};

export const UPLOAD_LABEL = "Archivo";

export type LoggedDocument = {
  id: string;
  guiaId: string | null;
  client: string;
  awb: string;
  company: string;
  kind: string;
  fileName: string;
  driveUrl: string | null;
  status: string;
  error: string | null;
  generatedAt: Date;
  generatedBy: string;
  source: string;
  driveFileId?: string | null;
  mime?: string | null;
  size?: number | null;
  /** The file itself is saved in the database. */
  stored?: boolean;
};

export function nyDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatNy(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/** The day a record was created, in New York time, such as "Oct 22, 2026". */
export function formatNyDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "medium" }).format(date);
}

export function filterLoggedDocuments(
  rows: LoggedDocument[],
  query: { kind?: string; client?: string; company?: string; awb?: string; from?: string; to?: string },
): LoggedDocument[] {
  const requested = query.kind?.trim() ?? "";
  const known = requested === UPLOAD_KIND || GUIA_FILE_KINDS.some((item) => item === requested);
  const client = query.client?.trim().toLowerCase() ?? "";
  const company = query.company?.trim().toLowerCase() ?? "";
  const awb = query.awb?.trim().toLowerCase() ?? "";
  const from = query.from?.trim() ?? "";
  const to = query.to?.trim() ?? "";
  return rows
    .filter((row) => {
      if (requested && !known) return false;
      if (requested && row.kind !== requested) return false;
      if (client && row.client.toLowerCase() !== client) return false;
      if (company && row.company.toLowerCase() !== company) return false;
      if (awb && !row.awb.toLowerCase().includes(awb) && !row.fileName.toLowerCase().includes(awb)) return false;
      const day = nyDay(row.generatedAt);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    })
    .sort((left, right) => right.generatedAt.getTime() - left.generatedAt.getTime());
}

export type GuiaFolder = {
  key: string;
  awb: string;
  guiaId: string | null;
  documents: LoggedDocument[];
};

export type ClientFolder = {
  client: string;
  count: number;
  guias: GuiaFolder[];
};

function clientKey(client: string): string {
  return client.replace(/\s+/g, " ").trim().toLowerCase();
}

function kindRank(kind: string): number {
  const index = (GUIA_FILE_KINDS as readonly string[]).indexOf(kind);
  return index < 0 ? GUIA_FILE_KINDS.length : index;
}

/** Client folders A to Z. Inside each, one subfolder per guía (newest first) holding that guía's documents in print order. */
export function groupDocumentsByClient(rows: LoggedDocument[]): ClientFolder[] {
  const clients = new Map<string, { client: string; guias: Map<string, GuiaFolder> }>();
  for (const row of rows) {
    const key = clientKey(row.client) || "no client";
    let folder = clients.get(key);
    if (!folder) {
      folder = { client: row.client.replace(/\s+/g, " ").trim() || "No client", guias: new Map() };
      clients.set(key, folder);
    }
    const guiaKey = row.guiaId ?? `awb:${row.awb.trim().toLowerCase()}`;
    let guia = folder.guias.get(guiaKey);
    if (!guia) {
      guia = { key: guiaKey, awb: row.awb, guiaId: row.guiaId, documents: [] };
      folder.guias.set(guiaKey, guia);
    }
    guia.documents.push(row);
  }
  const latest = (guia: GuiaFolder) => Math.max(...guia.documents.map((row) => row.generatedAt.getTime()));
  return [...clients.values()]
    .map((folder) => {
      const guias = [...folder.guias.values()]
        .map((guia) => ({
          ...guia,
          documents: [...guia.documents].sort(
            (left, right) => kindRank(left.kind) - kindRank(right.kind) || right.generatedAt.getTime() - left.generatedAt.getTime(),
          ),
        }))
        .sort((left, right) => latest(right) - latest(left));
      return { client: folder.client, count: guias.reduce((sum, guia) => sum + guia.documents.length, 0), guias };
    })
    .sort((left, right) => left.client.localeCompare(right.client, "en", { sensitivity: "base" }));
}
