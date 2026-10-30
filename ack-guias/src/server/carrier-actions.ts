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
  if (!name) back("Escribe el nombre del carrier.", "error");
  if (prefix && !/^\d{3}$/.test(prefix)) back("El prefijo del AWB son 3 números, como 045.", "error");
  if (iata && !/^[A-Z0-9]{2}$/.test(iata)) back("El código IATA son 2 letras o números, como LA.", "error");
  const data = { name, address, prefix: prefix || null, iata: iata || null };
  if (id) {
    const existing = await prisma.carrier.findUnique({ where: { id }, select: { id: true } });
    if (!existing) back("No se encontró el carrier.", "error");
    await prisma.carrier.update({ where: { id }, data });
  } else {
    await prisma.carrier.create({ data });
  }
  revalidatePath("/guias/carriers");
  back(id ? "Carrier guardado. Las guías que ya lo usan se actualizan al guardarlas de nuevo." : "Carrier agregado.");
}

export async function deleteCarrier(formData: FormData) {
  await requireTeam();
  const id = text(formData.get("id"));
  const used = await prisma.airWaybillDocument.count({ where: { carrierId: id } });
  if (used > 0) back(`No se puede borrar: ${used} ${used === 1 ? "guía lo usa" : "guías lo usan"}.`, "error");
  await prisma.carrier.deleteMany({ where: { id } });
  revalidatePath("/guias/carriers");
  back("Carrier borrado.");
}
