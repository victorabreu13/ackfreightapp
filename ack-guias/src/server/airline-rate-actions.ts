"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canViewFinance } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dayText } from "@/lib/guias/acct-costs";
import { airlineCode, normalizeDestination, parseRate } from "@/lib/guias/airline-rates";

function text(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

async function requireFinance() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canViewFinance(user)) redirect("/guias?error=Rates%20is%20only%20for%20the%20accounting");
  return user;
}

/** A table date as it travels in the address and the forms, YYYY-MM-DD. */
function dateFrom(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function back(from: string, message: string, kind: "notice" | "error" = "notice"): never {
  redirect(`/guias/rates?${from ? `from=${from}&` : ""}${kind}=${encodeURIComponent(message)}`);
}

/** Saves the cost and the sell rate of every lane of one table. An empty box clears that rate. */
export async function saveAirlineRates(formData: FormData) {
  const user = await requireFinance();
  const from = text(formData.get("from"));
  const table = dateFrom(from);
  if (!table) back("", "That table has no valid date.", "error");
  const ids = formData.getAll("rateId").map((value) => String(value));
  const sells = formData.getAll("sellRate").map((value) => String(value));
  const costs = formData.getAll("buyRate").map((value) => String(value));
  const updates: Array<{ id: string; sellRate: number | null; buyRate: number | null }> = [];
  for (let index = 0; index < ids.length; index += 1) {
    const sell = parseRate(sells[index] ?? "");
    const cost = parseRate(costs[index] ?? "");
    if (!sell.ok || !cost.ok) back(from, "A rate is not a valid amount. Nothing was saved.", "error");
    updates.push({ id: ids[index], sellRate: sell.value, buyRate: cost.value });
  }
  await prisma.$transaction(
    updates.map((row) => prisma.airlineRate.updateMany({ where: { id: row.id, effectiveFrom: table }, data: { sellRate: row.sellRate, buyRate: row.buyRate, updatedBy: user.email } })),
  );
  revalidatePath("/guias/rates");
  back(from, "Rates saved.");
}

/** Adds a lane, an airline and a destination, to a table. */
export async function addAirlineRate(formData: FormData) {
  const user = await requireFinance();
  const from = text(formData.get("from"));
  const table = dateFrom(from);
  if (!table) back("", "That table has no valid date.", "error");
  const airline = airlineCode(text(formData.get("airline")));
  const destination = normalizeDestination(text(formData.get("destination")));
  if (!airline) back(from, "Type the airline code, like LATAM.", "error");
  if (!destination) back(from, "The destination is an airport code of three letters, like GUA.", "error");
  const sell = parseRate(text(formData.get("sellRate")));
  const cost = parseRate(text(formData.get("buyRate")));
  if (!sell.ok || !cost.ok) back(from, "A rate is not a valid amount.", "error");
  const existing = await prisma.airlineRate.findUnique({ where: { airline_destination_effectiveFrom: { airline, destination, effectiveFrom: table } }, select: { id: true } });
  if (existing) back(from, `${airline} to ${destination} is already in this table.`, "error");
  const last = await prisma.airlineRate.aggregate({ where: { effectiveFrom: table }, _max: { sortOrder: true } });
  await prisma.airlineRate.create({ data: { airline, destination, effectiveFrom: table, sellRate: sell.value, buyRate: cost.value, sortOrder: (last._max.sortOrder ?? 0) + 1, updatedBy: user.email } });
  revalidatePath("/guias/rates");
  back(from, `${airline} to ${destination} added.`);
}

export async function deleteAirlineRate(formData: FormData) {
  await requireFinance();
  const id = text(formData.get("id"));
  const found = await prisma.airlineRate.findUnique({ where: { id }, select: { airline: true, destination: true, effectiveFrom: true } });
  if (!found) back("", "That rate was not found.", "error");
  await prisma.airlineRate.delete({ where: { id } });
  revalidatePath("/guias/rates");
  back(dayText(found.effectiveFrom), `${found.airline} to ${found.destination} removed.`);
}

/** A new table starting on a date, with the lanes of another one to begin from. */
export async function newRateTable(formData: FormData) {
  const user = await requireFinance();
  const start = dateFrom(text(formData.get("newFrom")));
  const source = dateFrom(text(formData.get("copyFrom")));
  if (!start) back(text(formData.get("copyFrom")), "Choose the date the new table starts.", "error");
  const startText = dayText(start);
  const taken = await prisma.airlineRate.count({ where: { effectiveFrom: start } });
  if (taken > 0) back(startText, `There is already a table from ${startText}.`, "error");
  const lanes = source ? await prisma.airlineRate.findMany({ where: { effectiveFrom: source }, orderBy: { sortOrder: "asc" } }) : [];
  if (lanes.length) {
    await prisma.airlineRate.createMany({
      data: lanes.map((lane, index) => ({ airline: lane.airline, destination: lane.destination, effectiveFrom: start, sellRate: lane.sellRate, buyRate: lane.buyRate, sortOrder: index + 1, updatedBy: user.email })),
    });
  }
  revalidatePath("/guias/rates");
  back(startText, lanes.length ? `New table from ${startText}, copied from the one before. Change what is different.` : `Table from ${startText} created. Add its lanes.`);
}
