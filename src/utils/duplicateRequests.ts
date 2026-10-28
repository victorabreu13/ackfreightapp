import type { AwbLine, TripRequest } from "../types";
import { searchKey } from "./search";

export interface DuplicateGroup {
  key: string;
  awbNumber: string; // as typed on the first request
  requests: TripRequest[];
}

/** Active trip requests that share an AWB (spelling, dashes and spaces don't matter), one group per AWB. */
export function duplicateRequestGroups(requests: TripRequest[]): DuplicateGroup[] {
  const byKey = new Map<string, { awbNumber: string; requests: Map<string, TripRequest> }>();
  for (const request of requests) {
    if (request.status === "cancelled") continue;
    for (const line of request.awbLines ?? []) {
      const key = searchKey(line.awbNumber);
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, { awbNumber: String(line.awbNumber), requests: new Map() });
      byKey.get(key)!.requests.set(request.id, request);
    }
  }
  return [...byKey.entries()]
    .filter(([, g]) => g.requests.size > 1)
    .map(([key, g]) => ({ key, awbNumber: g.awbNumber, requests: [...g.requests.values()] }))
    .sort((a, b) => a.awbNumber.localeCompare(b.awbNumber));
}

/** How many of the AWB's documents a request has on this AWB (AWB, LOA, Delivery Order). */
export function documentCount(request: TripRequest, key: string): number {
  const line = (request.awbLines ?? []).find((l) => searchKey(l.awbNumber) === key);
  return line ? [line.awbFile, line.loaFile, line.doFile].filter(Boolean).length : 0;
}

const SLOTS: [keyof AwbLine, string][] = [
  ["awbFile", "AWB document"],
  ["loaFile", "Letter of Authorization"],
  ["doFile", "Delivery Order"],
];

/** What merging `other` into `keep` would add for this AWB: the documents keep lacks and other has. */
export function previewCopies(keep: TripRequest, other: TripRequest, key: string): string[] {
  const k = (keep.awbLines ?? []).find((l) => searchKey(l.awbNumber) === key);
  const o = (other.awbLines ?? []).find((l) => searchKey(l.awbNumber) === key);
  if (!k || !o) return [];
  return SLOTS.filter(([field]) => !k[field] && o[field]).map(([, label]) => label);
}

/** The request worth keeping by default: most documents on this AWB, then the oldest. */
export function suggestedKeep(group: DuplicateGroup): TripRequest {
  return [...group.requests].sort(
    (a, b) => documentCount(b, group.key) - documentCount(a, group.key) || (a.createdAt ?? 0) - (b.createdAt ?? 0)
  )[0];
}
