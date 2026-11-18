"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canViewFinance } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { chargeBasisFrom, splitError, splitRows } from "@/lib/guias/acct-clients";
import { parseRate } from "@/lib/guias/airline-rates";

function text(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

async function requireFinance() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canViewFinance(user)) redirect("/guias?error=The%20accounting%20is%20only%20for%20the%20accounting");
}

function back(message: string, kind: "notice" | "error" = "notice"): never {
  redirect(`/guias/acct-clients?${kind}=${encodeURIComponent(message)}`);
}

/** An amount in a box: empty is none, a bad one stops the save. */
function amount(formData: FormData, name: string): number | null {
  const parsed = parseRate(text(formData.get(name)));
  if (!parsed.ok) back("An amount is not valid. Nothing was saved.", "error");
  return parsed.value;
}

/** Saves how a client is charged and its default split of the profit. Shipments already made keep their own split. */
export async function saveAcctClient(formData: FormData) {
  await requireFinance();
  const id = text(formData.get("id"));
  const found = await prisma.acctClient.findUnique({ where: { id }, select: { name: true } });
  if (!found) back("That client was not found.", "error");
  const split = splitRows(formData.getAll("payee").map(String), formData.getAll("pct").map(String));
  if (split.error) back(`${found.name}: ${split.error} Nothing was saved.`, "error");
  const problem = splitError(split.rows);
  if (problem) back(`${found.name}: ${problem} Nothing was saved.`, "error");
  const people = new Set((await prisma.acctPerson.findMany({ select: { name: true } })).map((person) => person.name));
  const stranger = split.rows.find((row) => !people.has(row.payee));
  if (stranger) back(`${found.name}: ${stranger.payee} is not on the team. Add them under Team first.`, "error");
  await prisma.$transaction([
    prisma.acctClient.update({
      where: { id },
      data: {
        kopeHandlingPct: amount(formData, "kopeHandlingPct") ?? 0,
        kopeInCost: text(formData.get("kopeInCost")) === "1",
        pickupPerKg: amount(formData, "pickupPerKg") ?? 0,
        handlingPerKg: amount(formData, "handlingPerKg") ?? 0,
        transferPerKg: amount(formData, "transferPerKg") ?? 0,
        chargeBasis: chargeBasisFrom(formData.get("chargeBasis")),
        insuranceCostPct: amount(formData, "insuranceCostPct") ?? 0,
        insuranceSoldPct: amount(formData, "insuranceSoldPct") ?? 0,
        awbFee: amount(formData, "awbFee") ?? 0,
        flatSellPerKg: amount(formData, "flatSellPerKg"),
      },
    }),
    prisma.acctClientSplit.deleteMany({ where: { clientId: id } }),
    prisma.acctClientSplit.createMany({ data: split.rows.map((row) => ({ clientId: id, payee: row.payee, pct: row.pct })) }),
  ]);
  revalidatePath("/guias/acct-clients");
  back(`${found.name} saved.`);
}

/** A new client with the usual rules and a split to complete. */
export async function addAcctClient(formData: FormData) {
  await requireFinance();
  const name = text(formData.get("name")).replace(/\s+/g, " ").toUpperCase();
  if (!name) back("Type the name of the client.", "error");
  const exists = await prisma.acctClient.findUnique({ where: { name }, select: { id: true } });
  if (exists) back(`${name} is already a client.`, "error");
  const house = await prisma.acctPerson.findFirst({ where: { houseShare: true }, select: { name: true } });
  const created = await prisma.acctClient.create({ data: { name } });
  if (house) await prisma.acctClientSplit.create({ data: { clientId: created.id, payee: house.name, pct: 100 } });
  revalidatePath("/guias/acct-clients");
  back(`${name} added. Set its split and its charges.`);
}

export async function deleteAcctClient(formData: FormData) {
  await requireFinance();
  const id = text(formData.get("id"));
  const found = await prisma.acctClient.findUnique({ where: { id }, select: { name: true } });
  if (!found) back("That client was not found.", "error");
  const used = await prisma.acctShipment.count({ where: { client: found.name } });
  if (used > 0) back(`${found.name} has ${used} shipments, so it stays.`, "error");
  await prisma.acctClient.delete({ where: { id } });
  revalidatePath("/guias/acct-clients");
  back(`${found.name} removed.`);
}

/** The email and the house share of each person. The name is the one the splits use, so it does not change here. */
export async function saveTeam(formData: FormData) {
  await requireFinance();
  const ids = formData.getAll("personId").map(String);
  const emails = formData.getAll("email").map(String);
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.acctPerson.update({ where: { id }, data: { email: (emails[index] ?? "").trim().toLowerCase() || null, houseShare: text(formData.get(`house-${id}`)) === "1" } }),
    ),
  );
  revalidatePath("/guias/acct-clients");
  revalidatePath("/guias/commissions");
  back("Team saved.");
}

export async function addPerson(formData: FormData) {
  await requireFinance();
  const name = text(formData.get("name")).replace(/\s+/g, " ");
  if (!name) back("Type the name of the person.", "error");
  const exists = await prisma.acctPerson.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { id: true } });
  if (exists) back(`${name} is already on the team.`, "error");
  const last = await prisma.acctPerson.aggregate({ _max: { sortOrder: true } });
  await prisma.acctPerson.create({ data: { name: name[0].toUpperCase() + name.slice(1), email: text(formData.get("email")).toLowerCase() || null, houseShare: text(formData.get("houseShare")) === "1", sortOrder: (last._max.sortOrder ?? 0) + 1 } });
  revalidatePath("/guias/acct-clients");
  back(`${name} added.`);
}

/** A person in a split or in a shipment stays, since their commissions are on those. */
export async function deletePerson(formData: FormData) {
  await requireFinance();
  const id = text(formData.get("id"));
  const found = await prisma.acctPerson.findUnique({ where: { id }, select: { name: true } });
  if (!found) back("That person was not found.", "error");
  const [inClients, inShipments] = await Promise.all([prisma.acctClientSplit.count({ where: { payee: found.name } }), prisma.acctSplit.count({ where: { payee: found.name } })]);
  if (inClients + inShipments > 0) back(`${found.name} is in the split of ${inClients} clients and of ${inShipments} shipments, so they stay.`, "error");
  await prisma.acctPerson.delete({ where: { id } });
  revalidatePath("/guias/acct-clients");
  back(`${found.name} removed.`);
}
