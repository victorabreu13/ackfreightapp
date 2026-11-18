import { codeForPlace } from "@/lib/awb/airports";
import { prisma } from "@/lib/db";
import { ruleCost, ruleOf, tableFor, type CostRule } from "@/lib/guias/acct-costs";
import { airlineOfAwb, linesFor, matchProvider, NO_RULES, totalsOf, tripShares, uldsFromBup, uldText, type ClientRules, type Lines } from "@/lib/guias/acct-engine";
import { pickupTruckerOf } from "@/lib/guias/files";
import { normalizeBillToName } from "@/lib/guias/guia-client";

/** The accounting row of a guía: made when the guía is issued, from its numbers, its client and its truckers. */

/** Today in New York, as YYYY-MM-DD. */
function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

/** The airport code of a destination: the three letters in parentheses, the code itself, or the code of the place. */
export function destinationCode(value: string | null | undefined): string {
  const text = (value ?? "").trim().toUpperCase();
  const inParentheses = text.match(/\(([A-Z]{3})\)/)?.[1];
  if (inParentheses) return inParentheses;
  if (/^[A-Z]{3}$/.test(text)) return text;
  const known = codeForPlace(value);
  return /^[A-Z]{3}$/.test(known) ? known : text;
}

type ShipmentLines = {
  airCost: number; airSold: number; pickupCost: number; pickupSold: number; handlingCost: number; handlingSold: number;
  transferCost: number; transferSold: number; kopeHandling: number; kopeInCost: boolean; insuranceCost: number; insuranceSold: number;
  aes: number; awbFee: number; invoicedOverride: number | null;
};

/** The totals of a shipment from the lines it holds. */
export function totalsFromShipment(shipment: ShipmentLines) {
  const lines: Lines = {
    airCost: shipment.airCost, airSold: shipment.airSold, pickupCost: shipment.pickupCost, pickupSold: shipment.pickupSold,
    handlingCost: shipment.handlingCost, handlingSold: shipment.handlingSold, transferCost: shipment.transferCost, transferSold: shipment.transferSold,
    kopeHandling: shipment.kopeHandling, insuranceCost: shipment.insuranceCost, insuranceSold: shipment.insuranceSold, aes: shipment.aes, awbFee: shipment.awbFee,
  };
  return totalsOf(lines, shipment.kopeInCost, shipment.invoicedOverride);
}

/** The accounting client of a guía, by its name. */
async function clientFor(name: string) {
  const wanted = normalizeBillToName(name);
  if (!wanted) return null;
  const clients = await prisma.acctClient.findMany({ include: { splits: true } });
  return (
    clients.find((client) => normalizeBillToName(client.name) === wanted) ??
    clients.find((client) => {
      const key = normalizeBillToName(client.name);
      return key.length >= 3 && (wanted.startsWith(`${key} `) || wanted === key);
    }) ??
    null
  );
}

/**
 * Charges the cost of a trip price to the biggest shipment of the day, and none to the rest. A provider that charges by
 * pallets has nothing to share, since each shipment carries its own price.
 */
export async function settleTrips(date: Date, provider: string, kind: "pickup" | "transfer") {
  const found = await prisma.acctProvider.findUnique({ where: { name: provider } });
  if (!found) return;
  const rule = ruleOf(found, kind);
  if (rule.mode !== "per_trip" || rule.tripCost == null) return;
  const column = kind === "pickup" ? "pickupProvider" : "transferProvider";
  const shipments = await prisma.acctShipment.findMany({ where: { date, [column]: provider }, orderBy: { createdAt: "asc" } });
  if (shipments.length === 0) return;
  const shares = tripShares(shipments.map((shipment) => ({ id: shipment.id, chw: shipment.chw })), rule.tripCost);
  for (const shipment of shipments) {
    const cost = shares.get(shipment.id) ?? 0;
    const changed = { ...shipment, ...(kind === "pickup" ? { pickupCost: cost } : { transferCost: cost }) };
    const totals = totalsFromShipment(changed);
    await prisma.acctShipment.update({ where: { id: shipment.id }, data: { ...(kind === "pickup" ? { pickupCost: cost } : { transferCost: cost }), ...totals } });
  }
}

/**
 * Makes the accounting row of an issued guía, once. The client rules, the rate table of its date, the ULDs of its BUP and
 * the providers of its pickup order and its delivery order give its costs and its sell. What could not be worked out
 * is written in the note of the row, to be filled in by hand.
 */
