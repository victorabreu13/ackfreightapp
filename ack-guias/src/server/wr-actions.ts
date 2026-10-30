"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rememberDriver } from "@/lib/guias/drivers";
import { numberOrNull } from "@/lib/guias/guia-data";
import { pickupNumber, receiptNumber } from "@/lib/guias/wr";
import { removeReceiptFromGuia, storeReceiptInGuia } from "@/lib/guias/wr-store";
import { syncGuiaFromReceipts } from "@/lib/guias/wr-sync";

function text(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function area(value: FormDataEntryValue | null): string {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim();
}

async function requireTeam() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canManageGuias(user)) redirect("/guias?error=Only%20the%20ACK%20team%20can%20change%20the%20warehouse%20receipts");
  return user;
}

function listBack(message: string, kind: "notice" | "error" = "notice"): never {
  redirect(`/guias/warehouse?${kind}=${encodeURIComponent(message)}`);
}

/** The line fields come as parallel lists, one value for each line. Lines with nothing on them are dropped. */
function linesFromForm(formData: FormData) {
  const column = (name: string) => formData.getAll(name).map((value) => String(value ?? "").trim());
  const pieces = column("linePieces");
  const type = column("linePackage");
  const length = column("lineLength");
  const width = column("lineWidth");
  const height = column("lineHeight");
  const weight = column("lineWeight");
  const location = column("lineLocation");
  const description = column("lineDescription");
  const notes = column("lineNotes");
  const tracking = column("linePcTracking");
  const lines = pieces.map((_, index) => ({
    pieces: Math.max(1, Math.round(numberOrNull(pieces[index] ?? "") ?? 1)),
    packageType: type[index] || null,
    length: numberOrNull(length[index] ?? ""),
    width: numberOrNull(width[index] ?? ""),
    height: numberOrNull(height[index] ?? ""),
    weightKg: numberOrNull(weight[index] ?? ""),
    location: location[index] || null,
    description: description[index] || null,
    notes: notes[index] || null,
    pcTracking: tracking[index] || null,
  }));
  return lines
    .filter((line) => line.weightKg != null || line.length != null || line.width != null || line.height != null || line.description || line.packageType)
    .map((line, index) => ({ ...line, sortOrder: index }));
}

/**
 * Saves a warehouse receipt. When it is tied to a pickup request it is tied to that pickup's draft guía too, and a
 * guía that is still a draft is fed from its receipts.
 */
export async function saveWarehouseReceipt(formData: FormData) {
  const user = await requireTeam();
  const id = text(formData.get("id"));
  const lines = linesFromForm(formData);
  if (lines.length === 0) {
    redirect(`${id ? `/guias/warehouse/${id}` : "/guias/warehouse/new"}?error=${encodeURIComponent("Agrega al menos una línea con piezas, peso o medidas.")}`);
  }
  const pickupId = text(formData.get("pickupRequestId"));
  const pickup = pickupId ? await prisma.pickupRequest.findUnique({ where: { id: pickupId } }) : null;
  const data = {
    warehouse: text(formData.get("warehouse")) || "Warehouse 2 - Site 1",
    receivedBy: text(formData.get("receivedBy")) || null,
    clientLabel: text(formData.get("client")) || pickup?.clientLabel || null,
    shipperName: text(formData.get("shipper")) || null,
    shipperAddress: area(formData.get("shipperAddress")) || null,
    consigneeName: text(formData.get("consignee")) || null,
    consigneeAddress: area(formData.get("consigneeAddress")) || null,
    carrier: text(formData.get("carrier")) || null,
    driver: text(formData.get("driver")) || null,
    driverLicense: text(formData.get("driverLicense")) || null,
    supplier: text(formData.get("supplier")) || null,
    invoiceNumber: text(formData.get("invoiceNumber")) || null,
    poNumber: text(formData.get("poNumber")) || null,
    pickupNumber: text(formData.get("pickupNumber")) || (pickup ? pickupNumber(pickup.seq) : null),
    trackingNumber: text(formData.get("trackingNumber")) || null,
    proNumber: text(formData.get("proNumber")) || null,
    htPallet: text(formData.get("htPallet")) === "1",
    palletType: text(formData.get("palletType")) || null,
    dangerousGood: text(formData.get("dangerousGood")) || null,
    sealedDrum: text(formData.get("sealedDrum")) || null,
    notes: area(formData.get("notes")) || null,
    pickupRequestId: pickup?.id ?? null,
  };
  let receiptId = id;
  let guiaId: string | null = null;
  if (id) {
    const existing = await prisma.warehouseReceipt.findUnique({ where: { id }, select: { guiaId: true } });
    if (!existing) listBack("No se encontró el warehouse receipt.", "error");
    guiaId = existing.guiaId;
    await prisma.$transaction([
      prisma.warehouseReceiptLine.deleteMany({ where: { receiptId: id } }),
      prisma.warehouseReceipt.update({ where: { id }, data: { ...data, lines: { create: lines } } }),
    ]);
  } else {
    guiaId = pickup?.guiaId ?? null;
    const created = await prisma.warehouseReceipt.create({
      data: { ...data, createdBy: user.email, receivedBy: data.receivedBy ?? (user.name || user.email), guiaId, lines: { create: lines } },
    });
    receiptId = created.id;
  }
  // The driver is remembered for the next receipt. A failure there never stops the receipt from saving.
  try {
    await rememberDriver({ carrier: data.carrier, name: data.driver, license: data.driverLicense });
  } catch (error) {
    console.error("driver directory", error);
  }
  if (guiaId) {
    await syncGuiaFromReceipts(guiaId);
    await storeReceiptInGuia(receiptId, user.email);
  }
  revalidatePath("/guias/warehouse");
  if (guiaId) {
    revalidatePath(`/guias/${guiaId}`);
    revalidatePath("/guias/documents");
  }
  redirect(`/guias/warehouse/${receiptId}?saved=1`);
}

