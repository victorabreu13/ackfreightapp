import type { Trip } from "../types";

// Same AWB regardless of case, spaces or dashes ("729-95818844" = "72995818844").
export function awbKey(value: string): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

// A trip log can cover several AWBs ("111,222"); split them apart.
export function awbKeysOfTrip(trip: Pick<Trip, "awbNumber">): string[] {
  return [
    ...new Set(
      String(trip.awbNumber ?? "")
        .split(/[,;\n]/)
        .map(awbKey)
        .filter(Boolean)
    ),
  ];
}

/**
 * Trip logs that share an AWB with at least one other trip log. Returns
 * tripId -> the AWB numbers (as typed) it shares. Same AWB on several trips
 * can be legitimate (split between ULDs), so this only flags them for review.
 */
export function duplicateAwbTrips(trips: Pick<Trip, "id" | "awbNumber">[]): Map<string, string[]> {
  const byKey = new Map<string, { id: string; label: string }[]>();
  for (const trip of trips) {
    const labels = String(trip.awbNumber ?? "")
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const seen = new Set<string>();
    for (const label of labels) {
      const key = awbKey(label);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push({ id: trip.id, label });
    }
  }
  const flagged = new Map<string, string[]>();
  for (const entries of byKey.values()) {
    if (entries.length < 2) continue;
    for (const { id, label } of entries) {
      if (!flagged.has(id)) flagged.set(id, []);
      flagged.get(id)!.push(label);
    }
  }
  return flagged;
}

/** How many distinct AWBs are logged more than once. */
export function duplicateAwbCount(trips: Pick<Trip, "id" | "awbNumber">[]): number {
  const counts = new Map<string, Set<string>>();
  for (const trip of trips) {
    for (const key of awbKeysOfTrip(trip)) {
      if (!counts.has(key)) counts.set(key, new Set());
      counts.get(key)!.add(trip.id);
    }
  }
  let n = 0;
  for (const ids of counts.values()) if (ids.size > 1) n++;
  return n;
}