export async function createAcctForGuia(guiaId: string): Promise<{ created: boolean; notes: string[] }> {
  const existing = await prisma.acctShipment.findUnique({ where: { guiaId }, select: { id: true } });
  if (existing) return { created: false, notes: [] };
  const guia = await prisma.airWaybillDocument.findFirst({ where: { id: guiaId, product: "guia", status: "issued" }, include: { lines: { orderBy: { sortOrder: "asc" } }, guiaClient: { select: { name: true } } } });
  if (!guia) return { created: false, notes: [] };
  const notes: string[] = [];
  const clientLabel = guia.guiaClient?.name || guia.clientLabel || "";
  const client = await clientFor(clientLabel);
  if (!client) notes.push(`No accounting client matches "${clientLabel}": its rules and its split were left empty.`);
  const rules: ClientRules = client ?? NO_RULES;

  const awb = guia.awb.trim();
  const airline = airlineOfAwb(awb) ?? (guia.carrierName ?? "").toUpperCase();
  const dest = destinationCode(guia.destination);
  const date = day(today());
  const line = guia.lines[0];
  const pcs = line?.pieces ?? 0;
  const gross = line?.grossWeight ?? 0;
  const chw = line?.chargeableWeight ?? gross;

  const starts = (await prisma.airlineRate.findMany({ distinct: ["effectiveFrom"], select: { effectiveFrom: true } })).map((row) => row.effectiveFrom);
  const table = tableFor(starts, date);
  const lane = table ? await prisma.airlineRate.findFirst({ where: { airline, destination: dest, effectiveFrom: table } }) : null;
  if (!lane) notes.push(`No rate for ${airline} to ${dest} in the table of the day: the air freight was left at 0.`);
  else if (lane.buyRate == null || lane.sellRate == null) notes.push(`The rate of ${airline} to ${dest} is missing its ${lane.buyRate == null ? "cost" : "sell"}.`);

  const ulds = guia.bup ? uldsFromBup(guia.bupItems) : [];
  const uldHandling = Object.fromEntries((await prisma.acctUldCost.findMany()).map((row) => [row.uld, row.handlingCost]));
  for (const uld of ulds) if (!(uld.type in uldHandling)) notes.push(`The ULD ${uld.type} has no handling cost in Costs.`);

  // The pickup trucker is read from the pickup order and the trucker from the delivery order. Each is a provider by its name.
  const providers = await prisma.acctProvider.findMany();
  const pickupTrucker = pickupTruckerOf(guia);
  const transferTrucker = (guia.truckerName ?? "").trim();
  const pickupProvider = matchProvider(pickupTrucker, providers);
  const transferProvider = matchProvider(transferTrucker, providers);
  if (pickupTrucker && !pickupProvider) notes.push(`The pickup trucker "${pickupTrucker}" is not a provider in Costs: the pickup cost is typed.`);
  if (transferTrucker && !transferProvider) notes.push(`The trucker "${transferTrucker}" is not a provider in Costs: the transfer cost is typed.`);

  // A base-and-steps provider charges by the pallets of the pickup order, which are its pieces. A trip price is shared out afterwards.
  const ruleFor = (name: string | null, kind: "pickup" | "transfer"): CostRule | null => {
    const found = providers.find((provider) => provider.name === name);
    return found ? ruleOf(found, kind) : null;
  };
  const pickupRule = ruleFor(pickupProvider, "pickup");
  const transferRule = ruleFor(transferProvider, "transfer");
  const tiered = (rule: CostRule | null, units: number) => (rule?.mode === "tiered" ? (ruleCost(rule, units) ?? 0) : 0);
  if (pickupRule?.mode === "manual") notes.push(`The pickup by ${pickupProvider} is typed.`);
  if (transferRule?.mode === "manual") notes.push(`The transfer by ${transferProvider} is typed.`);

  const settings = Object.fromEntries((await prisma.acctSetting.findMany()).map((row) => [row.key, row.value]));
  const lines = linesFor({
    rules, gross, chw, cargoValue: 0,
    lane: lane ? { cost: lane.buyRate, sell: lane.sellRate } : null,
    ulds, uldHandling,
    minimums: { pickup: settings.minPickupSold ?? 75, handling: settings.minHandlingSold ?? 75, transfer: settings.minTransferSold ?? 75 },
    pickupCost: tiered(pickupRule, pcs), transferCost: tiered(transferRule, pcs), aes: 0,
  });
  const totals = totalsOf(lines, rules.kopeInCost);
  const created = await prisma.acctShipment.create({
    data: {
      guiaId, date, client: client?.name ?? (clientLabel.toUpperCase() || "NO CLIENT"), awb, airline, dest, uldText: uldText(ulds), pcs, gross, chw,
      costRate: lane?.buyRate ?? null, sellRate: rules.flatSellPerKg ?? lane?.sellRate ?? null,
      pickupProvider, transferProvider, kopeInCost: rules.kopeInCost,
      ...lines, ...totals,
      note: notes.length ? notes.join(" ") : null, source: "guia",
    },
  });
  if (client?.splits.length) {
    await prisma.acctSplit.createMany({ data: client.splits.map((split) => ({ shipmentId: created.id, payee: split.payee, pct: split.pct })) });
  }
  if (pickupProvider) await settleTrips(date, pickupProvider, "pickup");
  if (transferProvider) await settleTrips(date, transferProvider, "transfer");
  return { created: true, notes };
}
