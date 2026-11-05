"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureGuiaClient, normalizeBillToName } from "@/lib/guias/guia-client";

function text(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function back(error?: string): never {
  const search = new URLSearchParams();
  if (error) search.set("error", error);
  else search.set("saved", "1");
  redirect(`/guias/clients?${search.toString()}`);
}

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/guias?error=Clientes%20y%20tarifas%20es%20solo%20para%20administradores");
  return user;
}

function companyKey(value: string): "ack" | null {
  if (value === "ack") return value;
  return null;
}

function rateOrNull(raw: string): number | null | "bad" {
  if (!raw) return null;
  const rate = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(rate) || rate <= 0) return "bad";
  return rate;
}

export async function createCompanyClient(formData: FormData) {
  const user = await requireAdmin();
  const agentKey = companyKey(text(formData.get("agentKey")));
  if (!agentKey) back("Empresa desconocida.");
  const name = text(formData.get("name"));
  if (!normalizeBillToName(name)) back("Escribe el nombre del cliente.");
  const rate = rateOrNull(text(formData.get("ratePerKg")));
  if (rate === "bad") back("Escribe una tarifa por kilo mayor que cero.");
  const client = await ensureGuiaClient(agentKey, name);
  if (!client || client.agentKey !== agentKey) back("No se pudo guardar el cliente.");
  if (rate != null) {
    await prisma.clientAgreedRate.upsert({
      where: { agentKey_guiaClientId: { agentKey: client.agentKey, guiaClientId: client.id } },
      create: { agentKey: client.agentKey, guiaClientId: client.id, ratePerKg: rate, updatedBy: user.email },
      update: { ratePerKg: rate, updatedBy: user.email },
    });
  }
  revalidatePath("/guias/clients");
  back();
}

export async function saveCompanyClientRate(formData: FormData) {
  const user = await requireAdmin();
  const id = text(formData.get("guiaClientId"));
  const postedKey = text(formData.get("agentKey"));
  const row = await prisma.guiaClient.findUnique({ where: { id } });
  if (!row) back("No se encontró el cliente.");
  if (row.agentKey !== "ack" || postedKey !== "ack") back("Ese cliente no es de ACK TEAM LLC.");
  const rate = rateOrNull(text(formData.get("ratePerKg")));
  if (rate === "bad" || rate == null) back("Escribe una tarifa por kilo mayor que cero.");
  await prisma.clientAgreedRate.upsert({
    where: { agentKey_guiaClientId: { agentKey: row.agentKey, guiaClientId: row.id } },
    create: { agentKey: row.agentKey, guiaClientId: row.id, ratePerKg: rate, updatedBy: user.email },
    update: { ratePerKg: rate, updatedBy: user.email },
  });
  revalidatePath("/guias/clients");
  back();
}
