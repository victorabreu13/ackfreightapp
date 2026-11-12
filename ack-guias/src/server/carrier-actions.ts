"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function text(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

async function requireTeam() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canManageGuias(user)) redirect("/guias?error=Only%20the%20ACK%20team%20can%20change%20the%20carriers");
  return user;
}

function back(message: string, kind: "notice" | "error" = "notice"): never {
  redirect(`/guias/carriers?${kind}=${encodeURIComponent(message)}`);
}

/** Adds a carrier, or changes the one with `id`. The name and the address print on the air waybill as typed. */
export async function saveCarrier(formData: FormData) {
  await requireTeam();
  const id = text(formData.get("id"));
  const name = text(formData.get("name")).toUpperCase();
  const address = String(formData.get("address") ?? "").replace(/\r\n?/g, "\n").trim();
  const prefix = text(formData.get("prefix"));
  const iata = text(formData.get("iata")).toUpperCase();
  if (!name) back("Type the carrier name.", "error");
  if (prefix && !/^\d{3}$/.test(prefix)) back("The AWB prefix is 3 digits, like 045.", "error");
  if (iata && !/^[A-Z0-9]{2}$/.test(iata)) back("The IATA code is 2 letters or digits, like LA.", "error");
  const data = { name, address, prefix: prefix || null, iata: iata || null };
  if (id) {
    const existing = await prisma.carrier.findUnique({ where: { id }, select: { id: true } });
    if (!existing) back("Carrier not found.", "error");
    await prisma.carrier.update({ where: { id }, data });
  } else {
    await prisma.carrier.create({ data });
  }
  revalidatePath("/guias/carriers");
  back(id ? "Carrier saved. Guías that already use it update when saved again." : "Carrier added.");
}

export async function deleteCarrier(formData: FormData) {
  await requireTeam();
  const id = text(formData.get("id"));
  const used = await prisma.airWaybillDocument.count({ where: { carrierId: id } });
  if (used > 0) back(`Cannot delete: ${used} ${used === 1 ? "guía uses it" : "guías use it"}.`, "error");
  await prisma.carrier.deleteMany({ where: { id } });
  revalidatePath("/guias/carriers");
  back("Carrier borrado.");
}
