import { chargeToLargest, ruleCost, type CostRule } from "@/lib/guias/acct-costs";

/** Cost and sell of one shipment, from the rules of its client, the rate table and the providers. */

/** Money to the cent. A value that is half a cent in the decimals people write (75.675) goes up. */
export function cents(value: number): number {
  return Math.round(Number((value * 100).toPrecision(12))) / 100;
}

/** The airline of an AWB, by the first three digits of its number. */
const PREFIX_AIRLINE: Record<string, string> = { "001": "AA", "045": "LATAM", "729": "AVI", "810": "AJT" };

export function airlineOfAwb(awb: string): string | null {
  const prefix = awb.replace(/\D/g, "").slice(0, 3);
  return PREFIX_AIRLINE[prefix] ?? null;
}

/** The provider a trucker belongs to, by its names. Capitals, spaces and punctuation do not matter. */
export function matchProvider(trucker: string, providers: Array<{ name: string; aliases: string | null }>): string | null {
  const key = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const wanted = key(trucker);
  if (!wanted) return null;
  for (const provider of providers) {
    const names = [provider.name, ...(provider.aliases ?? "").split(",")].map(key).filter((name) => name.length >= 3);
    if (names.some((name) => wanted.includes(name))) return provider.name;
  }
  return null;
}

/** The ULDs of a BUP, from text like "AKE 12345 - 20 PCS, PMC 40106 - 15 PCS". */
export function uldsFromBup(text: string | null | undefined): Array<{ type: string; qty: number }> {
  const counts = new Map<string, number>();
  for (const part of String(text ?? "").split(/[,\n;]+/)) {
    const type = part.trim().match(/^([A-Za-z]{3})\b/)?.[1]?.toUpperCase();
    if (type) counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts].map(([type, qty]) => ({ type, qty }));
}

export function uldText(ulds: Array<{ type: string; qty: number }>): string {
  return ulds.length ? ulds.map((uld) => `${uld.qty}×${uld.type}`).join(", ") : "Loose";
}

export type ClientRules = {
  kopeHandlingPct: number;
  kopeInCost: boolean;
  pickupPerKg: number;
  handlingPerKg: number;
  transferPerKg: number;
  chargeBasis: string;
  insuranceCostPct: number;
  insuranceSoldPct: number;
  awbFee: number;
  flatSellPerKg: number | null;
};

export const NO_RULES: ClientRules = { kopeHandlingPct: 10, kopeInCost: true, pickupPerKg: 0, handlingPerKg: 0, transferPerKg: 0, chargeBasis: "chw", insuranceCostPct: 0.35, insuranceSoldPct: 0.5, awbFee: 0, flatSellPerKg: null };

export type Minimums = { pickup: number; handling: number; transfer: number };

export type EngineInput = {
  rules: ClientRules;
  gross: number;
  chw: number;
  cargoValue: number;
  /** The cost and the sell rate of the lane, per kilo of chargeable weight. */
  lane: { cost: number | null; sell: number | null } | null;
  ulds: Array<{ type: string; qty: number }>;
  /** What handling one ULD costs, by type. */
  uldHandling: Record<string, number>;
  minimums: Minimums;
  /** What the pickup and the transfer cost ACK, already worked out from the providers. */
  pickupCost: number;
  transferCost: number;
  aes: number;
};

export type Lines = {
  airCost: number;
  airSold: number;
  pickupCost: number;
  pickupSold: number;
  handlingCost: number;
  handlingSold: number;
  transferCost: number;
  transferSold: number;
  kopeHandling: number;
  insuranceCost: number;
  insuranceSold: number;
  aes: number;
  awbFee: number;
};

export type Totals = { costTotal: number; invoiced: number; profit: number };

/** The weight a charge is made on: the gross weight or the chargeable weight, by client. */
function basisKg(rules: ClientRules, gross: number, chw: number): number {
  return rules.chargeBasis === "gross" ? gross : chw;
}

/** A charge per kilo with its minimum. A client that is not charged it (rate 0) pays nothing, not the minimum. */
function perKgSold(rate: number, kg: number, minimum: number): number {
  return rate > 0 ? cents(Math.max(minimum, rate * kg)) : 0;
}

export function linesFor(input: EngineInput): Lines {
  const { rules, gross, chw } = input;
  const kg = basisKg(rules, gross, chw);
  const sellRate = rules.flatSellPerKg ?? input.lane?.sell ?? 0;
  const handlingCost = input.ulds.reduce((sum, uld) => sum + uld.qty * (input.uldHandling[uld.type] ?? 0), 0);
  return {
    airCost: cents(chw * (input.lane?.cost ?? 0)),
    airSold: cents(chw * sellRate),
    pickupCost: cents(input.pickupCost),
    pickupSold: perKgSold(rules.pickupPerKg, kg, input.minimums.pickup),
    handlingCost: cents(handlingCost),
    handlingSold: perKgSold(rules.handlingPerKg, kg, input.minimums.handling),
    transferCost: cents(input.transferCost),
    transferSold: perKgSold(rules.transferPerKg, kg, input.minimums.transfer),
    kopeHandling: cents((rules.kopeHandlingPct / 100) * chw),
    insuranceCost: cents((rules.insuranceCostPct / 100) * input.cargoValue),
    insuranceSold: cents((rules.insuranceSoldPct / 100) * input.cargoValue),
    aes: cents(input.aes),
    awbFee: cents(rules.awbFee),
  };
}

/** What a shipment cost, what was invoiced and the profit, from its lines. An invoice total typed by hand takes the place of the sum. */
export function totalsOf(lines: Lines, kopeInCost: boolean, invoicedOverride: number | null = null): Totals {
  const costTotal = cents(lines.airCost + lines.pickupCost + lines.handlingCost + lines.transferCost + lines.insuranceCost + (kopeInCost ? lines.kopeHandling : 0));
  const invoiced = invoicedOverride ?? cents(lines.airSold + lines.pickupSold + lines.handlingSold + lines.transferSold + lines.insuranceSold + lines.aes + lines.awbFee);
  return { costTotal, invoiced, profit: cents(invoiced - costTotal) };
}

/**
 * What the pickup or the transfer of one shipment costs under the rule of its provider. A trip price is charged whole to
 * the biggest shipment of the trip, so the others carry none; a base-and-steps price depends on the pallets of the
 * shipment itself.
 */
export function jobCost(rule: CostRule | null, pallets: number, tripShare: number): number {
  if (!rule) return 0;
  if (rule.mode === "per_trip") return tripShare;
  return ruleCost(rule, pallets) ?? 0;
}

/** The cost of a trip charged to the biggest shipment of its day. Ties go to the first. */
export function tripShares(shipments: Array<{ id: string; chw: number }>, tripCost: number): Map<string, number> {
  return chargeToLargest(shipments.map((shipment) => ({ id: shipment.id, weight: shipment.chw })), tripCost);
}
