import { GUIA_FILE_KINDS, type GuiaFileKind } from "@/lib/guias/files";
import { UPLOAD_KIND } from "@/lib/guias/upload-rules";

export { UPLOAD_KIND };

export const GUIA_FILE_LABELS: Record<GuiaFileKind, string> = {
  awb: "AWB (12 pages)",
  delivery: "Delivery order",
  pickup: "Pickup order",
  tsa: "TSA letter",
  "tsa-unknown": "TSA unknown shipper",
  ccsp: "CCSF certificate",
  "ccsf-alternate": "CCSP certification",
  lithium: "Lithium battery letter",
  labels: "Magaya labels",
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
