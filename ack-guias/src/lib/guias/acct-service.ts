import { codeForPlace } from "@/lib/awb/airports";
import { prisma } from "@/lib/db";
import { ruleCost, ruleOf, tableFor, type CostRule } from "@/lib/guias/acct-costs";
import { airlineOfAwb, linesFor, matchProvider, NO_RULES, totalsOf, tripShares, uldsFromBup, uldText, type ClientRules, type Lines } from "@/lib/guias/acct-engine";
import { AMOUNT_KEYS, isManual, soldFromInvoiceLines } from "@/lib/guias/commission-edit";
import { pickupTruckerOf } from "@/lib/guias/files";
import { ensureAcctClientByName, ensureAcctClientFor } from "@/lib/guias/acct-link";
import { normalizeBillToName } from "@/lib/guias/bill-to-name";

/** The accounting row of an AWB: made when the AWB is issued, from its numbers, its client and its truckers. */

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
  aes: number; awbFee: number; otherCost: number; otherSold: number; invoicedOverride: number | null;
};

/** The totals of a shipment from the lines it holds. */
export function totalsFromShipment(shipment: ShipmentLines) {
  const lines: Lines = {
    airCost: shipment.airCost, airSold: shipment.airSold, pickupCost: shipment.pickupCost, pickupSold: shipment.pickupSold,
    handlingCost: shipment.handlingCost, handlingSold: shipment.handlingSold, transferCost: shipment.transferCost, transferSold: shipment.transferSold,
    kopeHandling: shipment.kopeHandling, insuranceCost: shipment.insuranceCost, insuranceSold: shipment.insuranceSold, aes: shipment.aes, awbFee: shipment.awbFee,
    otherCost: shipment.otherCost, otherSold: shipment.otherSold,
  };
  return totalsOf(lines, shipment.kopeInCost, shipment.invoicedOverride);
}

/**
 * Makes the shipment follow its invoice: each line of the invoice goes to the rubro it belongs to (PICKUP to the pickup,
 * AIRFREIGHT to the air freight, and so on), and a charge with no rubro of its own (a DGD, an inspection) goes to the other
 * charges. So the amounts, the profit and the commissions are those of what the client is billed. Called each time the draft of
 * the invoice is saved.
 */
export async function syncShipmentWithInvoice(shipmentId: string, invoiceLines: Array<{ product: string; amount: number }>): Promise<void> {
  const shipment = await prisma.acctShipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) return;
  const sold = soldFromInvoiceLines(invoiceLines);
  const changed = { ...shipment, ...sold, invoicedOverride: null };
  const totals = totalsFromShipment(changed);
  const same = (Object.keys(sold) as Array<keyof typeof sold>).every((key) => shipment[key] === sold[key]);
  if (same && shipment.invoicedOverride === null && totals.invoiced === shipment.invoiced && totals.profit === shipment.profit) return;
  await prisma.acctShipment.update({ where: { id: shipmentId }, data: { ...sold, invoicedOverride: null, ...totals } });
}

/**
 * The accounting client of an AWB: the one linked to its client, or the one whose name matches. When there is none it is
 * made now, marked as not configured, so the AWB is never left without a client in Clients & team.
 */
async function clientFor(name: string, guiaClientId: string | null) {
  const withSplits = { splits: true } as const;
  if (guiaClientId) {
    const linked = await prisma.acctClient.findUnique({ where: { guiaClientId }, include: withSplits });
    if (linked) return linked;
  }
  const wanted = normalizeBillToName(name);
  if (!wanted) return null;
  const clients = await prisma.acctClient.findMany({ include: withSplits });
  const found =
    clients.find((client) => normalizeBillToName(client.name) === wanted) ??
    clients.find((client) => {
      const key = normalizeBillToName(client.name);
      return key.length >= 3 && (wanted.startsWith(`${key} `) || wanted === key);
    }) ??
    null;
  if (found) return found;
  const made = guiaClientId ? await ensureAcctClientFor({ id: guiaClientId, name }) : await ensureAcctClientByName(name);
  return made ? prisma.acctClient.findUnique({ where: { id: made.id }, include: withSplits }) : null;
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
    // A cost corrected by hand stays as it was typed.
    if (isManual(shipment.manualFields, kind === "pickup" ? "pickupCost" : "transferCost")) continue;
    const cost = shares.get(shipment.id) ?? 0;
    const changed = { ...shipment, ...(kind === "pickup" ? { pickupCost: cost } : { transferCost: cost }) };
    const totals = totalsFromShipment(changed);
    await prisma.acctShipment.update({ where: { id: shipment.id }, data: { ...(kind === "pickup" ? { pickupCost: cost } : { transferCost: cost }), ...totals } });
  }
}

