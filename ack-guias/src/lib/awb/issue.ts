import { Prisma } from "@prisma/client";
import { formatAwb, isValidSerial, parseAwb } from "@/lib/awb/number";
import { prisma } from "@/lib/db";

export const CLAIM_ATTEMPTS = 12;

export class IssueConflict extends Error {
  constructor(
    public readonly code: "already_issued" | "number_taken" | "no_stock" | "invalid" | "needs_review",
    message: string,
  ) {
    super(message);
    this.name = "IssueConflict";
  }
}

/** Release only stock that is not attached to a document. */
export function unattachedReleaseWhere(id: string) {
  return { id, documentId: null as null };
}

export function pendingReview(reviewJson: string | null | undefined): boolean {
  if (!reviewJson?.trim()) return false;
  try {
    const parsed = JSON.parse(reviewJson) as unknown;
    if (Array.isArray(parsed)) return parsed.length > 0;
    if (parsed && typeof parsed === "object") return Object.keys(parsed as object).length > 0;
    return false;
  } catch {
    return true;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function claimStock(prefix: string, agentKey: string, attempts = CLAIM_ATTEMPTS) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const next = await prisma.awbStockNumber.findFirst({
      where: { prefix, agentKey, status: "available", documentId: null },
      orderBy: { serial: "asc" },
    });
    if (!next) return null;
    const won = await prisma.awbStockNumber.updateMany({
      where: { id: next.id, status: "available", documentId: null },
      data: { status: "reserved" },
    });
    if (won.count === 1) return next;
    await sleep(15 + Math.floor(Math.random() * 40) + attempt * 8);
  }
  return null;
}

export async function releaseUnattachedStock(stockId: string | null | undefined) {
  if (!stockId) return;
  await prisma.awbStockNumber.updateMany({
    where: unattachedReleaseWhere(stockId),
    data: { status: "available" },
  });
}

/** Spanish text for the guía page. Review flags are not an issue failure. */
export function issueErrorInSpanish(error: unknown): string {
  if (!(error instanceof IssueConflict)) return "No se pudo emitir la guía.";
  const text = error.message;
  if (error.code === "already_issued" || text === "already issued") return "Esta guía ya fue emitida.";
  if (error.code === "number_taken" || text === "number already issued") return "Ese número ya fue emitido.";
  if (text === "That number is not in stock") return "Ese número no está en el stock.";
  if (error.code === "no_stock" || text === "No stock left") return "No queda stock para ese prefijo.";
  if (text === "Enter a valid mod-7 AWB") return "El número no es un AWB válido (mod-7).";
  if (text === "Choose an airline prefix") return "Elige un prefijo de aerolínea.";
  if (text === "Waybill not found") return "No se encontró la guía.";
  if (text === "This guía already has an AWB number") return "Esta guía ya tiene un AWB asignado. Libera el número antes de asignar otro.";
  return text;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function issueWaybillAtomic(input: {
  documentId: string;
  agentKey: string;
  manualAwb?: string | null;
  prefix?: string | null;
  requireInStock?: boolean;
  data?: Prisma.AirWaybillDocumentUpdateManyMutationInput;
}): Promise<{ awb: string; prefix: string; serial: string; stockId: string | null }> {
  const existing = await prisma.airWaybillDocument.findUnique({ where: { id: input.documentId } });
  if (!existing) throw new IssueConflict("invalid", "Waybill not found");
  if (existing.status !== "draft") throw new IssueConflict("already_issued", "already issued");

  let prefix = "";
  let serial = "";
  let awb = "";
  let stockId: string | null = null;
  const manual = input.manualAwb?.trim() ?? "";
  // A draft that already has an AWB number assigned is issued with that number.
  const assigned = existing.awb.trim()
    ? await prisma.awbStockNumber.findFirst({ where: { documentId: existing.id, agentKey: input.agentKey } })
    : null;

  if (assigned) {
    prefix = assigned.prefix;
    serial = assigned.serial;
    awb = assigned.awb;
    stockId = assigned.id;
  } else if (manual) {
    const parsed = parseAwb(manual);
    if (!parsed || !isValidSerial(parsed.serial)) throw new IssueConflict("invalid", "Enter a valid mod-7 AWB");
    prefix = parsed.prefix;
    serial = parsed.serial;
    awb = formatAwb(prefix, serial);
    const stock = await prisma.awbStockNumber.findUnique({ where: { awb } });
    if (input.requireInStock && (!stock || stock.status !== "available" || stock.documentId || stock.agentKey !== input.agentKey)) {
      throw new IssueConflict(stock ? "number_taken" : "no_stock", stock ? "number already issued" : "That number is not in stock");
    }
    if (stock && stock.agentKey === input.agentKey) {
      const claimed = await prisma.awbStockNumber.updateMany({
        where: { id: stock.id, status: "available", documentId: null },
        data: { status: "reserved" },
      });
      if (claimed.count !== 1) throw new IssueConflict("number_taken", "number already issued");
      stockId = stock.id;
    } else if (stock) {
      throw new IssueConflict("number_taken", "number already issued");
    }
  } else {
    prefix = String(input.prefix ?? "").replace(/\D/g, "").padStart(3, "0").slice(-3);
    if (!/^\d{3}$/.test(prefix) || prefix === "000") throw new IssueConflict("invalid", "Choose an airline prefix");
    const stock = await claimStock(prefix, input.agentKey);
    if (!stock) throw new IssueConflict("no_stock", "No stock left");
    prefix = stock.prefix;
    serial = stock.serial;
    awb = stock.awb;
    stockId = stock.id;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const won = await tx.airWaybillDocument.updateMany({
        where: { id: input.documentId, status: "draft" },
        data: {
          ...input.data,
          status: "issued",
          agentKey: input.agentKey,
          awb,
          prefix,
          serial,
        },
      });
      if (won.count !== 1) throw new IssueConflict("already_issued", "already issued");
      if (stockId) {
        const attached = await tx.awbStockNumber.updateMany({
          where: assigned ? { id: stockId, documentId: input.documentId } : { id: stockId, documentId: null },
          data: { status: "used", documentId: input.documentId },
        });
        if (attached.count !== 1) throw new IssueConflict("number_taken", "number already issued");
      }
    });
  } catch (error) {
    await releaseUnattachedStock(stockId);
    if (error instanceof IssueConflict) throw error;
    if (isUniqueViolation(error)) throw new IssueConflict("number_taken", "number already issued");
    throw error;
  }

  return { awb, prefix, serial, stockId };
}

