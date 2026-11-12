"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ACK_AGENT_KEY, canManageGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeBillToName } from "@/lib/guias/guia-client";
import { isPartyRole, normalizePartyName } from "@/lib/guias/parties";

function text(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function blank(value: string): string | null {
  return value || null;
}

async function requireTeam() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canManageGuias(user)) redirect("/guias?error=Only%20the%20ACK%20team%20can%20edit%20the%20directory");
  return user;
}

/** The directory page for a client, with a message. "none" is the group of parties with no client. */
function back(clientId: string, message: { saved?: string; error?: string }): never {
  const search = new URLSearchParams();
  if (clientId) search.set("client", clientId);
  if (message.saved) search.set("saved", message.saved);
  if (message.error) search.set("error", message.error);
  redirect(`/guias/directory?${search.toString()}`);
}

function isUnique(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createParty(formData: FormData) {
  await requireTeam();
  const clientId = text(formData.get("clientId"));
  const role = text(formData.get("role"));
  const name = text(formData.get("name"));
  const normalizedName = normalizePartyName(name);
  const here = clientId || "none";
  if (!isPartyRole(role)) back(here, { error: "Choose shipper, consignee or notify." });
  if (!normalizedName) back(here, { error: "Write the name." });
  const client = clientId && clientId !== "none" ? await prisma.guiaClient.findFirst({ where: { id: clientId, agentKey: ACK_AGENT_KEY } }) : null;
  if (clientId && clientId !== "none" && !client) back(here, { error: "Client not found." });
  try {
    await prisma.guiaParty.create({
      data: {
        agentKey: ACK_AGENT_KEY,
        guiaClientId: client?.id ?? null,
        role,
        name,
        normalizedName,
        address: blank(text(formData.get("address"))),
        phone: blank(text(formData.get("phone"))),
        email: blank(text(formData.get("email"))),
      },
    });
  } catch (error) {
    if (isUnique(error)) back(here, { error: "That name is already in this client's list." });
    throw error;
  }
  revalidatePath("/guias/directory");
  back(here, { saved: "added" });
}

export async function saveParty(formData: FormData) {
  await requireTeam();
  const id = text(formData.get("id"));
  const party = await prisma.guiaParty.findFirst({ where: { id, agentKey: ACK_AGENT_KEY } });
  if (!party) back("", { error: "Not found." });
  const here = party.guiaClientId ?? "none";
  const name = text(formData.get("name"));
  const normalizedName = normalizePartyName(name);
  if (!normalizedName) back(here, { error: "Write the name." });
  try {
    await prisma.guiaParty.update({
      where: { id: party.id },
      data: {
        name,
        normalizedName,
        address: blank(text(formData.get("address"))),
        phone: blank(text(formData.get("phone"))),
        email: blank(text(formData.get("email"))),
      },
    });
  } catch (error) {
    if (isUnique(error)) back(here, { error: "Another entry in this client's list already has that name." });
    throw error;
  }
  revalidatePath("/guias/directory");
  back(here, { saved: "saved" });
}

export async function deleteParty(formData: FormData) {
  await requireTeam();
  const id = text(formData.get("id"));
  const party = await prisma.guiaParty.findFirst({ where: { id, agentKey: ACK_AGENT_KEY } });
  if (!party) back("", { error: "Not found." });
  await prisma.guiaParty.delete({ where: { id: party.id } });
  revalidatePath("/guias/directory");
  back(party.guiaClientId ?? "none", { saved: "deleted" });
}

export async function renameDirectoryClient(formData: FormData) {
  await requireTeam();
  const id = text(formData.get("clientId"));
  const name = text(formData.get("name"));
  const normalizedName = normalizeBillToName(name);
  const client = await prisma.guiaClient.findFirst({ where: { id, agentKey: ACK_AGENT_KEY } });
  if (!client) back("", { error: "Client not found." });
  if (!normalizedName) back(client.id, { error: "Write the client name." });
  try {
    await prisma.guiaClient.update({ where: { id: client.id }, data: { name, normalizedName } });
  } catch (error) {
    if (isUnique(error)) back(client.id, { error: "Another client already has that name." });
    throw error;
  }
  revalidatePath("/guias/directory");
  revalidatePath("/guias/clients");
  back(client.id, { saved: "renamed" });
}

export async function createDirectoryClient(formData: FormData) {
  await requireTeam();
  const name = text(formData.get("name"));
  const normalizedName = normalizeBillToName(name);
  if (!normalizedName) back("", { error: "Write the client name." });
  const existing = await prisma.guiaClient.findUnique({ where: { agentKey_normalizedName: { agentKey: ACK_AGENT_KEY, normalizedName } } });
  if (existing) back(existing.id, { saved: "exists" });
  const created = await prisma.guiaClient.create({ data: { agentKey: ACK_AGENT_KEY, name, normalizedName } });
  revalidatePath("/guias/directory");
  back(created.id, { saved: "client" });
}
