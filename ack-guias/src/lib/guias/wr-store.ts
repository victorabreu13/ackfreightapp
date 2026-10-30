import { prisma } from "@/lib/db";
import { loadCompany } from "@/lib/guias/company";
import { guiaAwbFolder, publishRenderedPdf } from "@/lib/guias/document-log";
import { guiaBillToName } from "@/lib/guias/guia-client";
import { receiptNumber } from "@/lib/guias/wr";
import { renderWarehouseReceipt } from "@/lib/guias/wr-pdf";

/** The kind a stored warehouse receipt has in the guía's documents. */
export const RECEIPT_KIND = "warehouse-receipt";

export function receiptFileName(seq: number): string {
  return `WAREHOUSE RECEIPT ${receiptNumber(seq)}.pdf`;
}

/**
 * Saves the PDF of a receipt in the documents of the guía it is tied to, so it shows under the guía's Warehouse
 * receipt field and in Documentos. A failure of the Drive copy does not lose it: the file is kept in the database.
 */
export async function storeReceiptInGuia(receiptId: string, generatedBy: string): Promise<void> {
  try {
    const receipt = await prisma.warehouseReceipt.findUnique({ where: { id: receiptId }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
    if (!receipt?.guiaId) return;
    const guia = await prisma.airWaybillDocument.findUnique({ where: { id: receipt.guiaId }, include: { guiaClient: true } });
    if (!guia) return;
    const company = await loadCompany("ack");
    const bytes = await renderWarehouseReceipt(receipt, company);
    await publishRenderedPdf({
      guiaId: guia.id,
      client: guiaBillToName(guia) || receipt.clientLabel || "No client",
      awb: guiaAwbFolder(guia.awb, guia.id),
      company: guia.agentKey,
      kind: RECEIPT_KIND,
      fileName: receiptFileName(receipt.seq),
      bytes,
      generatedBy,
    });
  } catch (error) {
    console.error("warehouse receipt document", error);
  }
}

/** Takes the stored PDF of a receipt out of a guía's documents, when the receipt is let go of or deleted. */
export async function removeReceiptFromGuia(guiaId: string, seq: number): Promise<void> {
  await prisma.guiaDocument.deleteMany({ where: { guiaId, kind: RECEIPT_KIND, fileName: receiptFileName(seq) } });
}
