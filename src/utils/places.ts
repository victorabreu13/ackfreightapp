import type { Place } from "../data/miaPlaces";

// Same place regardless of case, spaces, dots or dashes ("Air-China cargo" = "air china cargo").
export function placeKey(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Suggestions for what's been typed: names starting with it first, then any word starting with it, then containing it. */
export function suggestPlaces(places: Place[], query: string, limit = 6): Place[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const qKey = placeKey(q);
  const scored: { place: Place; rank: number }[] = [];
  for (const place of places) {
    const lower = place.name.toLowerCase();
    if (placeKey(place.name) === qKey) continue; // already exactly what they typed
    let rank = -1;
    if (lower.startsWith(q)) rank = 0;
    else if (lower.split(/[\s/().-]+/).some((w) => w.startsWith(q))) rank = 1;
    else if (lower.includes(q) || placeKey(place.name).includes(qKey)) rank = 2;
    if (rank >= 0) scored.push({ place, rank });
  }
  scored.sort((a, b) => a.rank - b.rank || a.place.name.localeCompare(b.place.name));
  return scored.slice(0, limit).map((s) => s.place);
}

/** Merge the built-in list with saved places, one entry per place. */
export function mergePlaces(builtIn: Place[], saved: string[]): Place[] {
  const seen = new Set(builtIn.map((p) => placeKey(p.name)));
  const out = [...builtIn];
  for (const name of saved) {
    const key = placeKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ name, kind: "Saved place" });
  }
  return out;
}
