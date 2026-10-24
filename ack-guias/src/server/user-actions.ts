"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ACK_AGENT_KEY, isAdmin } from "@/lib/access";
import { adminEmailSet } from "@/lib/auth-role";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeAckEmail, parseUserRole, userRemoveError, userRoleChangeError } from "@/lib/users";

function text(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function back(error?: string): never {
  const search = new URLSearchParams();
  if (error) search.set("error", error);
  else search.set("saved", "1");
  redirect(`/guias/users?${search.toString()}`);
}

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/guias?error=Usuarios%20es%20solo%20para%20administradores");
  return user;
}

function accountingKey(role: string): string | null {
  return role === "ACCOUNTING" ? ACK_AGENT_KEY : null;
}

export async function createUser(formData: FormData) {
  await requireAdmin();
  const email = normalizeAckEmail(text(formData.get("email")));
  const role = parseUserRole(text(formData.get("role")));
  const name = text(formData.get("name")) || null;
  if (!email) back("El correo tiene que ser @ackfreight.com.");
  if (!role) back("Elige un rol.");
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) back("Ese correo ya está en la lista. Edítalo en la tabla.");
  await prisma.user.create({
    data: {
      email,
      name,
      role,
      authProvider: "google",
      active: true,
      accountingAgentKey: accountingKey(role),
    },
  });
  revalidatePath("/guias/users");
  back();
}

export async function updateUser(formData: FormData) {
  await requireAdmin();
  const id = text(formData.get("id"));
  const email = normalizeAckEmail(text(formData.get("email")));
  const role = parseUserRole(text(formData.get("role")));
  const name = text(formData.get("name")) || null;
  if (!id) back("Falta el usuario.");
  if (!email) back("El correo tiene que ser @ackfreight.com.");
  if (!role) back("Elige un rol.");
  const current = await prisma.user.findUnique({ where: { id } });
  if (!current) back("Ese usuario ya no está.");
  const admins = adminEmailSet();
  const activeAdminCount = await prisma.user.count({ where: { role: "ADMIN", active: true } });
  const blocked = userRoleChangeError({
    email: current.email,
    from: current.role,
    to: role,
    activeAdminCount,
    adminEmails: admins,
  });
  if (blocked) back(blocked);
  if (admins.has(current.email) && email !== current.email) {
    back("El correo de una cuenta ADMIN_EMAILS no se cambia aquí.");
  }
  const taken = await prisma.user.findUnique({ where: { email } });
  if (taken && taken.id !== current.id) back("Ese correo ya está en la lista.");
  await prisma.user.update({
    where: { id: current.id },
    data: {
      email,
      name,
      role,
      active: true,
      accountingAgentKey: accountingKey(role),
    },
  });
  revalidatePath("/guias/users");
  back();
}

export async function removeUser(formData: FormData) {
  const actor = await requireAdmin();
  const id = text(formData.get("id"));
  if (!id) back("Falta el usuario.");
  const current = await prisma.user.findUnique({ where: { id } });
  if (!current) back("Ese usuario ya no está.");
  const activeAdminCount = await prisma.user.count({ where: { role: "ADMIN", active: true } });
  const blocked = userRemoveError({
    email: current.email,
    role: current.role,
    activeAdminCount,
    adminEmails: adminEmailSet(),
    actorId: actor.id,
    targetId: current.id,
  });
  if (blocked) back(blocked);
  await prisma.user.delete({ where: { id: current.id } });
  revalidatePath("/guias/users");
  back();
}
