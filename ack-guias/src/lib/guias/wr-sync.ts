import { prisma } from "@/lib/db";
import { ensureGuiaClient } from "@/lib/guias/guia-client";
import { guiaValuesOf } from "@/lib/guias/guia-data";
import { applyReceiptsToGuia, type ReceiptFeed } from "@/lib/guias/wr";

/**
 * Feeds a draft guía from the warehouse receipts linked to it: the pieces and the weights follow the receipts, and the
 * client, the parties, the goods and the UN numbers are filled when the guía has none. A guía that is already issued
 * is left as it is, since its AWB was printed. Returns the fields that changed.
 */
export async function syncGuiaFromReceipts(guiaId: string): Promise<{ changed: string[]; skipped: boolean }> {
  const document = await prisma.airWaybillDocument.findFirst({
    where: { id: guiaId, product: "guia" },
    include: { guiaClient: { select: { name: true } }, lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!document) return { changed: [], skipped: true };
  if (document.status === "issued") return { changed: [], skipped: true };
  const receipts = await prisma.warehouseReceipt.findMany({ where: { guiaId }, orderBy: { seq: "asc" }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
  if (receipts.length === 0) return { changed: [], skipped: false };
  const feeds: ReceiptFeed[] = receipts.map((receipt) => ({
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
  const current = guiaValuesOf(document);
  const { values, changed } = applyReceiptsToGuia(current, feeds);
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
  if (changed.includes("dg") || changed.includes("unNumbers")) {
    documentUpdate.dgDeclarable = values.dg === "1";
    documentUpdate.unNumbers = values.unNumbers || null;
  }
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
  return { changed, skipped: false };
}
