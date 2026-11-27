import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { acctNameFor, matchAcctClient } from "@/lib/guias/acct-match";

/**
 * Keeps Clients & team in step with the clients of the AWBs: each client of the AWBs has one accounting client, linked to
 * it. One that already exists under a similar name is linked; otherwise one is made, marked as not configured yet, with
 * the house share as its split, so its first AWB has a place for its charges and its commissions.
 */

export type AcctLinkResult = { id: string; name: string; created: boolean };

async function houseSplit(clientId: string) {
  const house = await prisma.acctPerson.findFirst({ where: { houseShare: true }, select: { name: true } });
  if (house) await prisma.acctClientSplit.create({ data: { clientId, payee: house.name, pct: 100 } });
}

export async function ensureAcctClientFor(guia: { id: string; name: string }): Promise<AcctLinkResult | null> {
  const all = await prisma.acctClient.findMany({ select: { id: true, name: true, guiaClientId: true } });
  const found = matchAcctClient(all, guia);
  if (found) {
    if (found.guiaClientId !== guia.id) await prisma.acctClient.update({ where: { id: found.id }, data: { guiaClientId: guia.id } });
    return { id: found.id, name: found.name, created: false };
  }
  const name = acctNameFor(guia.name);
  if (!name) return null;
  try {
    const created = await prisma.acctClient.create({ data: { name, guiaClientId: guia.id, needsSetup: true } });
    await houseSplit(created.id);
    return { id: created.id, name: created.name, created: true };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    // The name is taken by a client that is linked to another client of the AWBs: this one is left unlinked, to be chosen on the page.
    return null;
  }
}

/** An accounting client for a name that has no client of the AWBs behind it (an AWB typed by hand). */
export async function ensureAcctClientByName(label: string): Promise<AcctLinkResult | null> {
  const name = acctNameFor(label);
  if (!name) return null;
  const all = await prisma.acctClient.findMany({ select: { id: true, name: true, guiaClientId: true } });
  const found = matchAcctClient(all, { id: "", name: label });
  if (found) return { id: found.id, name: found.name, created: false };
  try {
    const created = await prisma.acctClient.create({ data: { name, needsSetup: true } });
    await houseSplit(created.id);
    return { id: created.id, name: created.name, created: true };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const same = await prisma.acctClient.findUnique({ where: { name } });
    return same ? { id: same.id, name: same.name, created: false } : null;
  }
}

/** Every client of the AWBs has its accounting client. Returns how many were made, for the message of the page. */
export async function syncAcctClients(): Promise<number> {
  const guiaClients = await prisma.guiaClient.findMany({ where: { agentKey: "ack" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  let made = 0;
  for (const client of guiaClients) {
    const result = await ensureAcctClientFor(client);
    if (result?.created) made += 1;
  }
  return made;
}
