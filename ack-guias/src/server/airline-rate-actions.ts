"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeAirline, normalizeDestination, parseRate } from "@/lib/guias/airline-rates";

function text(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/guias?error=Airline%20rates%20is%20only%20for%20administrators");
  return user;
}

function back(message: string, kind: "notice" | "error" = "notice"): never {
  redirect(`/guias/rates?${kind}=${encodeURIComponent(message)}`);
}

/** Saves the sell and the buy rate of every row of one airline. An empty box clears that rate. */
export async function saveAirlineRates(formData: FormData) {
  const user = await requireAdmin();
  const airline = normalizeAirline(text(formData.get("airline")));
  const ids = formData.getAll("rateId").map((value) => String(value));
  const sells = formData.getAll("sellRate").map((value) => String(value));
  const buys = formData.getAll("buyRate").map((value) => String(value));
  const updates: Array<{ id: string; sellRate: number | null; buyRate: number | null }> = [];
  for (let index = 0; index < ids.length; index += 1) {
    const sell = parseRate(sells[index] ?? "");
    const buy = parseRate(buys[index] ?? "");
    if (!sell.ok || !buy.ok) back(`A rate of ${airline} is not a valid amount. Nothing was saved.`, "error");
    updates.push({ id: ids[index], sellRate: sell.value, buyRate: buy.value });
  }
  await prisma.$transaction(
    updates.map((row) => prisma.airlineRate.updateMany({ where: { id: row.id, airline }, data: { sellRate: row.sellRate, buyRate: row.buyRate, updatedBy: user.email } })),
  );
  revalidatePath("/guias/rates");
  back(`Rates of ${airline} saved.`);
}

/** Adds a destination to an airline, or a new airline with its first destination. */
export async function addAirlineRate(formData: FormData) {
  const user = await requireAdmin();
  const airline = normalizeAirline(text(formData.get("airline")));
  const destination = normalizeDestination(text(formData.get("destination")));
  if (!airline) back("Type the airline.", "error");
  if (!destination) back("The destination is an airport code of three letters, like GUA.", "error");
  const sell = parseRate(text(formData.get("sellRate")));
  const buy = parseRate(text(formData.get("buyRate")));
  if (!sell.ok || !buy.ok) back("A rate is not a valid amount.", "error");
  const existing = await prisma.airlineRate.findUnique({ where: { airline_destination: { airline, destination } }, select: { id: true } });
  if (existing) back(`${airline} already has ${destination}. Change it in its table.`, "error");
  const last = await prisma.airlineRate.aggregate({ where: { airline }, _max: { sortOrder: true } });
  await prisma.airlineRate.create({ data: { airline, destination, sellRate: sell.value, buyRate: buy.value, sortOrder: (last._max.sortOrder ?? 0) + 1, updatedBy: user.email } });
  revalidatePath("/guias/rates");
  back(`${destination} added to ${airline}.`);
}

export async function deleteAirlineRate(formData: FormData) {
  await requireAdmin();
  const id = text(formData.get("id"));
  const found = await prisma.airlineRate.findUnique({ where: { id }, select: { airline: true, destination: true } });
  if (!found) back("That rate was not found.", "error");
  await prisma.airlineRate.delete({ where: { id } });
  revalidatePath("/guias/rates");
  back(`${found.destination} removed from ${found.airline}.`);
}
