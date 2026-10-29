"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createDraftGuia, EMPTY_GUIA_VALUES } from "@/lib/guias/draft-guia";
import { numberOrNull } from "@/lib/guias/guia-data";
import { pickupNumber } from "@/lib/guias/wr";

function text(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function area(value: FormDataEntryValue | null): string {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim();
}

async function requireTeam() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canManageGuias(user)) redirect("/guias?error=Only%20the%20ACK%20team%20can%20change%20the%20pickup%20requests");
  return user;
}

function back(message: string, kind: "notice" | "error" = "notice"): never {
  redirect(`/guias/pickups?${kind}=${encodeURIComponent(message)}`);
}

/**
 * Saves a pickup request and, with it, the draft guía it starts: the client, the shipper, the consignee, the pieces
 * and the weight go to the guía, and the trucker goes where the pickup order reads it.
 */
export async function savePickupRequest(formData: FormData) {
  const user = await requireTeam();
  const client = text(formData.get("client"));
  const shipper = text(formData.get("shipper"));
  if (!client) back("Escribe el cliente del pickup.", "error");
  if (!shipper) back("Escribe el shipper: de dónde se recoge la carga.", "error");
  const pieces = numberOrNull(text(formData.get("pieces")));
  const weight = numberOrNull(text(formData.get("weightKg")));
  const data = {
    createdBy: user.email,
    clientLabel: client,
    shipperName: shipper,
    shipperAddress: area(formData.get("shipperAddress")),
    contactName: text(formData.get("contactName")) || null,
    contactPhone: text(formData.get("contactPhone")) || null,
    contactEmail: text(formData.get("contactEmail")) || null,
    consigneeName: text(formData.get("consignee")) || null,
    consigneeAddress: area(formData.get("consigneeAddress")) || null,
    destination: text(formData.get("destination")).toUpperCase() || null,
    pieces: pieces == null ? null : Math.round(pieces),
    weightKg: weight,
    description: area(formData.get("description")) || null,
    pickupDate: text(formData.get("pickupDate")) || null,
    readyTime: text(formData.get("readyTime")) || null,
    truckerName: text(formData.get("truckerName")) || null,
    truckerPhone: text(formData.get("truckerPhone")) || null,
    driverName: text(formData.get("driverName")) || null,
    notes: area(formData.get("notes")) || null,
  };
  const request = await prisma.pickupRequest.create({ data });
  const draft = await createDraftGuia(
    {
      ...EMPTY_GUIA_VALUES,
      client,
      shipper,
      shipperAddress: data.shipperAddress,
      consignee: data.consigneeName ?? "",
      consigneeAddress: data.consigneeAddress ?? "",
      origin: "MIA",
      destination: data.destination ?? "",
      pieces: data.pieces == null ? "" : String(data.pieces),
      grossKg: weight == null ? "" : String(weight),
      chargeableKg: weight == null ? "" : String(weight),
      goods: data.description ?? "",
    },
    { createdBy: user.email, truckerName: data.truckerName ?? "", truckerPhone: data.truckerPhone ?? "", driverName: data.driverName ?? "" },
  );
  await prisma.pickupRequest.update({ where: { id: request.id }, data: { guiaId: draft.id } });
  revalidatePath("/guias/pickups");
  revalidatePath("/guias");
  back(`Pickup ${pickupNumber(request.seq)} creado. Su borrador de guía ya está en Guías.`);
}

/** Deletes the request. The draft guía it started stays, since it may already have been worked on. */
export async function deletePickupRequest(formData: FormData) {
  await requireTeam();
  const id = text(formData.get("id"));
  const found = await prisma.pickupRequest.findUnique({ where: { id }, select: { seq: true } });
  if (!found) back("No se encontró el pickup.", "error");
  await prisma.pickupRequest.delete({ where: { id } });
  revalidatePath("/guias/pickups");
  back(`Pickup ${pickupNumber(found.seq)} eliminado. Su borrador de guía se queda en Guías.`);
}
