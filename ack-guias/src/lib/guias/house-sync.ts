import { prisma } from "@/lib/db";
import { guiaValuesOf } from "@/lib/guias/guia-data";
import { manualFieldOf, manualKeysOf, parseDismissed, type ManualKey } from "@/lib/guias/guia-manual";
import { applyHousesToMaster, houseDismissKey, houseNumber, houseTotals, HOUSE_PREFIX, type HouseConflict } from "@/lib/guias/house";

/** The next house number. The counter is one row, raised in the database, so two houses never get the same number. */
export async function nextHouseNumber(): Promise<string> {
  const counter = await prisma.houseCounter.upsert({
    where: { key: HOUSE_PREFIX },
    update: { next: { increment: 1 } },
    create: { key: HOUSE_PREFIX, next: 2 },
  });
  return houseNumber(counter.next - 1);
}

/** Whether a house number is already taken by another house. */
export async function houseNumberTaken(number: string, exceptId?: string): Promise<boolean> {
  const found = await prisma.airWaybillDocument.findFirst({
    where: { product: "house", hawb: { equals: number, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return Boolean(found);
}

export type HouseSyncOptions = {
  /** "reset" when the team asked to take the totals of the houses again. It is written in the change history. */
  source?: "house" | "reset";
  /** Fields whose manual mark is cleared first, so they follow the houses again. */
  reset?: ManualKey[] | "all";
};

/** The totals of the houses of a master, and the notices where a number typed by hand differs. */
export async function masterHouseSummary(masterId: string) {
  const [master, houses] = await Promise.all([
    prisma.airWaybillDocument.findFirst({ where: { id: masterId, product: "guia" }, include: { guiaClient: { select: { name: true } }, lines: { orderBy: { sortOrder: "asc" } } } }),
    prisma.airWaybillDocument.findMany({ where: { masterId, product: "house" }, orderBy: { createdAt: "asc" }, include: { lines: { orderBy: { sortOrder: "asc" } } } }),
  ]);
  if (!master) return null;
  const totals = houseTotals(houses);
  const values = guiaValuesOf(master);
  const result = applyHousesToMaster({ pieces: values.pieces, grossKg: values.grossKg, chargeableKg: values.chargeableKg }, totals, manualKeysOf(master));
  const dismissed = (parseDismissed(master.wrDismissed) as Record<string, string>);
  const conflicts: HouseConflict[] = result.conflicts.filter((conflict) => dismissed[houseDismissKey(conflict.field)] !== conflict.houses);
  return { master, houses, totals, result, conflicts };
}

/**
 * Feeds a draft master from its houses. The pieces and the weights follow the totals of the houses, except the ones
 * typed by hand, which stay and show a notice. A master that is already issued is left exactly as it is. Every change is
 * written to the change history.
 */
export async function syncMasterFromHouses(masterId: string, actor: string, options: HouseSyncOptions = {}): Promise<{ changed: string[]; skipped: boolean }> {
  const found = await prisma.airWaybillDocument.findFirst({ where: { id: masterId, product: "guia" }, select: { status: true, piecesManual: true, grossManual: true, chargeableManual: true, wrDismissed: true } });
  if (!found || found.status === "issued") return { changed: [], skipped: true };
  const source = options.source ?? "house";

  const reset = options.reset === "all" ? (["pieces", "grossKg", "chargeableKg"] as ManualKey[]) : (options.reset ?? []);
  if (reset.length) {
    const flags: Record<string, boolean> = {};
    const dismissed = (parseDismissed(found.wrDismissed) as Record<string, string>);
    for (const key of reset) {
      flags[manualFieldOf(key).flag] = false;
      delete dismissed[houseDismissKey(key)];
    }
    await prisma.airWaybillDocument.update({ where: { id: masterId }, data: { ...flags, wrDismissed: Object.keys(dismissed).length ? JSON.stringify(dismissed) : null } });
  }

  const summary = await masterHouseSummary(masterId);
  if (!summary || summary.houses.length === 0) return { changed: [], skipped: false };
  const { master, result } = summary;
  if (result.changed.length === 0) return { changed: [], skipped: false };

  const lineUpdate: Record<string, number> = {};
  if (result.changed.includes("pieces")) lineUpdate.pieces = Number(result.values.pieces);
  if (result.changed.includes("grossKg")) lineUpdate.grossWeight = Number(result.values.grossKg);
  if (result.changed.includes("chargeableKg")) lineUpdate.chargeableWeight = Number(result.values.chargeableKg);
  const first = master.lines[0];
  if (first) await prisma.awbGoodsLine.update({ where: { id: first.id }, data: lineUpdate });
  else await prisma.awbGoodsLine.create({ data: { documentId: masterId, kgLb: "K", sortOrder: 0, ...lineUpdate } });

  const before = guiaValuesOf(master);
  await prisma.guiaChangeLog.createMany({
    data: result.changed.map((field) => ({ guiaId: masterId, field, oldValue: before[field] || null, newValue: result.values[field] || null, source, changedBy: actor })),
  });
  return { changed: result.changed, skipped: false };
}

/** Keeps the master's own number over the one of its houses. The notice returns only if the houses change. */
export async function keepMasterValueOverHouses(masterId: string, field: ManualKey, housesValue: string): Promise<void> {
  const document = await prisma.airWaybillDocument.findUnique({ where: { id: masterId }, select: { wrDismissed: true } });
  if (!document) return;
  const dismissed = (parseDismissed(document.wrDismissed) as Record<string, string>);
  dismissed[houseDismissKey(field)] = housesValue;
  await prisma.airWaybillDocument.update({ where: { id: masterId }, data: { wrDismissed: JSON.stringify(dismissed) } });
}

