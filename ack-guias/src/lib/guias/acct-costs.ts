/** Costs of the accounting that do not depend on a client: what the pickups and the transfers cost, and which rate table applies. */

export type CostMode = "per_trip" | "tiered" | "manual";

export const COST_MODES: ReadonlyArray<{ value: CostMode; label: string }> = [
  { value: "per_trip", label: "One price per trip" },
  { value: "tiered", label: "Base price, then steps" },
  { value: "manual", label: "Typed on each shipment" },
];

export function costModeFrom(value: unknown): CostMode {
  const text = String(value ?? "");
  return text === "per_trip" || text === "tiered" ? text : "manual";
}

/** How a provider charges for one kind of job, a pickup or a transfer. */
export type CostRule = {
  mode: CostMode;
  /** per_trip: the price of the whole trip. */
  tripCost: number | null;
  /** tiered: the base price covers the first basePallets. Each further group of stepPallets, or part of one, adds stepCost. */
  baseCost: number | null;
  basePallets: number | null;
  stepCost: number | null;
  stepPallets: number | null;
  /** tiered: the most the job can cost, however many pallets. */
  cap?: number | null;
};

type ProviderRow = {
  pickupMode: string;
  pickupTripCost: number | null;
  pickupBaseCost: number | null;
  pickupBasePallets: number | null;
  pickupStepCost: number | null;
  pickupStepPallets: number | null;
  pickupCap?: number | null;
  transferMode: string;
  transferTripCost: number | null;
  transferBaseCost: number | null;
  transferBasePallets: number | null;
  transferStepCost: number | null;
  transferStepPallets: number | null;
  transferCap?: number | null;
};

/** The rule of a provider for a pickup or for a transfer. */
export function ruleOf(provider: ProviderRow, kind: "pickup" | "transfer"): CostRule {
  return kind === "pickup"
    ? { mode: costModeFrom(provider.pickupMode), tripCost: provider.pickupTripCost, baseCost: provider.pickupBaseCost, basePallets: provider.pickupBasePallets, stepCost: provider.pickupStepCost, stepPallets: provider.pickupStepPallets, cap: provider.pickupCap ?? null }
    : { mode: costModeFrom(provider.transferMode), tripCost: provider.transferTripCost, baseCost: provider.transferBaseCost, basePallets: provider.transferBasePallets, stepCost: provider.transferStepCost, stepPallets: provider.transferStepPallets, cap: provider.transferCap ?? null };
}

const cents = (value: number) => Math.round(value * 100) / 100;

/**
 * What a job costs under a rule. A per-trip rule gives the price of the trip. A tiered rule gives the base price up to
 * its pallets, and each further group of pallets (or a pallet or piece left over) adds the step price: $50 for 4
 * pallets and $10 for each 2 more is 50 for 4, 60 for 5 or 6, 70 for 7 or 8. A manual rule, or one with no price
 * yet, has no cost to give: it is typed on the shipment. A cap, when there is one, is the most a tiered job can cost:
 * RL Services transfers are 40 for the first pallet and 20 for each more, up to 150.
 */
export function ruleCost(rule: CostRule, units: number): number | null {
  if (rule.mode === "per_trip") return rule.tripCost == null ? null : cents(rule.tripCost);
  if (rule.mode !== "tiered") return null;
  if (rule.baseCost == null || units <= 0) return null;
  const basePallets = rule.basePallets ?? 0;
  const extra = Math.max(0, units - basePallets);
  if (extra === 0) return cents(rule.baseCost);
  const stepPallets = Math.max(1, rule.stepPallets ?? 1);
  const total = rule.baseCost + Math.ceil(extra / stepPallets) * (rule.stepCost ?? 0);
  return cents(rule.cap != null ? Math.min(total, rule.cap) : total);
}

/**
 * One trip carries several guías, usually all of the day. Its cost is charged to the biggest guía and the others
 * carry none. A tie goes to the first one listed.
 */
export function chargeToLargest<T extends { id: string; weight: number }>(guias: T[], tripCost: number): Map<string, number> {
  const charged = new Map<string, number>();
  for (const guia of guias) charged.set(guia.id, 0);
  let biggest: T | null = null;
  for (const guia of guias) if (!biggest || guia.weight > biggest.weight) biggest = guia;
  if (biggest) charged.set(biggest.id, cents(tripCost));
  return charged;
}

/** The rate table that applies on a date: the newest one that starts on or before it. */
export function tableFor(starts: Date[], on: Date): Date | null {
  const day = on.getTime();
  let found: Date | null = null;
  for (const start of starts) {
    if (start.getTime() <= day && (!found || start.getTime() > found.getTime())) found = start;
  }
  return found;
}

/** A date as YYYY-MM-DD, the way the table dates travel in the address. */
export function dayText(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The first of the month a table starts, as a name: "From Oct 2026". */
export function tableLabel(date: Date): string {
  return `From ${date.toLocaleString("en-US", { month: "short", timeZone: "UTC" })} ${date.getUTCFullYear()}`;
}

export const MIN_SETTINGS = [
  { key: "minPickupSold", label: "Minimum pickup sold ($)" },
  { key: "minHandlingSold", label: "Minimum handling sold ($)" },
  { key: "minTransferSold", label: "Minimum transfer sold ($)" },
] as const;