/**
 * Gives a draft its AWB number from stock before it is issued, so the draft, the labels and the folder label
 * carry the real number. The stock number stays reserved for this guía until it is issued or released.
 */
export async function assignDraftAwb(input: {
  documentId: string;
  agentKey: string;
  manualAwb?: string | null;
  prefix?: string | null;
  data?: Prisma.AirWaybillDocumentUpdateManyMutationInput;
}): Promise<{ awb: string; prefix: string; serial: string; stockId: string }> {
  const existing = await prisma.airWaybillDocument.findUnique({ where: { id: input.documentId } });
  if (!existing) throw new IssueConflict("invalid", "Waybill not found");
  if (existing.status !== "draft") throw new IssueConflict("already_issued", "already issued");
  if (existing.awb.trim()) throw new IssueConflict("invalid", "This guía already has an AWB number");

  const manual = input.manualAwb?.trim() ?? "";
  let stock: { id: string; prefix: string; serial: string; awb: string };
  if (manual) {
    const parsed = parseAwb(manual);
    if (!parsed || !isValidSerial(parsed.serial)) throw new IssueConflict("invalid", "Enter a valid mod-7 AWB");
    const awb = formatAwb(parsed.prefix, parsed.serial);
    const row = await prisma.awbStockNumber.findUnique({ where: { awb } });
    if (!row || row.status !== "available" || row.documentId || row.agentKey !== input.agentKey) {
      throw new IssueConflict(row ? "number_taken" : "no_stock", row ? "number already issued" : "That number is not in stock");
    }
    const claimed = await prisma.awbStockNumber.updateMany({
      where: { id: row.id, status: "available", documentId: null },
      data: { status: "reserved" },
    });
    if (claimed.count !== 1) throw new IssueConflict("number_taken", "number already issued");
    stock = row;
  } else {
    const prefix = String(input.prefix ?? "").replace(/\D/g, "").padStart(3, "0").slice(-3);
    if (!/^\d{3}$/.test(prefix) || prefix === "000") throw new IssueConflict("invalid", "Choose an airline prefix");
    const claimed = await claimStock(prefix, input.agentKey);
    if (!claimed) throw new IssueConflict("no_stock", "No stock left");
    stock = claimed;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const attached = await tx.awbStockNumber.updateMany({
        where: { id: stock.id, documentId: null },
        data: { documentId: input.documentId },
      });
      if (attached.count !== 1) throw new IssueConflict("number_taken", "number already issued");
      const updated = await tx.airWaybillDocument.updateMany({
        where: { id: input.documentId, status: "draft" },
        data: { ...input.data, awb: stock.awb, prefix: stock.prefix, serial: stock.serial },
      });
      if (updated.count !== 1) throw new IssueConflict("already_issued", "already issued");
    });
  } catch (error) {
    await releaseUnattachedStock(stock.id);
    if (error instanceof IssueConflict) throw error;
    throw error;
  }
  return { awb: stock.awb, prefix: stock.prefix, serial: stock.serial, stockId: stock.id };
}

/** Takes the AWB number back from a draft and returns it to stock. Only a draft can give its number back. */
export async function releaseDraftAwb(documentId: string, agentKey: string): Promise<void> {
  const existing = await prisma.airWaybillDocument.findUnique({ where: { id: documentId } });
  if (!existing) throw new IssueConflict("invalid", "Waybill not found");
  if (existing.status !== "draft") throw new IssueConflict("already_issued", "already issued");
  await prisma.$transaction(async (tx) => {
    await tx.awbStockNumber.updateMany({
      where: { documentId, agentKey, status: "reserved" },
      data: { documentId: null, status: "available" },
    });
    await tx.airWaybillDocument.updateMany({
      where: { id: documentId, status: "draft" },
      data: { awb: "", prefix: "", serial: "", carrierName: null, carrierAddress: null, to1: null, by1: null, destCountry: null },
    });
  });
}
