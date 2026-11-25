import { prisma } from "@/lib/db";
import { loadCompany } from "@/lib/guias/company";
import { guiaAwbFolder, publishRenderedPdf, publishUnlinkedPdf } from "@/lib/guias/document-log";
import { trashDriveFile } from "@/lib/guias/drive";
import { guiaBillToName } from "@/lib/guias/guia-client";
import { receiptNumber } from "@/lib/guias/wr";
import { renderWarehouseReceipt } from "@/lib/guias/wr-pdf";

/** The kind a stored warehouse receipt has in the AWB's documents. */
export const RECEIPT_KIND = "warehouse-receipt";

/** The folder, inside the client folder of Drive, where a receipt waits until it is linked to an AWB. */
export const UNLINKED_RECEIPT_FOLDER = "Warehouse receipts (sin guia)";

export function receiptFileName(seq: number): string {
  return `WAREHOUSE RECEIPT ${receiptNumber(seq)}.pdf`;
}

/**
 * Saves the PDF of a receipt in the documents of the AWB it is tied to, so it shows under the AWB's Warehouse
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

/** Takes the stored PDF of a receipt out of an AWB's documents, when the receipt is let go of or deleted. */
export async function removeReceiptFromGuia(guiaId: string, seq: number): Promise<void> {
  await prisma.guiaDocument.deleteMany({ where: { guiaId, kind: RECEIPT_KIND, fileName: receiptFileName(seq) } });
}

/**
 * A receipt with no AWB yet is saved in the client folder of Drive, under the "Warehouse receipts (sin guia)" folder, and it is replaced
 * each time the receipt is saved. When it is linked to an AWB it moves to the AWB folder (see removeUnlinkedReceipt).
 */
export async function storeUnlinkedReceipt(receiptId: string, generatedBy: string): Promise<void> {
  try {
    const receipt = await prisma.warehouseReceipt.findUnique({ where: { id: receiptId }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
    if (!receipt || receipt.guiaId) return;
    // Saved again under another client name, the copy in the old client folder goes.
    await removeUnlinkedReceipt(receipt.seq);
    const company = await loadCompany("ack");
    const bytes = await renderWarehouseReceipt(receipt, company);
    await publishUnlinkedPdf({
      client: receipt.clientLabel || "No client",
      folder: UNLINKED_RECEIPT_FOLDER,
      company: "ack",
      kind: RECEIPT_KIND,
      fileName: receiptFileName(receipt.seq),
      bytes,
      generatedBy,
    });
  } catch (error) {
    console.error("unlinked warehouse receipt document", error);
  }
}

/** Takes the copy of a receipt that was waiting in the client folder out of Documentos and, when it can, out of Drive. */
export async function removeUnlinkedReceipt(seq: number): Promise<void> {
  try {
    const rows = await prisma.guiaDocument.findMany({
      where: { guiaId: null, kind: RECEIPT_KIND, awb: UNLINKED_RECEIPT_FOLDER, fileName: receiptFileName(seq) },
      select: { id: true, driveFileId: true },
    });
    for (const row of rows) {
      if (row.driveFileId) {
        try {
          await trashDriveFile({ fileId: row.driveFileId });
        } catch (error) {
          // A copy already gone from Drive is fine. Any other failure leaves the file there but never blocks the receipt.
          console.error("unlinked warehouse receipt drive file", error);
        }
      }
      await prisma.guiaDocument.delete({ where: { id: row.id } });
    }
  } catch (error) {
    console.error("unlinked warehouse receipt cleanup", error);
  }
}
