"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canViewFinance } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { costModeFrom, MIN_SETTINGS } from "@/lib/guias/acct-costs";
import { parseRate } from "@/lib/guias/airline-rates";

function text(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

async function requireFinance() {
  await (async () => {
    const user = await getSessionUser();
    if (!user) redirect("/login");
    if (!canViewFinance(user)) redirect("/guias?error=Costs%20is%20only%20for%20the%20accounting");
  })();
}

function back(message: string, kind: "notice" | "error" = "notice"): never {
  redirect(`/guias/costs?${kind}=${encodeURIComponent(message)}`);
}

/** An amount typed in a box: empty is none, a bad one stops the save. */
function money(formData: FormData, name: string): number | null {
  const parsed = parseRate(text(formData.get(name)));
  if (!parsed.ok) back("An amount is not valid. Nothing was saved.", "error");
  return parsed.value;
}

/** A count of pallets typed in a box. */
function pallets(formData: FormData, name: string): number | null {
  const raw = text(formData.get(name));
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) back("The pallets are a whole number, 1 or more. Nothing was saved.", "error");
  return parsed;
}

export async function saveProvider(formData: FormData) {
  await requireFinance();
  const id = text(formData.get("id"));
  const found = await prisma.acctProvider.findUnique({ where: { id }, select: { id: true } });
  if (!found) back("That provider was not found.", "error");
  await prisma.acctProvider.update({
    where: { id },
    data: {
      aliases: text(formData.get("aliases")).split(",").map((name) => name.trim()).filter(Boolean).join(", ") || null,
      pickupMode: costModeFrom(formData.get("pickupMode")),
      pickupTripCost: money(formData, "pickupTripCost"),
      pickupBaseCost: money(formData, "pickupBaseCost"),
      pickupBasePallets: pallets(formData, "pickupBasePallets"),
      pickupStepCost: money(formData, "pickupStepCost"),
      pickupStepPallets: pallets(formData, "pickupStepPallets"),
      transferMode: costModeFrom(formData.get("transferMode")),
      transferTripCost: money(formData, "transferTripCost"),
      transferBaseCost: money(formData, "transferBaseCost"),
      transferBasePallets: pallets(formData, "transferBasePallets"),
      transferStepCost: money(formData, "transferStepCost"),
      transferStepPallets: pallets(formData, "transferStepPallets"),
    },
  });
  revalidatePath("/guias/costs");
  back("Provider saved.");
}

export async function addProvider(formData: FormData) {
  await requireFinance();
  const name = text(formData.get("name")).replace(/\s+/g, " ");
  if (!name) back("Type the name of the provider.", "error");
  const exists = await prisma.acctProvider.findUnique({ where: { name }, select: { id: true } });
  if (exists) back(`${name} is already in the list.`, "error");
  const last = await prisma.acctProvider.aggregate({ _max: { sortOrder: true } });
  await prisma.acctProvider.create({ data: { name, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
  revalidatePath("/guias/costs");
  back(`${name} added. Set how it charges.`);
}

export async function deleteProvider(formData: FormData) {
  await requireFinance();
  const id = text(formData.get("id"));
  const found = await prisma.acctProvider.findUnique({ where: { id }, select: { name: true } });
  if (!found) back("That provider was not found.", "error");
  await prisma.acctProvider.delete({ where: { id } });
  revalidatePath("/guias/costs");
  back(`${found.name} removed.`);
}

/** Saves what handling costs for every ULD in the table. */
export async function saveUldCosts(formData: FormData) {
  await requireFinance();
  const ulds = formData.getAll("uld").map((value) => String(value));
  const handling = formData.getAll("handlingCost").map((value) => String(value));
  const updates: Array<{ uld: string; handlingCost: number }> = [];
  for (let index = 0; index < ulds.length; index += 1) {
    const normal = parseRate(handling[index] ?? "");
    if (!normal.ok) back("An amount is not valid. Nothing was saved.", "error");
    updates.push({ uld: ulds[index], handlingCost: normal.value ?? 0 });
  }
  await prisma.$transaction(updates.map((row) => prisma.acctUldCost.update({ where: { uld: row.uld }, data: { handlingCost: row.handlingCost } })));
  revalidatePath("/guias/costs");
  back("Handling costs saved.");
}

export async function addUld(formData: FormData) {
  await requireFinance();
  const uld = text(formData.get("uld")).toUpperCase().replace(/\s+/g, "");
  if (!uld) back("Type the ULD type, like AKE.", "error");
  const normal = parseRate(text(formData.get("handlingCost")));
  if (!normal.ok) back("An amount is not valid.", "error");
  const exists = await prisma.acctUldCost.findUnique({ where: { uld }, select: { uld: true } });
  if (exists) back(`${uld} is already in the table.`, "error");
  await prisma.acctUldCost.create({ data: { uld, handlingCost: normal.value ?? 0 } });
  revalidatePath("/guias/costs");
  back(`${uld} added.`);
}

export async function deleteUld(formData: FormData) {
  await requireFinance();
  const uld = text(formData.get("uld"));
  await prisma.acctUldCost.deleteMany({ where: { uld } });
  revalidatePath("/guias/costs");
  back(`${uld} removed.`);
}

export async function saveMinimums(formData: FormData) {
  await requireFinance();
  const updates: Array<{ key: string; value: number }> = [];
  for (const setting of MIN_SETTINGS) {
    const parsed = parseRate(text(formData.get(setting.key)));
    if (!parsed.ok) back("A minimum is not a valid amount. Nothing was saved.", "error");
    updates.push({ key: setting.key, value: parsed.value ?? 0 });
  }
  await prisma.$transaction(updates.map((row) => prisma.acctSetting.upsert({ where: { key: row.key }, update: { value: row.value }, create: { key: row.key, value: row.value } })));
  revalidatePath("/guias/costs");
  back("Minimums saved.");
}
