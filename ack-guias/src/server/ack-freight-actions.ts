"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { sendGuiaToAckFreight } from "@/lib/guias/ack-freight-send";

/**
 * The cargo is ready: asks ACK Freight for the trip request (warehouse to the airline) with the guía's
 * documents. Pressing it twice never makes two: ACK Freight answers that it already has it.
 */
export async function requestAckTripRequest(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canManageGuias(user)) redirect("/guias?error=Only%20the%20ACK%20team%20can%20request%20a%20trip");
  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect("/guias?error=No%20se%20encontr%C3%B3%20la%20gu%C3%ADa");
  const result = await sendGuiaToAckFreight(id);
  revalidatePath(`/guias/${id}`);
  redirect(`/guias/${id}?ack=${result.state}&ackMsg=${encodeURIComponent(result.message)}`);
}