/**
 * Works out the accounting numbers of an issued AWB: the client rules, the rate table of the date, the ULDs of its BUP and
 * the providers of its pickup order and its delivery order give its costs and its sell. What could not be worked out is in
 * the notes, to be filled in by hand. Null when the AWB is not issued.
 */
async function buildAcct(guiaId: string, date: Date) {
  const guia = await prisma.airWaybillDocument.findFirst({ where: { id: guiaId, product: "guia", status: "issued" }, include: { lines: { orderBy: { sortOrder: "asc" } }, guiaClient: { select: { name: true } } } });
  if (!guia) return null;
  const notes: string[] = [];
  const clientLabel = guia.guiaClient?.name || guia.clientLabel || "";
  const client = await clientFor(clientLabel, guia.guiaClientId);
  if (client?.needsSetup) notes.push(`The client ${client.name} was made automatically and is not configured yet: set how it is charged, its split and its invoice data in Clients & team.`);
  if (!client) notes.push(`No accounting client matches "${clientLabel}": its rules and its split were left empty.`);
  const rules: ClientRules = client ?? NO_RULES;

  const awb = guia.awb.trim();
  const airline = airlineOfAwb(awb) ?? (guia.carrierName ?? "").toUpperCase();
  const dest = destinationCode(guia.destination);
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
  return {
    client, rules, lines, notes, pickupProvider, transferProvider,
    fields: {
      client: client?.name ?? (clientLabel.toUpperCase() || "NO CLIENT"), awb, airline, dest, uldText: uldText(ulds), pcs, gross, chw,
      costRate: lane?.buyRate ?? null, sellRate: rules.flatSellPerKg ?? lane?.sellRate ?? null,
    },
  };
}

/** Makes the accounting row of an issued AWB, once. */
export async function createAcctForGuia(guiaId: string): Promise<{ created: boolean; notes: string[] }> {
  const existing = await prisma.acctShipment.findUnique({ where: { guiaId }, select: { id: true } });
  if (existing) return { created: false, notes: [] };
  const date = day(today());
  const built = await buildAcct(guiaId, date);
  if (!built) return { created: false, notes: [] };
  const { client, rules, lines, notes, pickupProvider, transferProvider } = built;
  const totals = totalsOf(lines, rules.kopeInCost);
  const created = await prisma.acctShipment.create({
    data: {
      guiaId, date, ...built.fields, pickupProvider, transferProvider, kopeInCost: rules.kopeInCost,
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

/**
 * Works a shipment out again with the rules the client has now: for an AWB that was issued before its client was
 * configured. The amounts typed by hand are kept, and so are the splits once somebody was paid. A shipment that already has
 * an invoice is left alone, because the invoice was made from its numbers.
 */
export async function recalcShipment(shipmentId: string): Promise<{ ok: true; notes: string[] } | { ok: false; error: string }> {
  const shipment = await prisma.acctShipment.findUnique({ where: { id: shipmentId }, include: { splits: true } });
  if (!shipment) return { ok: false, error: "That shipment was not found." };
  if (!shipment.guiaId) return { ok: false, error: "This shipment did not come from an AWB of the system, so it cannot be worked out again." };
  const invoice = await prisma.invoice.findUnique({ where: { shipmentId }, select: { number: true } });
  if (invoice) return { ok: false, error: `Invoice #${invoice.number} was already made from this shipment. Correct its amounts by hand instead.` };
  const built = await buildAcct(shipment.guiaId, shipment.date);
  if (!built) return { ok: false, error: "The AWB of this shipment is not issued." };
  const lines = { ...built.lines };
  for (const key of AMOUNT_KEYS) if (isManual(shipment.manualFields, key)) lines[key] = shipment[key];
  const kopeInCost = isManual(shipment.manualFields, "kopeInCost") ? shipment.kopeInCost : built.rules.kopeInCost;
  const totals = totalsOf(lines, kopeInCost, shipment.invoicedOverride);
  const clientSplits = built.client?.splits ?? [];
  const anyPaid = shipment.splits.some((split) => split.paid);
  await prisma.$transaction([
    prisma.acctShipment.update({
      where: { id: shipmentId },
      data: { ...built.fields, pickupProvider: built.pickupProvider, transferProvider: built.transferProvider, kopeInCost, ...lines, ...totals, note: built.notes.length ? built.notes.join(" ") : null },
    }),
    ...(!anyPaid && clientSplits.length
      ? [
          prisma.acctSplit.deleteMany({ where: { shipmentId } }),
          prisma.acctSplit.createMany({ data: clientSplits.map((split) => ({ shipmentId, payee: split.payee, pct: split.pct })) }),
        ]
      : []),
  ]);
  if (built.pickupProvider) await settleTrips(shipment.date, built.pickupProvider, "pickup");
  if (built.transferProvider) await settleTrips(shipment.date, built.transferProvider, "transfer");
  return { ok: true, notes: built.notes };
}
