"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { issueErrorMessage } from "@/lib/awb/issue";
import { assignAwbToGuia } from "@/lib/guias/assign-awb";
import { createDraftGuia, EMPTY_GUIA_VALUES } from "@/lib/guias/draft-guia";
import { numberOrNull } from "@/lib/guias/guia-data";
import { packageTypeFrom } from "@/lib/guias/package-types";
import { roundUpOrNull } from "@/lib/guias/round-up";
import { pickupNumber } from "@/lib/guias/wr";
import { planPickupSync, type PickupFields } from "@/lib/guias/pickup-sync";
import { sendPickupToAckFreight } from "@/lib/guias/ack-freight-send";

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
 * Saves a pickup request and, with it, the draft AWB it starts: the client, the shipper, the consignee, the pieces
 * and the weight go to the AWB, and the trucker goes where the pickup order reads it.
 */
export async function savePickupRequest(formData: FormData) {
  const user = await requireTeam();
  const client = text(formData.get("client"));
  const shipper = text(formData.get("shipper"));
  if (!client) back("Type the pickup client.", "error");
  if (!shipper) back("Type the shipper: where the cargo is picked up from.", "error");
  const pieces = numberOrNull(text(formData.get("pieces")));
  const weight = roundUpOrNull(numberOrNull(text(formData.get("weightKg"))));
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
    packageType: packageTypeFrom(formData.get("packageType")) || null,
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
    { createdBy: user.email, truckerName: data.truckerName ?? "", pickupTruckerName: data.truckerName ?? "", truckerPhone: data.truckerPhone ?? "", driverName: data.driverName ?? "", packageType: data.packageType ?? "" },
  );
  await prisma.pickupRequest.update({ where: { id: request.id }, data: { guiaId: draft.id } });
  // The AWB number, when one was asked for, is reserved for the draft right away.
  const wantedAwb = text(formData.get("assignAwb"));
  const wantedPrefix = text(formData.get("assignPrefix"));
  let assigned = "";
  let assignError = "";
  if (wantedAwb || wantedPrefix) {
    try {
      await assignAwbToGuia(draft.id, wantedAwb, wantedPrefix);
      assigned = (await prisma.airWaybillDocument.findUnique({ where: { id: draft.id }, select: { awb: true } }))?.awb ?? "";
    } catch (error) {
      assignError = issueErrorMessage(error);
    }
  }
  // The pickup order also becomes a trip request in ACK Freight. A failure there never undoes the pickup.
  const ack = await sendPickupToAckFreight({
    number: pickupNumber(request.seq),
    clientLabel: client,
    shipperName: shipper,
    shipperAddress: data.shipperAddress,
    contactName: data.contactName,
    contactPhone: data.contactPhone,
    contactEmail: data.contactEmail,
    consigneeName: data.consigneeName,
    destination: data.destination,
    pieces: data.pieces,
    weightKg: weight,
    description: data.description,
    pickupDate: data.pickupDate,
    readyTime: data.readyTime,
    truckerName: data.truckerName,
    truckerPhone: data.truckerPhone,
    driverName: data.driverName,
    notes: data.notes,
    awb: assigned,
  });
  const ackNote =
    ack.state === "skipped"
      ? ""
      : ack.state === "failed"
        ? ` The trip request could not be created in ACK Freight: ${ack.message}`
        : ` ${ack.message}`;
  revalidatePath("/guias/pickups");
  revalidatePath("/guias");
  if (assignError) back(`Pickup ${pickupNumber(request.seq)} created with its AWB draft, but its AWB number was not assigned. ${assignError}${ackNote}`, "error");
  back(
    `Pickup ${pickupNumber(request.seq)} created. Its AWB draft is already in AWBs${assigned ? ` with AWB ${assigned}` : ""}.${ackNote}`,
    ack.state === "failed" ? "error" : "notice",
  );
}

/** Deletes the request. The draft AWB it started stays, since it may already have been worked on. */
export async function deletePickupRequest(formData: FormData) {
  await requireTeam();
  const id = text(formData.get("id"));
  const found = await prisma.pickupRequest.findUnique({ where: { id }, select: { seq: true } });
  if (!found) back("Pickup not found.", "error");
  await prisma.pickupRequest.delete({ where: { id } });
  revalidatePath("/guias/pickups");
  back(`Pickup ${pickupNumber(found.seq)} deleted. Its AWB draft stays in AWBs.`);
}

/**
 * Corrects a pickup request, also after its AWB is issued. The AWB it started follows the correction in the fields that
 * still hold what the request had (see planPickupSync), so the pickup order prints the corrected data. The client is not
 * changed here, since it also decides how the AWB is billed: that is done in the AWB.
 */
