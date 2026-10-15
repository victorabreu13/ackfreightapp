import type { AwbLine, Trip } from "../types";

// Loose cargo and skids aren't ULDs; every other unit type (PMC, PAG, AKE, …) is.
const NOT_A_ULD = new Set<string>(["Loose", "Skid"]);

export function isUldType(type: string | undefined | null): boolean {
  return !!type && !NOT_A_ULD.has(type);
}

/** ULDs on a trip request: the piece count of every non-loose AWB line. */
export function uldCountForLines(lines: Pick<AwbLine, "type" | "qtyPieces">[]): number {
  return (lines || []).reduce(
    (sum, line) => sum + (isUldType(line?.type) ? Number(line?.qtyPieces) || 0 : 0),
    0
  );
}

/**
 * ULDs on a trip log. Trips logged from a request store the exact count
 * (uldCount); older or manually logged trips fall back to their non-loose units.
 */
export function uldCountForTrip(trip: Pick<Trip, "uldCount" | "unitTypes">): number {
  if (typeof trip.uldCount === "number") return trip.uldCount;
  return (trip.unitTypes || []).filter(isUldType).length;
}
