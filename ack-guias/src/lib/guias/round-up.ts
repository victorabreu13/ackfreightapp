/**
 * The rule for every weight and every dimension typed in a pickup request, a warehouse receipt or a guía: a number with
 * decimals goes up to the next whole number, so 54.2 is 55 and 54 stays 54. The rate is a price, not a weight, so it
 * does not follow this rule.
 */

/** The next whole number up. Floating point noise (54.0000001) does not push a whole number up. */
export function roundUp(value: number): number {
  return Math.ceil(Math.round(value * 1e6) / 1e6);
}

/** Same rule for a number that may be empty. Empty and not-a-number stay as they are. */
export function roundUpOrNull(value: number | null): number | null {
  return value == null || !Number.isFinite(value) ? value : roundUp(value);
}

/** Same rule for what a form field holds. Text that is not a number is left alone. */
export function roundUpText(value: string): string {
  const raw = value.trim();
  if (!raw) return value;
  const parsed = Number(raw.replace(/,/g, ""));
  return Number.isFinite(parsed) ? String(roundUp(parsed)) : value;
}

/** The guía fields that hold a weight or a count and follow the rule. */
export const ROUNDED_GUIA_FIELDS: ReadonlySet<string> = new Set(["pieces", "chargeableKg", "grossKg"]);
