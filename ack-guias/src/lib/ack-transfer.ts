/** Shape of the one-time ACK export. No file bytes, no tokens, no users, no other issuer. */

export const ACK_AGENT_KEY = "ack";
export const ACK_LEGAL_NAME = "ACK TEAM LLC";
export const ACK_STOCK_PREFIXES = ["045", "810"] as const;

export type AckExportFile = {
  version: 1;
  issuer: typeof ACK_LEGAL_NAME;
  guias: Array<Record<string, unknown>>;
  lines: Array<Record<string, unknown>>;
  clients: Array<Record<string, unknown>>;
  rates: Array<Record<string, unknown>>;
  stock: Array<Record<string, unknown>>;
  documents: Array<Record<string, unknown>>;
  driveFiles: Array<Record<string, unknown>>;
};

const GUIA_FIELDS = [
  "id",
  "agentKey",
  "awb",
  "prefix",
  "serial",
  "shipperName",
  "shipperAddress",
  "shipperAccount",
  "consigneeName",
  "consigneeAddress",
  "consigneeAccount",
  "carrierName",
  "carrierAddress",
  "accountNo",
  "referenceNumber",
  "departure",
  "to1",
  "by1",
  "to2",
  "by2",
  "to3",
  "by3",
  "currency",
  "chgsCode",
  "wtVal",
  "otherPpc",
  "declaredCarriage",
  "declaredCustoms",
  "destination",
  "flightDate",
  "insurance",
  "handling",
  "aesItn",
  "sci",
  "destCountry",
  "hawb",
  "otherChargesText",
  "accountingInfo",
  "weightCharge",
  "valuationCharge",
  "taxCharge",
  "otherDueAgent",
  "otherDueCarrier",
  "shipperSignature",
  "executedOn",
  "executedAt",
  "carrierSignature",
  "status",
  "threadId",
  "createdBy",
  "product",
  "guiaClientId",
  "clientLabel",
  "notifyName",
  "notifyAddress",
  "flightNumber",
  "truckerName",
  "truckerPhone",
  "driverName",
  "seal",
  "reviewJson",
  "snippetJson",
  "createdAt",
  "updatedAt",
  "invoiceNumber",
  "invoiceDate",
  "invoiceAmount",
  "invoicedAt",
  "invoicedBy",
  "qboInvoiceId",
  "qboDocNumber",
  "qboRealmId",
  "qboClaimedAt",
] as const;

const LINE_FIELDS = [
  "id",
  "documentId",
  "pieces",
  "grossWeight",
  "kgLb",
  "rateClass",
  "commodity",
  "chargeableWeight",
  "rate",
  "total",
  "nature",
  "length",
  "width",
  "height",
  "dimUnit",
  "sortOrder",
] as const;

const CLIENT_FIELDS = ["id", "agentKey", "name", "normalizedName", "createdAt", "updatedAt"] as const;
const RATE_FIELDS = ["id", "agentKey", "guiaClientId", "ratePerKg", "currency", "updatedBy", "updatedAt"] as const;
const STOCK_FIELDS = ["id", "prefix", "serial", "awb", "agentKey", "status", "documentId", "createdAt"] as const;
const DOCUMENT_FIELDS = [
  "id",
  "guiaId",
  "client",
  "awb",
  "company",
  "kind",
  "fileName",
  "driveFileId",
  "driveUrl",
  "status",
  "error",
  "generatedAt",
  "generatedBy",
  "source",
  "mime",
  "size",
] as const;
const DRIVE_FIELDS = ["id", "documentId", "kind", "fileName", "driveFileId", "driveUrl", "error", "updatedAt"] as const;

function pick(row: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in row) out[field] = row[field];
  }
  return out;
}

function rows(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object");
}

export function emptyAckExport(): AckExportFile {
  return {
    version: 1,
    issuer: ACK_LEGAL_NAME,
    guias: [],
    lines: [],
    clients: [],
    rates: [],
    stock: [],
    documents: [],
    driveFiles: [],
  };
}

