import { cents, totalsOf, type Lines } from "@/lib/guias/acct-engine";

/**
 * Correcting the amounts of a shipment by hand, from the commissions: each rubro has what it cost ACK and what it was sold
 * for. The totals, the profit and so the commissions follow from the lines. The columns typed by hand are remembered in
 * manualFields so the trip prices, which are shared out again when another AWB is issued, never overwrite them.
 */

export type AmountKey = keyof Lines;

export type AmountRubro = {
  label: string;
  cost?: AmountKey;
  sold?: AmountKey;
};

export const RUBROS: AmountRubro[] = [
  { label: "Air freight", cost: "airCost", sold: "airSold" },
  { label: "Pickup", cost: "pickupCost", sold: "pickupSold" },
  { label: "Handling (ULD)", cost: "handlingCost", sold: "handlingSold" },
  { label: "Transfer", cost: "transferCost", sold: "transferSold" },
  { label: "Insurance", cost: "insuranceCost", sold: "insuranceSold" },
  { label: "Kope handling", cost: "kopeHandling" },
  { label: "AES", sold: "aes" },
  { label: "AWB fee", sold: "awbFee" },
];

export const AMOUNT_KEYS: AmountKey[] = RUBROS.flatMap((rubro) => [rubro.cost, rubro.sold].filter((key): key is AmountKey => Boolean(key)));

export type ShipmentAmounts = Lines & { kopeInCost: boolean; invoicedOverride: number | null; invoiceNo: string | null; note: string | null; manualFields: string | null };

export type EditInput = {
  /** The amounts as typed. A blank one is 0. */
  amounts: Partial<Record<AmountKey, string>>;
  kopeInCost: boolean;
  /** The total of the invoice typed by hand, or blank to let it be the sum of what was sold. */
  invoicedOverride: string;
  invoiceNo: string;
  note: string;
  splits: Array<{ id: string; pct: string }>;
};

export type EditPlan =
  | { error: string }
  | {
      data: Record<string, number | string | boolean | null>;
      splitUpdates: Array<{ id: string; pct: number }>;
      changed: string[];
      totals: { costTotal: number; invoiced: number; profit: number };
    };

/** A typed amount: "1,234.50", "$75", "-20" or blank (0). Null when it is not a number. */
export function parseAmount(value: string | undefined | null): number | null {
  const text = String(value ?? "").replace(/[$,\s]/g, "");
  if (text === "") return 0;
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) && Math.abs(number) <= 10_000_000 ? cents(number) : null;
}

const LABEL: Record<string, string> = {
  airCost: "Air freight cost", airSold: "Air freight sold", pickupCost: "Pickup cost", pickupSold: "Pickup sold", handlingCost: "Handling cost", handlingSold: "Handling sold",
  transferCost: "Transfer cost", transferSold: "Transfer sold", insuranceCost: "Insurance cost", insuranceSold: "Insurance sold", kopeHandling: "Kope handling", aes: "AES", awbFee: "AWB fee",
};

export function planShipmentEdit(current: ShipmentAmounts, currentSplits: Array<{ id: string; pct: number }>, input: EditInput): EditPlan {
  const lines = {} as Lines;
  const changed: string[] = [];
  for (const key of AMOUNT_KEYS) {
    const typed = input.amounts[key];
    // A field that was not sent keeps what it has.
    const value = typed === undefined ? current[key] : parseAmount(typed);
    if (value == null) return { error: `${LABEL[key] ?? key} is not a number.` };
    lines[key] = value;
    if (value !== current[key]) changed.push(key);
  }

  let invoicedOverride: number | null = null;
  if (input.invoicedOverride.trim() !== "") {
    invoicedOverride = parseAmount(input.invoicedOverride);
    if (invoicedOverride == null) return { error: "The invoice total is not a number." };
  }
  if (invoicedOverride !== current.invoicedOverride) changed.push("invoicedOverride");
  if (input.kopeInCost !== current.kopeInCost) changed.push("kopeInCost");

  const splitUpdates: Array<{ id: string; pct: number }> = [];
  const known = new Map(currentSplits.map((split) => [split.id, split.pct]));
  let sum = 0;
  for (const split of currentSplits) {
    const typed = input.splits.find((item) => item.id === split.id);
    const raw = typed?.pct.replace(/[%\s]/g, "") ?? String(split.pct);
    const pct = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return { error: "A percentage must be between 0 and 100." };
    sum += pct;
    if (pct !== known.get(split.id)) splitUpdates.push({ id: split.id, pct });
  }
  if (sum > 100.0001) return { error: `The percentages add up to ${Math.round(sum * 100) / 100}%. They cannot be more than 100%.` };

  const totals = totalsOf(lines, input.kopeInCost, invoicedOverride);
  const invoiceNo = input.invoiceNo.trim().slice(0, 40) || null;
  const note = input.note.trim().slice(0, 4000) || null;
  const manual = new Set((current.manualFields ?? "").split(",").map((item) => item.trim()).filter(Boolean));
  for (const key of changed) if (key in lines) manual.add(key);

  return {
    data: { ...lines, kopeInCost: input.kopeInCost, invoicedOverride, ...totals, invoiceNo, note, manualFields: manual.size ? [...manual].join(",") : null },
    splitUpdates,
    changed,
    totals,
  };
}

/**
 * The invoice total a shipment holds after its invoice was saved. What the client is billed is what was invoiced, so charges
 * added to the invoice (a DGD, an inspection) count in the profit and the commissions. When the invoice is just the sum of
 * what was sold there is nothing typed by hand: null.
 */
export function overrideFromInvoice(soldSum: number, invoiceTotal: number): number | null {
  const total = cents(invoiceTotal);
  return total === cents(soldSum) ? null : total;
}

/** Whether a column was typed by hand, so that a shared-out trip price leaves it alone. */
export function isManual(manualFields: string | null | undefined, key: string): boolean {
  return (manualFields ?? "").split(",").map((item) => item.trim()).includes(key);
}
