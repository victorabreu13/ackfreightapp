/** The extra charges of a guía, like "DG Charge 150.00". They print one under the other in the Other Charges box and add to Total Prepaid. */
export type OtherCharge = { description: string; amount: number };

/** The box on the air waybill has room for this many lines. */
export const MAX_OTHER_CHARGES = 7;

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

function amountOf(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? cents(parsed) : 0;
}

/** Cleans the rows typed in the form: empty rows go, amounts become numbers, and no more than the box holds are kept. */
export function cleanOtherCharges(rows: Array<{ description?: unknown; amount?: unknown }>): OtherCharge[] {
  return rows
    .map((row) => ({ description: String(row.description ?? "").replace(/\s+/g, " ").trim().slice(0, 60), amount: amountOf(row.amount) }))
    .filter((row) => row.description !== "" || row.amount !== 0)
    .slice(0, MAX_OTHER_CHARGES);
}

/** The stored text of a guía's other charges (JSON), or "" when it has none. */
export function serializeOtherCharges(rows: Array<{ description?: unknown; amount?: unknown }>): string {
  const clean = cleanOtherCharges(rows);
  return clean.length ? JSON.stringify(clean) : "";
}

export function parseOtherCharges(raw: string | null | undefined): OtherCharge[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? cleanOtherCharges(parsed as Array<{ description?: unknown; amount?: unknown }>) : [];
  } catch {
    return [];
  }
}

export function otherChargesTotal(charges: OtherCharge[]): number {
  return cents(charges.reduce((sum, charge) => sum + charge.amount, 0));
}