export async function updatePickupRequest(formData: FormData) {
  const user = await requireTeam();
  const id = text(formData.get("id"));
  const existing = await prisma.pickupRequest.findUnique({
    where: { id },
    include: { guia: { include: { lines: { orderBy: { sortOrder: "asc" }, take: 1 } } } },
  });
  if (!existing) back("Pickup not found.", "error");
  const shipper = text(formData.get("shipper"));
  if (!shipper) redirect(`/guias/pickups/${id}?error=${encodeURIComponent("Type the shipper: where the cargo is picked up from.")}`);
  const pieces = numberOrNull(text(formData.get("pieces")));
  const weight = roundUpOrNull(numberOrNull(text(formData.get("weightKg"))));
  const data = {
    shipperName: shipper,
    shipperAddress: area(formData.get("shipperAddress")),
    contactName: text(formData.get("contactName")) || null,
    contactPhone: text(formData.get("contactPhone")) || null,
    contactEmail: text(formData.get("contactEmail")) || null,
    consigneeName: text(formData.get("consignee")) || null,
    consigneeAddress: area(formData.get("consigneeAddress")) || null,
    destination: text(formData.get("destination")).toUpperCase() || null,
    pieces: pieces == null ? null : Math.round(pieces),
    packageType: packageTypeFrom(formData.get("packageType")) || null,
    weightKg: weight,
    description: area(formData.get("description")) || null,
    pickupDate: text(formData.get("pickupDate")) || null,
    readyTime: text(formData.get("readyTime")) || null,
    truckerName: text(formData.get("truckerName")) || null,
    truckerPhone: text(formData.get("truckerPhone")) || null,
    driverName: text(formData.get("driverName")) || null,
    notes: area(formData.get("notes")) || null,
  };
  const fieldsOf = (row: PickupFields): PickupFields => ({
    shipperName: row.shipperName,
    shipperAddress: row.shipperAddress,
    consigneeName: row.consigneeName,
    consigneeAddress: row.consigneeAddress,
    destination: row.destination,
    pieces: row.pieces,
    weightKg: row.weightKg,
    description: row.description,
    truckerName: row.truckerName,
    truckerPhone: row.truckerPhone,
    driverName: row.driverName,
    packageType: row.packageType,
  });
  await prisma.pickupRequest.update({ where: { id }, data });
  let kept: string[] = [];
  let changed = 0;
  const guia = existing.guia;
  if (guia) {
    const line = guia.lines[0];
    const plan = planPickupSync(
      fieldsOf(existing),
      fieldsOf(data),
      {
        shipperName: guia.shipperName,
        shipperAddress: guia.shipperAddress,
        consigneeName: guia.consigneeName,
        consigneeAddress: guia.consigneeAddress,
        destination: guia.destination,
        truckerName: guia.truckerName,
        pickupTruckerName: guia.pickupTruckerName,
        truckerPhone: guia.truckerPhone,
        driverName: guia.driverName,
        packageType: guia.packageType,
        line: line ? { id: line.id, pieces: line.pieces, grossWeight: line.grossWeight, chargeableWeight: line.chargeableWeight, nature: line.nature } : null,
      },
      guia.status === "issued",
    );
    if (Object.keys(plan.guia).length) await prisma.airWaybillDocument.update({ where: { id: guia.id }, data: plan.guia });
    if (line && Object.keys(plan.line).length) await prisma.awbGoodsLine.update({ where: { id: line.id }, data: plan.line });
    if (plan.changes.length) {
      await prisma.guiaChangeLog.createMany({
        data: plan.changes.map((change) => ({ guiaId: guia.id, field: change.field, oldValue: change.oldValue || null, newValue: change.newValue || null, source: "manual", changedBy: user.email })),
      });
    }
    kept = plan.kept;
    changed = plan.changes.length;
    revalidatePath(`/guias/${guia.id}`);
    revalidatePath("/guias");
  }
  revalidatePath("/guias/pickups");
  const number = pickupNumber(existing.seq);
  const guiaNote = !guia ? "" : changed ? ` The pickup order of its AWB follows the correction (${changed} field${changed === 1 ? "" : "s"}).` : " The pickup order of its AWB did not need changes.";
  const keptNote = kept.length ? ` Not changed in the AWB, because it already had its own value: ${kept.join(", ")}.` : "";
  back(`Pickup ${number} updated.${guiaNote}${keptNote} The trip request already sent to ACK Freight is not updated by this.`);
}
