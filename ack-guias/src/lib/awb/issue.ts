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

  if (manual) {
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
          where: { id: stockId, documentId: null },
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