/** Keep ACK guía rows only. Drop shipment, client-book, token, and byte fields. */
export function shapeAckExport(input: {
  guias: unknown;
  lines: unknown;
  clients: unknown;
  rates: unknown;
  stock: unknown;
  documents: unknown;
  driveFiles: unknown;
}): AckExportFile {
  const guias = rows(input.guias)
    .filter((row) => row.product === "guia" && row.agentKey === ACK_AGENT_KEY)
    .map((row) => pick(row, GUIA_FIELDS));
  const ids = new Set(guias.map((row) => String(row.id)));
  const clientIds = new Set(guias.map((row) => row.guiaClientId).filter((id): id is string => typeof id === "string" && id.length > 0));
  const clients = rows(input.clients)
    .filter((row) => row.agentKey === ACK_AGENT_KEY && clientIds.has(String(row.id)))
    .map((row) => pick(row, CLIENT_FIELDS));
  const keptClients = new Set(clients.map((row) => String(row.id)));
  return {
    version: 1,
    issuer: ACK_LEGAL_NAME,
    guias,
    lines: rows(input.lines)
      .filter((row) => ids.has(String(row.documentId)))
      .map((row) => pick(row, LINE_FIELDS)),
    clients,
    rates: rows(input.rates)
      .filter((row) => row.agentKey === ACK_AGENT_KEY && keptClients.has(String(row.guiaClientId)))
      .map((row) => pick(row, RATE_FIELDS)),
    stock: rows(input.stock)
      .filter((row) => row.agentKey === ACK_AGENT_KEY && ACK_STOCK_PREFIXES.includes(String(row.prefix) as (typeof ACK_STOCK_PREFIXES)[number]))
      .map((row) => pick(row, STOCK_FIELDS)),
    documents: rows(input.documents)
      .filter((row) => ids.has(String(row.guiaId ?? "")) || row.company === ACK_AGENT_KEY)
      .map((row) => pick(row, DOCUMENT_FIELDS)),
    driveFiles: rows(input.driveFiles)
      .filter((row) => ids.has(String(row.documentId)))
      .map((row) => pick(row, DRIVE_FIELDS)),
  };
}

export type AckImportPlan = {
  guias: Array<Record<string, unknown>>;
  lines: Array<Record<string, unknown>>;
  clients: Array<Record<string, unknown>>;
  rates: Array<Record<string, unknown>>;
  stock: Array<Record<string, unknown>>;
  documents: Array<Record<string, unknown>>;
  driveFiles: Array<Record<string, unknown>>;
  refusedGuias: number;
  skippedStock: number;
};

/** Idempotent import plan. AWB numbers and ids are copied. Other issuers and other prefixes are dropped. */
export function planAckImport(file: AckExportFile): AckImportPlan {
  const refused = file.guias.filter((row) => row.agentKey !== ACK_AGENT_KEY || row.product !== "guia");
  const shaped = shapeAckExport(file);
  const guiaIds = new Set(shaped.guias.map((row) => String(row.id)));
  const stock = shaped.stock.map((row) => ({
    ...row,
    documentId: row.documentId && guiaIds.has(String(row.documentId)) ? row.documentId : null,
  }));
  const skippedStock = file.stock.filter(
    (row) => row.agentKey !== ACK_AGENT_KEY || !ACK_STOCK_PREFIXES.includes(String(row.prefix) as (typeof ACK_STOCK_PREFIXES)[number]),
  ).length;
  return {
    guias: shaped.guias,
    lines: shaped.lines,
    clients: shaped.clients,
    rates: shaped.rates,
    stock,
    documents: shaped.documents.filter((row) => !row.guiaId || guiaIds.has(String(row.guiaId))),
    driveFiles: shaped.driveFiles,
    refusedGuias: refused.length,
    skippedStock,
  };
}

export function exportCounts(file: AckExportFile) {
  return {
    guias: file.guias.length,
    lines: file.lines.length,
    clients: file.clients.length,
    rates: file.rates.length,
    stock: file.stock.length,
    documents: file.documents.length,
    driveFiles: file.driveFiles.length,
    withAesItn: file.guias.filter((row) => String(row.aesItn ?? "").trim().length > 0).length,
  };
}

export function redactDatabaseUrl(message: string, url: string | undefined): string {
  let text = message;
  if (url) text = text.split(url).join("[redacted]");
  return text.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]");
}
