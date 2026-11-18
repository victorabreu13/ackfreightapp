import { parseUnNumbers } from "@/lib/guias/dg";
import type { GuiaValues } from "@/lib/guias/extract";
import { sameNumber, type ManualKey } from "@/lib/guias/guia-manual";
import { roundUp } from "@/lib/guias/round-up";

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

/** A number the guía holds by hand that the receipts do not agree with. The guía keeps its own until the user chooses. */
export type ReceiptConflict = { field: ManualKey; guia: string; wr: string };

/** Hazmat the receipts name and the guía does not declare. Only a suggestion: the guía's Dangerous Goods never changes by itself. */
export type DangerousGoodsSuggestion = { text: string; unNumbers: string[] };

/**
 * What the receipts of a guía give it: the pieces and the weights add up, and the text fields come from the first
 * receipt that has them. The numbers follow the receipts, except the ones the user typed by hand (`manual`), which stay
 * and come back as conflicts when the receipts say something else. The text only fills what the guía left empty. The
 * receipts never change Dangerous Goods or the UN numbers: they only produce a suggestion.
 */
export function applyReceiptsToGuia(
  current: GuiaValues,
  receipts: ReceiptFeed[],
  manual: ReadonlySet<ManualKey> = new Set(),
): { values: GuiaValues; changed: string[]; conflicts: ReceiptConflict[]; dangerousGoods: DangerousGoodsSuggestion | null } {
  const next = { ...current };
  const changed: string[] = [];
  const conflicts: ReceiptConflict[] = [];
  const set = (key: keyof GuiaValues, value: string) => {
    if (next[key] === value) return;
    (next as Record<string, string>)[key] = value;
    changed.push(key);
  };
  const lines = receipts.flatMap((receipt) => receipt.lines);
  const totals = receiptTotals(lines);
  const follow = (key: ManualKey, total: number) => {
    if (total <= 0) return;
    // The guía holds whole numbers: what the receipts add up to goes up to the next one.
    const amount = roundUp(total);
    if (!manual.has(key)) return set(key, String(amount));
    if (!sameNumber(current[key], amount)) conflicts.push({ field: key, guia: current[key], wr: String(amount) });
  };
  follow("pieces", totals.pieces);
  follow("grossKg", totals.weightKg);
  follow("chargeableKg", totals.chargeableKg);
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
  const hazmatText = [...new Set(receipts.map((receipt) => (receipt.dangerousGood ?? "").trim()).filter(Boolean))].join(", ");
  const un = parseUnNumbers(hazmatText).map((number) => `UN${number}`);
  const declared = current.unNumbers.toUpperCase();
  const dangerousGoods = hazmatText && (current.dg !== "1" || un.some((number) => !declared.includes(number))) ? { text: hazmatText, unNumbers: un } : null;
  return { values: next, changed, conflicts, dangerousGoods };
}

/** Whether a dangerous good text names a UN number. */
export function dangerousGoodUns(text: string | null | undefined): string[] {
  return parseUnNumbers(text);
}
