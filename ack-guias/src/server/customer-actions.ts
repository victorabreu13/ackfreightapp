"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { ACK_AGENT_KEY, canManageGuias } from "@/lib/access";
import { getSessionUser, signIn } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  encryptInviteToken,
  hashInviteToken,
  hashPassword,
  inviteExpiry,
  inviteLink,
  inviteState,
  newInviteToken,
  normalizeCustomerEmail,
  passwordProblem,
} from "@/lib/guias/customer-auth";
import { sendMail } from "@/lib/guias/mailer";

function text(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

async function requireTeam() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canManageGuias(user)) redirect("/guias?error=Only%20the%20ACK%20team%20can%20manage%20client%20access");
  return user;
}

function directory(clientId: string, message: { saved?: string; error?: string }): never {
  const search = new URLSearchParams({ client: clientId });
  if (message.saved) search.set("saved", message.saved);
  if (message.error) search.set("error", message.error);
  redirect(`/guias/directory?${search.toString()}`);
}

/** Creates the link a client's contact uses to choose a password, and emails it when email is set up. */
export async function createCustomerInvite(formData: FormData) {
  const user = await requireTeam();
  const clientId = text(formData.get("clientId"));
  const email = normalizeCustomerEmail(text(formData.get("email")));
  const client = await prisma.guiaClient.findFirst({ where: { id: clientId, agentKey: ACK_AGENT_KEY }, select: { id: true, name: true } });
  if (!client) directory("", { error: "Client not found." });
  if (!email) directory(client.id, { error: "Write a valid email." });
  const staff = await prisma.user.findUnique({ where: { email }, select: { role: true } });
  if (staff && staff.role !== "CUSTOMER") directory(client.id, { error: "That email belongs to an ACK team account." });
  const { token, tokenHash } = newInviteToken();
  await prisma.customerInvite.create({
    data: {
      tokenHash,
      tokenEnc: encryptInviteToken(token, process.env.AUTH_SECRET ?? ""),
      email,
      guiaClientId: client.id,
      createdBy: user.email,
      expiresAt: inviteExpiry(),
    },
  });
  const sent = await sendMail({
    to: email,
    subject: "Su acceso a ACK Freight App",
    text: [
      `Hola,`,
      "",
      `ACK TEAM LLC le invita a ver las guías aéreas (AWB) y el estatus de los vuelos de ${client.name}.`,
      "",
      `Cree su clave aquí (el enlace vence en 7 días): ${inviteLink(token)}`,
      "",
      "ACK TEAM LLC",
    ].join("\n"),
  });
  revalidatePath("/guias/directory");
  directory(client.id, { saved: sent.ok ? "invited" : "invited-nomail" });
}

export async function cancelCustomerInvite(formData: FormData) {
  await requireTeam();
  const invite = await prisma.customerInvite.findUnique({ where: { id: text(formData.get("id")) } });
  if (!invite) directory("", { error: "Invitation not found." });
  await prisma.customerInvite.delete({ where: { id: invite.id } });
  revalidatePath("/guias/directory");
  directory(invite.guiaClientId, { saved: "invite-canceled" });
}

/** Takes the login away. The client cannot sign in again until it gets a new invitation. */
export async function revokeCustomerAccess(formData: FormData) {
  await requireTeam();
  const customer = await prisma.user.findUnique({ where: { id: text(formData.get("userId")) } });
  if (!customer || customer.role !== "CUSTOMER") directory("", { error: "Customer not found." });
  await prisma.user.update({ where: { id: customer.id }, data: { active: false, passwordHash: null } });
  revalidatePath("/guias/directory");
  directory(customer.guiaClientId ?? "", { saved: "access-removed" });
}

/** The client's contact picks a password from the link. The same link serves a first registration and a new password. */
export async function registerCustomer(formData: FormData) {
  const token = text(formData.get("token"));
  const back = (error: string): never => redirect(`/register/${encodeURIComponent(token)}?error=${encodeURIComponent(error)}`);
  const invite = await prisma.customerInvite.findUnique({ where: { tokenHash: hashInviteToken(token) } });
  const state = inviteState(invite);
  if (!invite || state !== "ok") return back("Este enlace ya no sirve. Pida uno nuevo a ACK.");
  const password = String(formData.get("password") ?? "");
  if (password !== String(formData.get("confirm") ?? "")) return back("Las claves no coinciden.");
  const problem = passwordProblem(password);
  if (problem) return back(problem);
  const existing = await prisma.user.findUnique({ where: { email: invite.email } });
  if (existing && existing.role !== "CUSTOMER") return back("Ese correo pertenece al equipo de ACK.");
  const passwordHash = await hashPassword(password);
  const name = text(formData.get("name")).slice(0, 120) || existing?.name || null;
  const claimed = await prisma.$transaction(async (tx) => {
    const used = await tx.customerInvite.updateMany({ where: { id: invite.id, usedAt: null }, data: { usedAt: new Date() } });
    if (used.count !== 1) return false;
    await tx.user.upsert({
      where: { email: invite.email },
      create: { email: invite.email, name, role: "CUSTOMER", authProvider: "password", passwordHash, guiaClientId: invite.guiaClientId, active: true },
      update: { name, passwordHash, guiaClientId: invite.guiaClientId, active: true, authProvider: "password" },
    });
    return true;
  });
  if (!claimed) return back("Este enlace ya se usó.");
  try {
    await signIn("customer", { email: invite.email, password, redirectTo: "/portal" });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirect("/login?customer=1");
  }
}
