import { sameNumber, type ManualKey } from "@/lib/guias/guia-manual";
import { roundUp } from "@/lib/guias/round-up";

/**
 * A house air waybill is a document of its own (product "house") that travels under one master guía. It has no airline
 * stock number: its number is the HAWB, handed out by ACK in order, like ACK-000123.
 */
export const HOUSE_PREFIX = "ACK";

export function houseNumber(seq: number): string {
  return `${HOUSE_PREFIX}-${String(seq).padStart(6, "0")}`;
}

/** The letters and the digits of a house number, as the three parts at the top of the air waybill. */
export function splitHouseNumber(value: string): { prefix: string; serial: string } {
  const match = value.trim().match(/^([A-Za-z]*)[\s-]*(\d+)$/);
  return match ? { prefix: match[1].toUpperCase(), serial: match[2] } : { prefix: "", serial: value.trim() };
}

/** What a house adds to its master. */
export type HouseWeights = { pieces: number | null; grossWeight: number | null; chargeableWeight: number | null };

export type HouseTotals = { pieces: number; grossKg: number; chargeableKg: number };

export function houseTotals(houses: Array<{ lines: HouseWeights[] }>): HouseTotals {
  const totals = { pieces: 0, grossKg: 0, chargeableKg: 0 };
  for (const house of houses) {
    for (const line of house.lines) {
      totals.pieces += line.pieces ?? 0;
      totals.grossKg += line.grossWeight ?? 0;
      // A house with no chargeable weight of its own bills on its gross weight.
      totals.chargeableKg += line.chargeableWeight ?? line.grossWeight ?? 0;
    }
  }
  return { pieces: totals.pieces, grossKg: roundUp(totals.grossKg), chargeableKg: roundUp(totals.chargeableKg) };
}

export type HouseConflict = { field: ManualKey; guia: string; houses: string };

export type MasterNumbers = { pieces: string; grossKg: string; chargeableKg: string };

/**
 * What the houses of a master add up to, against the numbers of the master. A number nobody typed follows the houses.
 * A number typed by hand stays, and when it differs from the houses it is returned as a conflict, so the screen can show
 * both values and let the team choose.
 */
export function applyHousesToMaster(
  current: MasterNumbers,
  totals: HouseTotals,
  manual: ReadonlySet<ManualKey>,
): { values: MasterNumbers; changed: ManualKey[]; conflicts: HouseConflict[] } {
  const values = { ...current };
  const changed: ManualKey[] = [];
  const conflicts: HouseConflict[] = [];
  for (const key of ["pieces", "grossKg", "chargeableKg"] as const) {
    const amount = totals[key];
    if (amount <= 0) continue;
    if (!manual.has(key)) {
      if (!sameNumber(current[key], amount)) {
        values[key] = String(amount);
        changed.push(key);
      }
    } else if (!sameNumber(current[key], amount)) {
      conflicts.push({ field: key, guia: current[key], houses: String(amount) });
    }
  }
  return { values, changed, conflicts };
}

/** The key a choice to keep the master's own number is remembered under, apart from the warehouse receipts. */
export function houseDismissKey(field: ManualKey): string {
  return `house:${field}`;
}
