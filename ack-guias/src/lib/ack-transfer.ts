/** Shape of the one-time ACK export. No file bytes, no tokens, no users, no other issuer. */

import { createHash } from "node:crypto";
import { normalizeBillToName } from "@/lib/guias/guia-client";

export const ACK_AGENT_KEY = "ack";
export const ACK_LEGAL_NAME = "ACK TEAM LLC";
export const ACK_STOCK_PREFIXES = ["045", "810"] as const;

/** Columns the live Kope database may have. `agentKey` is optional on Client. */
export const KOPE_GUIA_COLUMNS = [
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
  "clientId",
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

export const KOPE_CLIENT_COLUMNS = [
  "id",
  "slug",
  "code",
  "name",
  "active",
  "repUserId",
  "createdAt",
  "updatedAt",
  "notifyEnabled",
  "notifyLanguage",
  "agentKey",
  "normalizedName",
] as const;

export const KOPE_RATE_COLUMNS = ["id", "agentKey", "clientId", "guiaClientId", "ratePerKg", "currency", "updatedBy", "updatedAt"] as const;
export const KOPE_PARTY_COLUMNS = ["id", "clientId", "role", "name", "address", "phone", "email", "createdAt", "updatedAt"] as const;
export const KOPE_LINE_COLUMNS = [
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
export const KOPE_STOCK_COLUMNS = ["id", "prefix", "serial", "awb", "agentKey", "status", "documentId", "createdAt"] as const;
export const KOPE_DOCUMENT_COLUMNS = [
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
export const KOPE_DRIVE_COLUMNS = ["id", "documentId", "kind", "fileName", "driveFileId", "driveUrl", "error", "updatedAt"] as const;

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Keep only columns information_schema reported. Never invent agentKey. */
export function columnsToSelect(existing: Iterable<string>, wanted: readonly string[]): string[] {
  const have = new Set(existing);
  return wanted.filter((column) => have.has(column) && IDENTIFIER.test(column));
}

export function quotedSelectList(columns: readonly string[]): string {
  if (columns.length === 0) throw new Error("No columns to select");
  if (columns.some((column) => !IDENTIFIER.test(column))) throw new Error("Refusing a column name that is not an identifier");
  return columns.map((column) => `"${column}"`).join(", ");
}

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
  /** Kope address-book rows for the clients ACK guías use. Import copies them onto blank guía party fields. */
  parties?: Array<Record<string, unknown>>;
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

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stableGuiaClientId(normalizedName: string): string {
  return `gc_${createHash("md5").update(`ack|${normalizedName}`).digest("hex").slice(0, 24)}`;
}

function partyOntoGuia(guia: Record<string, unknown>, party: Record<string, unknown>) {
  const role = text(party.role);
  const name = text(party.name);
  const address = text(party.address);
  if (!name && !address) return;
  if (role === "consignee") {
    if (!text(guia.consigneeName) && name) guia.consigneeName = name;
    if (!text(guia.consigneeAddress) && address) guia.consigneeAddress = address;
    return;
  }
  if (role === "notify") {
    if (!text(guia.notifyName) && name) guia.notifyName = name;
    if (!text(guia.notifyAddress) && address) guia.notifyAddress = address;
    return;
  }
  if (role === "shipper" || role === "") {
    if (!text(guia.shipperName) && name) guia.shipperName = name;
    if (!text(guia.shipperAddress) && address) guia.shipperAddress = address;
  }
}

/**
 * Live Kope stores bill-to clients on public.Client (no agentKey) and agreed
 * rates on ClientAgreedRate.clientId. A later migration adds GuiaClient.
 * This rewrites either shape into the ack-guias GuiaClient / guiaClientId rows.
 */
export function adaptKopeSource(input: {
  guias: unknown;
  lines: unknown;
  clients: unknown;
  rates: unknown;
  stock: unknown;
  documents: unknown;
  driveFiles: unknown;
  parties?: unknown;
}): {
  guias: Array<Record<string, unknown>>;
  lines: unknown;
  clients: Array<Record<string, unknown>>;
  rates: Array<Record<string, unknown>>;
  stock: unknown;
  documents: unknown;
  driveFiles: unknown;
  parties: Array<Record<string, unknown>>;
} {
  const rawGuias = rows(input.guias)
    .filter((row) => row.product === "guia" && row.agentKey === ACK_AGENT_KEY)
    .map((row) => ({ ...row }));
  const referenced = new Set<string>();
  for (const guia of rawGuias) {
    const clientId = text(guia.clientId);
    const guiaClientId = text(guia.guiaClientId);
    if (clientId) referenced.add(clientId);
    if (guiaClientId) referenced.add(guiaClientId);
  }
  const rawRates = rows(input.rates)
    .filter((row) => {
      if ("agentKey" in row) return row.agentKey === ACK_AGENT_KEY;
      const clientId = text(row.guiaClientId) || text(row.clientId);
      return referenced.has(clientId);
    })
    .map((row) => ({ ...row }));
  for (const rate of rawRates) {
    const clientId = text(rate.guiaClientId) || text(rate.clientId);
    if (clientId) referenced.add(clientId);
  }

  type Draft = { id: string; name: string; normalizedName: string; createdAt: unknown; updatedAt: unknown };
  const drafts = new Map<string, Draft>();
  for (const row of rows(input.clients)) {
    const id = text(row.id);
    if (!id || !referenced.has(id)) continue;
    if ("agentKey" in row && text(row.agentKey) && row.agentKey !== ACK_AGENT_KEY) continue;
    const name = text(row.name);
    const normalizedName = text(row.normalizedName) || normalizeBillToName(name);
    if (!normalizedName) continue;
    drafts.set(id, {
      id,
      name: name || normalizedName,
      normalizedName,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt ?? row.createdAt,
    });
  }

  const byNorm = new Map<string, Draft>();
  const remap = new Map<string, string>();
  for (const draft of drafts.values()) {
    const kept = byNorm.get(draft.normalizedName);
    if (!kept) {
      byNorm.set(draft.normalizedName, draft);
      remap.set(draft.id, draft.id);
    } else {
      remap.set(draft.id, kept.id);
    }
  }

  for (const guia of rawGuias) {
    const linked = text(guia.guiaClientId) || text(guia.clientId);
    const label = text(guia.clientLabel);
    const norm = normalizeBillToName(label);
    if (!linked && norm) {
      let kept = byNorm.get(norm);
      if (!kept) {
        const id = stableGuiaClientId(norm);
        kept = { id, name: label, normalizedName: norm, createdAt: guia.createdAt, updatedAt: guia.updatedAt ?? guia.createdAt };
        byNorm.set(norm, kept);
        remap.set(id, id);
      }
      guia.guiaClientId = kept.id;
    } else if (linked) {
      guia.guiaClientId = remap.get(linked) ?? linked;
    }
    guia.agentKey = ACK_AGENT_KEY;
    guia.product = "guia";
  }

  const clients = [...byNorm.values()].map((draft) => ({
    id: draft.id,
    agentKey: ACK_AGENT_KEY,
    name: draft.name,
    normalizedName: draft.normalizedName,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  }));
  const keptIds = new Set(clients.map((row) => String(row.id)));
  const seenRates = new Set<string>();
  const rates: Array<Record<string, unknown>> = [];
  for (const rate of rawRates) {
    const sourceId = text(rate.guiaClientId) || text(rate.clientId);
    const guiaClientId = remap.get(sourceId) ?? sourceId;
    if (!guiaClientId || !keptIds.has(guiaClientId) || seenRates.has(guiaClientId)) continue;
    seenRates.add(guiaClientId);
    rates.push({ ...rate, agentKey: ACK_AGENT_KEY, guiaClientId });
  }
  const parties: Array<Record<string, unknown>> = [];
  for (const party of rows(input.parties)) {
    const sourceId = text(party.clientId);
    const clientId = remap.get(sourceId);
    if (!sourceId || !clientId || !keptIds.has(clientId)) continue;
    parties.push({ ...party, clientId });
  }

  return {
    guias: rawGuias,
    lines: input.lines,
    clients,
    rates,
    stock: input.stock,
    documents: input.documents,
    driveFiles: input.driveFiles,
    parties,
  };
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
  parties?: unknown;
}): AckExportFile {
  const guias = rows(input.guias)
    .filter((row) => row.product === "guia" && row.agentKey === ACK_AGENT_KEY)
    .map((row) => pick(row, GUIA_FIELDS));
  const ids = new Set(guias.map((row) => String(row.id)));
  const clientIds = new Set(guias.map((row) => row.guiaClientId).filter((id): id is string => typeof id === "string" && id.length > 0));
  for (const rate of rows(input.rates)) {
    if (rate.agentKey === ACK_AGENT_KEY && typeof rate.guiaClientId === "string" && rate.guiaClientId) clientIds.add(rate.guiaClientId);
  }
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
    parties: rows(input.parties)
      .filter((row) => keptClients.has(String(row.clientId ?? "")))
      .map((row) => pick(row, KOPE_PARTY_COLUMNS)),
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
  const partiesByClient = new Map<string, Array<Record<string, unknown>>>();
  for (const party of shaped.parties ?? []) {
    const clientId = String(party.clientId ?? "");
    const list = partiesByClient.get(clientId) ?? [];
    list.push(party);
    partiesByClient.set(clientId, list);
  }
  for (const guia of shaped.guias) {
    for (const party of partiesByClient.get(String(guia.guiaClientId ?? "")) ?? []) partyOntoGuia(guia, party);
  }
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
    parties: file.parties?.length ?? 0,
    withAesItn: file.guias.filter((row) => String(row.aesItn ?? "").trim().length > 0).length,
  };
}

export function redactDatabaseUrl(message: string, url: string | undefined): string {
  let text = message;
  if (url) text = text.split(url).join("[redacted]");
  return text.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]");
}
