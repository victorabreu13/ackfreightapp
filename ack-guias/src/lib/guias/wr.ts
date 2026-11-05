import { parseUnNumbers } from "@/lib/guias/dg";
import type { GuiaValues } from "@/lib/guias/extract";

/** Receipts are shown as K5500, pickup requests as PU-0001. */
export function receiptNumber(seq: number): string {
  return `K${seq}`;
}

export function pickupNumber(seq: number): string {
  return `PU-${String(seq).padStart(4, "0")}`;
}

export type ReceiptLineInput = {
  pieces: number;
  /** Inches. */
  length: number | null;
  width: number | null;
  height: number | null;
  weightKg: number | null;
};

const CUBIC_INCH_TO_M3 = 0.0000163871;
/** Air cargo volume weight: one kilogram for each 6000 cubic centimeters, which is 166.67 kg for each cubic meter. */
const VOLUME_WEIGHT_PER_M3 = 1000000 / 6000;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** The volume of one handling unit, in cubic meters from its measures in inches. */
export function lineVolumeM3(line: Pick<ReceiptLineInput, "length" | "width" | "height">): number {
  if (!line.length || !line.width || !line.height) return 0;
  return round2(line.length * line.width * line.height * CUBIC_INCH_TO_M3);
}

/** The volume weight of one handling unit, in kg, from the exact volume. */
export function lineVolumeWeightKg(line: Pick<ReceiptLineInput, "length" | "width" | "height">): number {
  if (!line.length || !line.width || !line.height) return 0;
  return round2(line.length * line.width * line.height * CUBIC_INCH_TO_M3 * VOLUME_WEIGHT_PER_M3);
}

export type ReceiptTotals = { pieces: number; weightKg: number; volumeM3: number; volumeWeightKg: number; chargeableKg: number };

/** The totals the receipt shows: each line is rounded first and the totals add the rounded lines. */
export function receiptTotals(lines: ReceiptLineInput[]): ReceiptTotals {
  const pieces = lines.reduce((sum, line) => sum + (line.pieces || 0), 0);
  const weightKg = round2(lines.reduce((sum, line) => sum + round2(line.weightKg ?? 0), 0));
  const volumeM3 = round2(lines.reduce((sum, line) => sum + lineVolumeM3(line), 0));
  const volumeWeightKg = round2(lines.reduce((sum, line) => sum + lineVolumeWeightKg(line), 0));
  return { pieces, weightKg, volumeM3, volumeWeightKg, chargeableKg: Math.max(weightKg, volumeWeightKg) };
}

export type ReceiptFeed = {
  client?: string | null;
  shipperName?: string | null;
  shipperAddress?: string | null;
  consigneeName?: string | null;
  consigneeAddress?: string | null;
  dangerousGood?: string | null;
  lines: Array<ReceiptLineInput & { description?: string | null }>;
};

function firstText(values: Array<string | null | undefined>): string {
  return values.map((value) => (value ?? "").trim()).find(Boolean) ?? "";
}

/**
 * What the receipts of a guía give it: the pieces and the weights add up, and the text fields come from the first
 * receipt that has them. The numbers replace what the guía had. The text only fills what the guía left empty.
 */
export function applyReceiptsToGuia(current: GuiaValues, receipts: ReceiptFeed[]): { values: GuiaValues; changed: string[] } {
  const next = { ...current };
  const changed: string[] = [];
  const set = (key: keyof GuiaValues, value: string) => {
    if (next[key] === value) return;
    (next as Record<string, string>)[key] = value;
    changed.push(key);
  };
  const lines = receipts.flatMap((receipt) => receipt.lines);
  const totals = receiptTotals(lines);
  if (totals.pieces > 0) set("pieces", String(totals.pieces));
  if (totals.weightKg > 0) set("grossKg", String(totals.weightKg));
  if (totals.chargeableKg > 0) set("chargeableKg", String(totals.chargeableKg));
  const fill = (key: keyof GuiaValues, value: string) => {
    if (value && !String(current[key] ?? "").trim()) set(key, value);
  };
  fill("client", firstText(receipts.map((receipt) => receipt.client)));
  fill("shipper", firstText(receipts.map((receipt) => receipt.shipperName)));
  fill("shipperAddress", firstText(receipts.map((receipt) => receipt.shipperAddress)));
  fill("consignee", firstText(receipts.map((receipt) => receipt.consigneeName)));
  fill("consigneeAddress", firstText(receipts.map((receipt) => receipt.consigneeAddress)));
  const descriptions = [...new Set(lines.map((line) => (line.description ?? "").trim()).filter(Boolean))];
  fill("goods", descriptions.join(", "));
  const un = parseUnNumbers(receipts.map((receipt) => receipt.dangerousGood ?? "").join(" "));
  if (un.length && !current.unNumbers.trim()) {
    set("dg", "1");
    set("unNumbers", un.map((number) => `UN${number}`).join(", "));
  }
  return { values: next, changed };
}

/** Whether a dangerous good text names a UN number. */
export function dangerousGoodUns(text: string | null | undefined): string[] {
  return parseUnNumbers(text);
}
