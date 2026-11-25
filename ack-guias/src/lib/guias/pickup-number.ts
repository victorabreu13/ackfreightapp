import { prisma } from "@/lib/db";
import { guiaBillToName } from "@/lib/guias/guia-client";
import { pickupNumber } from "@/lib/guias/wr";

/**
 * The PU number a pickup order prints, the same one the pickup request has in Pickup requests. An AWB that has no pickup
 * request yet gets one here, so the pickup order always carries a PU number that exists in the system.
 */
export async function pickupNumberForGuia(
  document: {
    id: string;
    clientLabel?: string | null;
    guiaClient?: { name: string } | null;
    shipperName?: string | null;
    shipperAddress?: string | null;
    consigneeName?: string | null;
    consigneeAddress?: string | null;
    destination?: string | null;
    truckerName?: string | null;
    truckerPhone?: string | null;
    driverName?: string | null;
    pickupNotes?: string | null;
    packageType?: string | null;
    lines?: Array<{ pieces: number | null; grossWeight: number | null; nature: string | null }>;
  },
  createdBy: string,
): Promise<string> {
  const existing = await prisma.pickupRequest.findFirst({ where: { guiaId: document.id }, orderBy: { seq: "asc" }, select: { seq: true } });
  if (existing) return pickupNumber(existing.seq);
  const line = document.lines?.[0];
  const created = await prisma.pickupRequest.create({
    data: {
      createdBy,
      clientLabel: guiaBillToName(document) || "No client",
      shipperName: document.shipperName?.trim() || "—",
      shipperAddress: document.shipperAddress?.trim() || "",
      consigneeName: document.consigneeName?.trim() || null,
      consigneeAddress: document.consigneeAddress?.trim() || null,
      destination: document.destination?.trim().toUpperCase() || null,
      pieces: line?.pieces ?? null,
      packageType: document.packageType?.trim() || null,
      weightKg: line?.grossWeight ?? null,
      description: line?.nature?.trim() || null,
      truckerName: document.truckerName?.trim() || null,
      truckerPhone: document.truckerPhone?.trim() || null,
      driverName: document.driverName?.trim() || null,
      notes: document.pickupNotes?.trim() || null,
      guiaId: document.id,
    },
    select: { seq: true },
  });
  return pickupNumber(created.seq);
}
