"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canViewFinance } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { chargeBasisFrom, splitError, splitRows } from "@/lib/guias/acct-clients";
import { parseRate } from "@/lib/guias/airline-rates";
import { ensureAcctClientFor } from "@/lib/guias/acct-link";
import { ensureGuiaClient, normalizeBillToName } from "@/lib/guias/guia-client";
import { emailsFrom } from "@/lib/guias/invoice-lines";

function text(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

async function requireFinance() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canViewFinance(user)) redirect("/guias?error=The%20accounting%20is%20only%20for%20the%20accounting");
  return user;
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
  const user = await requireFinance();
  const id = text(formData.get("id"));
  const found = await prisma.acctClient.findUnique({ where: { id }, select: { name: true, guiaClientId: true } });
  if (!found) back("That client was not found.", "error");
  // The client of the AWBs it goes with, and the rate agreed with it per chargeable kilo (what the AWB is priced with).
  const postedLink = text(formData.get("guiaClientId"));
  const guiaClientId = postedLink || found.guiaClientId;
  if (postedLink && postedLink !== found.guiaClientId) {
    const book = await prisma.guiaClient.findFirst({ where: { id: postedLink, agentKey: "ack" }, select: { id: true } });
    if (!book) back(`${found.name}: that client of the AWBs was not found.`, "error");
    const taken = await prisma.acctClient.findFirst({ where: { guiaClientId: postedLink, NOT: { id } }, select: { name: true } });
    if (taken) back(`${found.name}: that client of the AWBs already goes with ${taken.name}.`, "error");
  }
  const agreedText = text(formData.get("agreedRate")).replace(/,/g, "");
  const agreed = agreedText === "" ? null : Number(agreedText);
  if (agreed != null && (!Number.isFinite(agreed) || agreed <= 0)) back(`${found.name}: the agreed rate must be a number greater than zero. Nothing was saved.`, "error");
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
        billToName: text(formData.get("billToName")) || null,
        billToAddress: text(formData.get("billToAddress")) || null,
        billingEmails: emailsFrom(text(formData.get("billingEmails"))).join("\n") || null,
        guiaClientId: guiaClientId || null,
        needsSetup: false,
      },
    }),
    prisma.acctClientSplit.deleteMany({ where: { clientId: id } }),
    prisma.acctClientSplit.createMany({ data: split.rows.map((row) => ({ clientId: id, payee: row.payee, pct: row.pct })) }),
    ...(agreed != null && guiaClientId
      ? [
          prisma.clientAgreedRate.upsert({
            where: { agentKey_guiaClientId: { agentKey: "ack", guiaClientId } },
            create: { agentKey: "ack", guiaClientId, ratePerKg: agreed, updatedBy: user.email },
            update: { ratePerKg: agreed, updatedBy: user.email },
          }),
        ]
      : []),
  ]);
  revalidatePath("/guias/acct-clients");
  back(`${found.name} saved.`);
}

/**
 * A new client. It is one client for the AWBs and for the accounting: it is made in the client book of the AWBs and gets its
 * place here, with the usual rules and the house share as its split, to be completed.
 */
export async function addAcctClient(formData: FormData) {
  await requireFinance();
  const name = text(formData.get("name")).replace(/\s+/g, " ");
  if (!normalizeBillToName(name)) back("Type the name of the client.", "error");
  const book = await ensureGuiaClient("ack", name);
  if (!book) back("The client could not be saved.", "error");
  const made = await ensureAcctClientFor({ id: book.id, name: book.name });
  if (!made) back(`${name}: a client with that name is already here under another one of the AWBs. Choose it in its settings instead.`, "error");
  revalidatePath("/guias/acct-clients");
  revalidatePath("/guias/directory");
  const fresh = made.created || (await prisma.acctClient.findUnique({ where: { id: made.id }, select: { needsSetup: true } }))?.needsSetup;
  back(fresh ? `${book.name} added. Set its split, its charges and its invoice data.` : `${book.name} was already a client: it is here as ${made.name}.`);
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
