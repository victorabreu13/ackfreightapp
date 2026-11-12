import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const PARTY_ROLES = ["SHIPPER", "CONSIGNEE", "NOTIFY"] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];

export const PARTY_ROLE_LABEL: Record<PartyRole, string> = {
  SHIPPER: "Shipper",
  CONSIGNEE: "Consignatario",
  NOTIFY: "Notify",
};

export function isPartyRole(value: string): value is PartyRole {
  return (PARTY_ROLES as readonly string[]).includes(value);
}

/**
 * Case, accents and punctuation do not matter. Periods and apostrophes are dropped rather than turned
 * into spaces, so "S.A.S." and "SAS" are the same company.
 */
export function normalizePartyName(value: string | null | undefined): string {
  const folded = (value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/['’.]/g, "");
  return folded.replace(/[^A-Z0-9]+/g, " ").trim().replace(/ +/g, " ");
}

export type PartyDraft = {
  agentKey: string;
  guiaClientId: string | null;
  role: PartyRole;
  name: string;
  address: string;
};

type GuiaPartyFields = {
  agentKey: string;
  guiaClientId: string | null;
  createdAt: Date;
  shipperName: string | null;
  shipperAddress: string | null;
  consigneeName: string | null;
  consigneeAddress: string | null;
  notifyName: string | null;
  notifyAddress: string | null;
};

/**
 * The directory rows hidden in past guías: one per client, role and name. The newest guía
 * decides the address, and an older one fills it in when the newest has none.
 */
export function partiesFromGuias(rows: GuiaPartyFields[]): PartyDraft[] {
  const newestFirst = [...rows].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  const found = new Map<string, PartyDraft>();
  for (const row of newestFirst) {
    const entries: Array<[PartyRole, string | null, string | null]> = [
      ["SHIPPER", row.shipperName, row.shipperAddress],
      ["CONSIGNEE", row.consigneeName, row.consigneeAddress],
      ["NOTIFY", row.notifyName, row.notifyAddress],
    ];
    for (const [role, rawName, rawAddress] of entries) {
      const name = (rawName ?? "").trim();
      const key = normalizePartyName(name);
      if (!key) continue;
      const address = (rawAddress ?? "").trim();
      const id = [row.agentKey, row.guiaClientId ?? "", role, key].join("|");
      const existing = found.get(id);
      if (!existing) found.set(id, { agentKey: row.agentKey, guiaClientId: row.guiaClientId, role, name, address });
      else if (!existing.address && address) existing.address = address;
    }
  }
  return [...found.values()];
}

function isUnique(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Copies the parties of every saved guía into the directory. Safe to run again. */
export async function backfillPartiesFromGuias(agentKey: string): Promise<number> {
  const guias = await prisma.airWaybillDocument.findMany({
    where: { product: "guia", agentKey },
    select: {
      agentKey: true,
      guiaClientId: true,
      createdAt: true,
      shipperName: true,
      shipperAddress: true,
      consigneeName: true,
      consigneeAddress: true,
      notifyName: true,
      notifyAddress: true,
    },
  });
  const drafts = partiesFromGuias(guias);
  if (!drafts.length) return 0;
  const created = await prisma.guiaParty.createMany({
    data: drafts.map((draft) => ({
      agentKey: draft.agentKey,
      guiaClientId: draft.guiaClientId,
      role: draft.role,
      name: draft.name,
      normalizedName: normalizePartyName(draft.name),
      address: draft.address || null,
    })),
    skipDuplicates: true,
  });
  return created.count;
}

/** The first time the directory is opened it is filled from the guías that already exist. */
export async function ensureDirectorySeeded(agentKey: string): Promise<void> {
  const existing = await prisma.guiaParty.count({ where: { agentKey } });
  if (existing > 0) return;
  await backfillPartiesFromGuias(agentKey);
}

export type PartyValues = {
  shipper: string;
  shipperAddress: string;
  consignee: string;
  consigneeAddress: string;
  notify: string;
  notifyAddress: string;
};

/**
 * Every saved guía adds its shipper, consignee and notify to the directory under the client.
 * A party that is already there is left alone, except that a blank address is filled in.
 */
export async function rememberGuiaParties(agentKey: string, guiaClientId: string | null, values: PartyValues): Promise<void> {
  const entries: Array<[PartyRole, string, string]> = [
    ["SHIPPER", values.shipper, values.shipperAddress],
    ["CONSIGNEE", values.consignee, values.consigneeAddress],
    ["NOTIFY", values.notify, values.notifyAddress],
  ];
  for (const [role, rawName, rawAddress] of entries) {
    const name = rawName.trim();
    const normalizedName = normalizePartyName(name);
    if (!normalizedName) continue;
    const address = rawAddress.trim();
    const existing = await prisma.guiaParty.findFirst({ where: { agentKey, guiaClientId, role, normalizedName } });
    if (existing) {
      if (!existing.address?.trim() && address) {
        await prisma.guiaParty.update({ where: { id: existing.id }, data: { address } });
      }
      continue;
    }
    try {
      await prisma.guiaParty.create({ data: { agentKey, guiaClientId, role, name, normalizedName, address: address || null } });
    } catch (error) {
      if (!isUnique(error)) throw error;
    }
  }
}

export type LookupItem = { id: string; name: string; address: string; clientName: string };

export async function searchClients(agentKey: string, query: string, limit = 8): Promise<LookupItem[]> {
  const key = normalizePartyName(query);
  const rows = await prisma.guiaClient.findMany({
    where: { agentKey, ...(key ? { normalizedName: { contains: key } } : {}) },
    orderBy: key ? { name: "asc" } : { updatedAt: "desc" },
    take: limit,
  });
  return rows.map((row) => ({ id: row.id, name: row.name, address: "", clientName: "" }));
}

/**
 * Directory matches for one role. The selected client's own parties come first, then anyone else
 * whose name matches. With nothing typed it lists the selected client's parties.
 */
export async function searchParties(input: {
  agentKey: string;
  role: PartyRole;
  query: string;
  clientName?: string;
  limit?: number;
}): Promise<LookupItem[]> {
  const limit = input.limit ?? 8;
  const key = normalizePartyName(input.query);
  const clientKey = normalizePartyName(input.clientName ?? "");
  const client = clientKey
    ? await prisma.guiaClient.findUnique({ where: { agentKey_normalizedName: { agentKey: input.agentKey, normalizedName: clientKey } } })
    : null;
  if (!key && !client) return [];
  const base = { agentKey: input.agentKey, role: input.role, ...(key ? { normalizedName: { contains: key } } : {}) };
  const include = { guiaClient: { select: { name: true } } } as const;
  const own = client
    ? await prisma.guiaParty.findMany({ where: { ...base, guiaClientId: client.id }, orderBy: { name: "asc" }, take: limit, include })
    : [];
  const rest =
    key && own.length < limit
      ? await prisma.guiaParty.findMany({
          where: client ? { ...base, OR: [{ guiaClientId: null }, { guiaClientId: { not: client.id } }] } : base,
          orderBy: { name: "asc" },
          take: limit - own.length,
          include,
        })
      : [];
  return [...own, ...rest].map((row) => ({
    id: row.id,
    name: row.name,
    address: row.address ?? "",
    clientName: row.guiaClient?.name ?? "",
  }));
}
