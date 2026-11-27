import { parseRate } from "@/lib/guias/airline-rates";

/** Rules of the accounting clients: how a client is charged, and how its profit is shared by default. */

export type SplitRow = { payee: string; pct: number };

/** The rows of a split as typed: a person and a percent each. Empty rows are dropped. */
export function splitRows(payees: string[], pcts: string[]): { rows: SplitRow[]; error: string | null } {
  const rows: SplitRow[] = [];
  for (let index = 0; index < payees.length; index += 1) {
    const payee = payees[index]?.trim() ?? "";
    const rawPct = (pcts[index] ?? "").trim();
    if (!payee && !rawPct) continue;
    if (!payee) return { rows: [], error: "A percent has no person." };
    const parsed = parseRate(rawPct);
    if (!parsed.ok || parsed.value == null || parsed.value <= 0) return { rows: [], error: `The percent of ${payee} is not a number above zero.` };
    rows.push({ payee, pct: parsed.value });
  }
  return { rows, error: null };
}

/** A split is complete when each person is there once and the percents add up to 100. */
export function splitError(rows: SplitRow[]): string | null {
  if (rows.length === 0) return "Add at least one person to the split.";
  const names = rows.map((row) => row.payee.toLowerCase());
  if (new Set(names).size !== names.length) return "A person is in the split twice.";
  const total = rows.reduce((sum, row) => sum + row.pct, 0);
  if (Math.abs(total - 100) > 0.01) return `The split adds up to ${Math.round(total * 100) / 100}%, not 100%.`;
  return null;
}

/** The weight the pickup, the handling and the transfer are charged on. */
export function chargeBasisFrom(value: unknown): "gross" | "chw" {
  return String(value ?? "") === "gross" ? "gross" : "chw";
}

export const BASIS_OPTIONS = [
  { value: "chw", label: "Chargeable weight" },
  { value: "gross", label: "Gross weight" },
] as const;
