"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { driverKey } from "@/lib/guias/drivers";

function text(value: FormDataEntryValue | null): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function requireTeam() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canManageGuias(user)) redirect("/guias?error=Only%20the%20ACK%20team%20can%20change%20the%20drivers");
  return user;
}

function back(message: string, kind: "notice" | "error" = "notice"): never {
  redirect(`/guias/drivers?${kind}=${encodeURIComponent(message)}`);
}

/** Adds a driver, or changes the one with `id`. */
export async function saveTruckDriver(formData: FormData) {
  await requireTeam();
  const id = text(formData.get("id"));
  const carrier = text(formData.get("carrier"));
  const name = text(formData.get("name"));
  const license = text(formData.get("license"));
  const phone = text(formData.get("phone"));
  if (!name) back("Escribe el nombre del driver.", "error");
  const carrierKey = driverKey(carrier);
  const nameKey = driverKey(name);
  const same = await prisma.truckDriver.findUnique({ where: { carrierKey_nameKey: { carrierKey, nameKey } } });
  if (same && same.id !== id) back("Ya existe ese driver con ese carrier.", "error");
  const data = { carrier, name, license: license || null, phone: phone || null, carrierKey, nameKey };
  if (id) {
    const existing = await prisma.truckDriver.findUnique({ where: { id }, select: { id: true } });
    if (!existing) back("No se encontró el driver.", "error");
    await prisma.truckDriver.update({ where: { id }, data });
  } else {
    await prisma.truckDriver.create({ data });
  }
  revalidatePath("/guias/drivers");
  back(id ? "Driver guardado." : "Driver agregado.");
}

export async function deleteTruckDriver(formData: FormData) {
  await requireTeam();
  await prisma.truckDriver.deleteMany({ where: { id: text(formData.get("id")) } });
  revalidatePath("/guias/drivers");
  back("Driver borrado. Los receipts que ya lo usan no cambian.");
}