export async function deleteWarehouseReceipt(formData: FormData) {
  await requireTeam();
  const id = text(formData.get("id"));
  const found = await prisma.warehouseReceipt.findUnique({ where: { id }, select: { seq: true, guiaId: true } });
  if (!found) listBack("No se encontró el warehouse receipt.", "error");
  await prisma.warehouseReceipt.delete({ where: { id } });
  if (found.guiaId) {
    await removeReceiptFromGuia(found.guiaId, found.seq);
    await syncGuiaFromReceipts(found.guiaId);
    revalidatePath(`/guias/${found.guiaId}`);
    revalidatePath("/guias/documents");
  }
  revalidatePath("/guias/warehouse");
  listBack(`Warehouse receipt ${receiptNumber(found.seq)} eliminado.`);
}

/** Ties a receipt to a guía, and feeds the guía when it is still a draft. */
export async function linkReceiptToGuia(formData: FormData) {
  const user = await requireTeam();
  const guiaId = text(formData.get("guiaId"));
  const receiptId = text(formData.get("receiptId"));
  const back = `/guias/${guiaId}`;
  const guia = await prisma.airWaybillDocument.findFirst({ where: { id: guiaId, product: "guia" }, select: { id: true } });
  const receipt = await prisma.warehouseReceipt.findUnique({ where: { id: receiptId }, select: { id: true, seq: true, guiaId: true } });
  if (!guia || !receipt) redirect(`${back}?error=${encodeURIComponent("No se encontró la guía o el warehouse receipt.")}`);
  if (receipt.guiaId && receipt.guiaId !== guiaId) {
    redirect(`${back}?error=${encodeURIComponent(`${receiptNumber(receipt.seq)} ya está ligado a otra guía. Suéltalo allá primero.`)}`);
  }
  await prisma.warehouseReceipt.update({ where: { id: receiptId }, data: { guiaId } });
  const synced = await syncGuiaFromReceipts(guiaId);
  await storeReceiptInGuia(receiptId, user.email);
  revalidatePath(back);
  revalidatePath("/guias/documents");
  revalidatePath("/guias/warehouse");
  redirect(`${back}?receipts=${encodeURIComponent(synced.skipped ? `${receiptNumber(receipt.seq)} ligado. La guía ya está emitida, no se cambió.` : `${receiptNumber(receipt.seq)} ligado y la guía se actualizó.`)}`);
}

export async function unlinkReceiptFromGuia(formData: FormData) {
  await requireTeam();
  const guiaId = text(formData.get("guiaId"));
  const receiptId = text(formData.get("receiptId"));
  const released = await prisma.warehouseReceipt.findFirst({ where: { id: receiptId, guiaId }, select: { seq: true } });
  await prisma.warehouseReceipt.updateMany({ where: { id: receiptId, guiaId }, data: { guiaId: null } });
  if (released) await removeReceiptFromGuia(guiaId, released.seq);
  await syncGuiaFromReceipts(guiaId);
  revalidatePath("/guias/documents");
  revalidatePath(`/guias/${guiaId}`);
  revalidatePath("/guias/warehouse");
  redirect(`/guias/${guiaId}?receipts=${encodeURIComponent("Warehouse receipt soltado de la guía.")}`);
}

/** Feeds the guía again from its receipts, after someone changed it by hand. */
export async function refreshGuiaFromReceipts(formData: FormData) {
  await requireTeam();
  const guiaId = text(formData.get("guiaId"));
  const result = await syncGuiaFromReceipts(guiaId);
  revalidatePath(`/guias/${guiaId}`);
  redirect(`/guias/${guiaId}?receipts=${encodeURIComponent(result.skipped ? "La guía ya está emitida: no se cambia." : result.changed.length ? "Guía actualizada desde sus warehouse receipts." : "La guía ya tenía los datos de sus warehouse receipts.")}`);
}
