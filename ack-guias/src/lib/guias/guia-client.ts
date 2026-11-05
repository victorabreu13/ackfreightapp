import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Bill-to key for one company. "PACIFIKO, LLC" and "pacifiko llc" match.
 * LLC stays. The shipper is not a bill-to.
 */
export function normalizeBillToName(value: string | null | undefined): string {
  const folded = (value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  return folded.replace(/[^A-Z0-9]+/g, " ").trim().replace(/ +/g, " ");
}

export function guiaBillToName(row: {
  guiaClient?: { name: string } | null;
  clientLabel?: string | null;
}): string {
  return row.guiaClient?.name?.trim() || row.clientLabel?.trim() || "";
}

export type GuiaClientLink = { id: string; name: string; agentKey: string };

function isUnique(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Find or create the bill-to client inside this agentKey only.
 * An empty name returns null and does not read the shipper or the Kope client book.
 * The first saved spelling is kept.
 */
export async function ensureGuiaClient(agentKey: string, billTo: string | null | undefined): Promise<GuiaClientLink | null> {
  const key = agentKey.trim();
  const name = (billTo ?? "").trim();
  const normalizedName = normalizeBillToName(name);
  if (!key || !normalizedName) return null;
  const where = { agentKey_normalizedName: { agentKey: key, normalizedName } };
  const existing = await prisma.guiaClient.findUnique({ where });
  if (existing) return { id: existing.id, name: existing.name, agentKey: existing.agentKey };
  try {
    const created = await prisma.guiaClient.create({
      data: { agentKey: key, name, normalizedName },
    });
    return { id: created.id, name: created.name, agentKey: created.agentKey };
  } catch (error) {
    if (!isUnique(error)) throw error;
    const again = await prisma.guiaClient.findUnique({ where });
    return again ? { id: again.id, name: again.name, agentKey: again.agentKey } : null;
  }
}
