import { prisma } from "@/lib/db";
import { ensureGuiaClient } from "@/lib/guias/guia-client";
import { guiaValuesOf } from "@/lib/guias/guia-data";
import { MANUAL_FIELDS, manualFieldOf, manualKeysOf, parseDismissed, type ManualKey } from "@/lib/guias/guia-manual";
import { packageTypeFrom } from "@/lib/guias/package-types";
import { applyReceiptsToGuia, type ReceiptFeed } from "@/lib/guias/wr";

type ReceiptRow = {
  clientLabel: string | null;
  shipperName: string | null;
  shipperAddress: string | null;
  consigneeName: string | null;
  consigneeAddress: string | null;
  dangerousGood: string | null;
  lines: Array<{ pieces: number; length: number | null; width: number | null; height: number | null; weightKg: number | null; description: string | null }>;
};

/** The part of each receipt that feeds a guía. */
export function receiptFeeds(receipts: ReceiptRow[]): ReceiptFeed[] {
  return receipts.map((receipt) => ({
    client: receipt.clientLabel,
    shipperName: receipt.shipperName,
    shipperAddress: receipt.shipperAddress,
    consigneeName: receipt.consigneeName,
    consigneeAddress: receipt.consigneeAddress,
    dangerousGood: receipt.dangerousGood,
    lines: receipt.lines.map((line) => ({
      pieces: line.pieces,
      length: line.length,
      width: line.width,
      height: line.height,
      weightKg: line.weightKg,
      description: line.description,
    })),
  }));
}

export type SyncOptions = {
  /** "reset" when the user asked to take the receipt values again. It is written in the change history. */
  source?: "receipt" | "reset";
  /** Fields whose manual mark is cleared first, so they take the receipt values again. */
  reset?: ManualKey[] | "all";
};

/**
 * Feeds a draft guía from the warehouse receipts linked to it. The pieces and the weights follow the receipts, except
 * the ones the user typed by hand, which stay. The client, the parties and the goods are filled when the guía has none.
 * Dangerous Goods never change: the guía only shows a suggestion. A guía that is already issued is left exactly as it
 * is, since its AWB was printed; only the link between the receipt and the guía is kept. Every change is written to the
 * change history. Returns the fields that changed.
 */
export async function syncGuiaFromReceipts(guiaId: string, actor: string, options: SyncOptions = {}): Promise<{ changed: string[]; skipped: boolean }> {
  const document = await prisma.airWaybillDocument.findFirst({
    where: { id: guiaId, product: "guia" },
    include: { guiaClient: { select: { name: true } }, lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!document) return { changed: [], skipped: true };
  if (document.status === "issued") return { changed: [], skipped: true };
  const source = options.source ?? "receipt";

  // A reset clears the manual mark, and forgets any receipt value the user had chosen to ignore.
  const reset = options.reset === "all" ? MANUAL_FIELDS.map((field) => field.key) : (options.reset ?? []);
  const flags = {
    piecesManual: document.piecesManual,
    grossManual: document.grossManual,
    chargeableManual: document.chargeableManual,
  };
  if (reset.length) {
    const dismissed = parseDismissed(document.wrDismissed);
    for (const key of reset) {
      flags[manualFieldOf(key).flag] = false;
      delete dismissed[key];
    }
    await prisma.airWaybillDocument.update({
      where: { id: guiaId },
      data: { ...flags, wrDismissed: Object.keys(dismissed).length ? JSON.stringify(dismissed) : null },
    });
  }

  const receipts = await prisma.warehouseReceipt.findMany({ where: { guiaId }, orderBy: { seq: "asc" }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
  if (receipts.length === 0) return { changed: [], skipped: false };
  const current = guiaValuesOf(document);
  const { values, changed } = applyReceiptsToGuia(current, receiptFeeds(receipts), manualKeysOf(flags));

  // The Package of the pickup order is the first one a receipt line names, when the guía has none.
  const received = receipts.flatMap((receipt) => receipt.lines).map((line) => packageTypeFrom(line.packageType)).find(Boolean);
  if (received && !document.packageType?.trim()) {
    await prisma.airWaybillDocument.update({ where: { id: guiaId }, data: { packageType: received } });
    changed.push("packageType");
  }
  if (changed.length === 0) return { changed, skipped: false };

  const documentUpdate: Record<string, unknown> = {};
  if (changed.includes("client")) {
    documentUpdate.clientLabel = values.client;
    const billTo = await ensureGuiaClient("ack", values.client);
    if (billTo) documentUpdate.guiaClientId = billTo.id;
  }
  if (changed.includes("shipper")) documentUpdate.shipperName = values.shipper;
  if (changed.includes("shipperAddress")) documentUpdate.shipperAddress = values.shipperAddress;
  if (changed.includes("consignee")) documentUpdate.consigneeName = values.consignee;
  if (changed.includes("consigneeAddress")) documentUpdate.consigneeAddress = values.consigneeAddress;
  if (Object.keys(documentUpdate).length) await prisma.airWaybillDocument.update({ where: { id: guiaId }, data: documentUpdate });

  const lineUpdate: Record<string, unknown> = {};
  if (changed.includes("pieces")) lineUpdate.pieces = Number(values.pieces);
  if (changed.includes("grossKg")) lineUpdate.grossWeight = Number(values.grossKg);
  if (changed.includes("chargeableKg")) lineUpdate.chargeableWeight = Number(values.chargeableKg);
  if (changed.includes("goods")) lineUpdate.nature = values.goods;
  if (Object.keys(lineUpdate).length) {
    const first = document.lines[0];
    if (first) await prisma.awbGoodsLine.update({ where: { id: first.id }, data: lineUpdate });
    else await prisma.awbGoodsLine.create({ data: { documentId: guiaId, kgLb: "K", sortOrder: 0, ...lineUpdate } });
  }

  const fields = changed.filter((key): key is keyof typeof values => key in values);
  if (fields.length) {
    await prisma.guiaChangeLog.createMany({
      data: fields.map((field) => ({ guiaId, field, oldValue: String(current[field] ?? "") || null, newValue: String(values[field] ?? "") || null, source, changedBy: actor })),
    });
  }
  return { changed, skipped: false };
}

/** Keeps the guía's own number over the receipt's: the notice stays hidden until the receipt says something else. */
export async function keepGuiaValue(guiaId: string, key: ManualKey, receiptValue: string): Promise<void> {
  const document = await prisma.airWaybillDocument.findUnique({ where: { id: guiaId }, select: { wrDismissed: true } });
  if (!document) return;
  const dismissed = parseDismissed(document.wrDismissed);
  dismissed[key] = receiptValue;
  await prisma.airWaybillDocument.update({ where: { id: guiaId }, data: { wrDismissed: JSON.stringify(dismissed) } });
}
