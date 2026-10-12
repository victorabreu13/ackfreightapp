// Pure helpers behind the Today board, the Live Map and the alerts strip.
// Everything is derived from data the app already stores (tripRequests,
// users, driverLocations) — no writes, no new fields.

import type { DriverLocation, TripRequest, UserProfile } from "../types";
import { isLineMoving, lineStage, TripStage, tripStage, unassignedCount } from "./tripStatus";

/** Same threshold LiveTrackingSection uses for "Last seen". */
export const GPS_STALE_MS = 3 * 60 * 1000;
/** "Pickup soon" window for the no-driver / not-started alerts. */
export const PICKUP_SOON_MS = 60 * 60 * 1000;
/** Grace period before an assigned-but-not-started trip counts as late. */
export const PICKUP_LATE_GRACE_MS = 15 * 60 * 1000;

/** Local Date for a request's tripDate + pickupTime, or null if unparseable. */
export function pickupDate(request: Pick<TripRequest, "tripDate" | "pickupTime">): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(request.tripDate ?? "");
  if (!m) return null;
  const t = /^(\d{1,2}):(\d{2})/.exec(request.pickupTime ?? "");
  const h = t ? Number(t[1]) : 0;
  const min = t ? Number(t[2]) : 0;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, min, 0, 0);
}

export function isOpenStage(stage: TripStage): boolean {
  return stage === "requested" || stage === "assigned" || stage === "to_pickup" || stage === "in_transit";
}

export interface BoardTrip {
  request: TripRequest;
  stage: TripStage;
  /** Open trip from an earlier day that is still not delivered. */
  carriedOver: boolean;
  unassigned: number;
}

/**
 * Trips for one day's board: everything dated that day (except cancelled),
 * plus — when looking at today — open trips from earlier days, so nothing
 * that is still on the road silently drops off the board at midnight.
 */
export function tripsForDay(requests: TripRequest[], day: string, today: string): BoardTrip[] {
  const out: BoardTrip[] = [];
  for (const request of requests) {
    const stage = tripStage(request);
    if (stage === "cancelled") continue;
    const sameDay = request.tripDate === day;
    const carriedOver = day === today && request.tripDate < today && isOpenStage(stage);
    if (!sameDay && !carriedOver) continue;
    out.push({ request, stage, carriedOver, unassigned: unassignedCount(request) });
  }
  out.sort((a, b) => {
    const pa = pickupDate(a.request)?.getTime() ?? 0;
    const pb = pickupDate(b.request)?.getTime() ?? 0;
    return pa - pb;
  });
  return out;
}

export interface DriverState {
  driver: UserProfile;
  /** Has at least one started/loaded line right now. */
  busy: boolean;
  location: DriverLocation | null;
  locationStale: boolean;
  /** Request + stage the driver is currently working, if any. */
  current: { request: TripRequest; stage: TripStage } | null;
}

/** Latest known point per driver across all requests. */
export function latestDriverLocations(requests: TripRequest[]): Record<string, DriverLocation> {
  const out: Record<string, DriverLocation> = {};
  for (const r of requests) {
    for (const [driverId, loc] of Object.entries(r.driverLocations ?? {})) {
      if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") continue;
      if (!out[driverId] || (loc.updatedAt ?? 0) > (out[driverId].updatedAt ?? 0)) {
        out[driverId] = loc;
      }
    }
  }
  return out;
}

export function driverStates(
  drivers: UserProfile[],
  requests: TripRequest[],
  nowMs: number
): DriverState[] {
  const locations = latestDriverLocations(requests);
  return drivers.map((driver) => {
    let current: DriverState["current"] = null;
    let currentStartedAt = Infinity;
    for (const r of requests) {
      if (r.status === "cancelled") continue;
      for (const line of r.awbLines ?? []) {
        if (line.assignedDriverId !== driver.uid || !isLineMoving(line)) continue;
        const started = line.startedAt ?? 0;
        if (started < currentStartedAt) {
          currentStartedAt = started;
          current = { request: r, stage: lineStage(line) };
        }
      }
    }
    const location = locations[driver.uid] ?? null;
    return {
      driver,
      busy: current !== null,
      location,
      locationStale: !location || nowMs - (location.updatedAt ?? 0) > GPS_STALE_MS,
      current,
    };
  });
}

export interface DayCounters {
  total: number;
  requested: number;
  assigned: number;
  onTheRoad: number;
  delivered: number;
  toInvoice: number;
  driversFree: number;
  driversOnDuty: number;
}

/** The trip counter cards on the Today screen (each one opens a list). */
export type TripCounterKey = "total" | "requested" | "assigned" | "onTheRoad" | "delivered";
export type CounterKey = TripCounterKey | "pendingInvoice" | "drivers";

/** Stages behind each trip counter card; null = every trip on the board. */
export const COUNTER_STAGES: Record<TripCounterKey, TripStage[] | null> = {
  total: null,
  requested: ["requested"],
  assigned: ["assigned"],
  onTheRoad: ["to_pickup", "in_transit"],
  delivered: ["delivered", "invoiced"],
};

/**
 * Exactly the trips a counter card counts. dayCounters() is built on this,
 * so the number on a card always equals the rows its list shows.
 */
export function tripsForCounter(trips: BoardTrip[], key: TripCounterKey): BoardTrip[] {
  const stages = COUNTER_STAGES[key];
  return stages ? trips.filter((t) => stages.includes(t.stage)) : trips;
}

/**
 * Delivered trips not invoiced yet, any date, oldest first. The single
 * definition behind the To Invoice page and the "Pending invoice" card.
 */
export function pendingInvoiceRequests(requests: TripRequest[]): TripRequest[] {
  return requests
    .filter((r) => tripStage(r) === "delivered")
    .sort((a, b) => (a.tripDate < b.tripDate ? -1 : a.tripDate > b.tripDate ? 1 : 0));
}

/** On-duty, active drivers (free first, then busy, each by name). */
export function onDutyDrivers(drivers: DriverState[]): DriverState[] {
  return drivers
    .filter((d) => d.driver.onDuty === true && d.driver.active !== false)
    .sort((a, b) => Number(a.busy) - Number(b.busy) || (a.driver.name ?? "").localeCompare(b.driver.name ?? ""));
}

export function dayCounters(trips: BoardTrip[], drivers: DriverState[]): DayCounters {
  const onDuty = onDutyDrivers(drivers);
  return {
    total: tripsForCounter(trips, "total").length,
    requested: tripsForCounter(trips, "requested").length,
    assigned: tripsForCounter(trips, "assigned").length,
    onTheRoad: tripsForCounter(trips, "onTheRoad").length,
    delivered: tripsForCounter(trips, "delivered").length,
    toInvoice: trips.filter((t) => t.stage === "delivered").length,
    driversFree: onDuty.filter((d) => !d.busy).length,
    driversOnDuty: onDuty.length,
  };
}

export type AlertKind = "no_driver_soon" | "pickup_late" | "not_confirmed" | "gps_lost" | "new_leads";

export interface DispatchAlert {
  id: string;
  kind: AlertKind;
  severity: "red" | "amber" | "info";
  message: string;
  requestId?: string;
  driverId?: string;
}

function fmtTime(d: Date): string {
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${m} ${ampm}`;
}

function minutesAgo(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m`;
}

function tripRef(r: TripRequest): string {
  return `${r.customerName || "Customer"} (${r.from || "?"} → ${r.to || "?"})`;
}

/**
 * Exceptions dispatch should act on, most urgent first:
 * - red   no_driver_soon: an AWB has no driver and pickup is within the hour (or past)
 * - amber pickup_late:   assigned but not started 15+ min after pickup time
 * - amber not_confirmed: assigned, driver hasn't accepted, pickup within the hour
 * - amber gps_lost:      driver on the road with no GPS point, or none for 3+ min
 * - info  new_leads:     website leads waiting for review
 */
export function computeAlerts(
  requests: TripRequest[],
  drivers: DriverState[],
  nowMs: number,
  pendingLeads = 0
): DispatchAlert[] {
  const alerts: DispatchAlert[] = [];
  for (const r of requests) {
    const stage = tripStage(r);
    if (!isOpenStage(stage)) continue;
    const pickup = pickupDate(r);
    if (!pickup) continue;
    const untilPickup = pickup.getTime() - nowMs;
    const unassigned = unassignedCount(r);
    if (unassigned > 0 && untilPickup <= PICKUP_SOON_MS) {
      alerts.push({
        id: `nodriver-${r.id}`,
        kind: "no_driver_soon",
        severity: "red",
        requestId: r.id,
        message:
          untilPickup >= 0
            ? `No driver: ${tripRef(r)} picks up at ${fmtTime(pickup)}`
            : `No driver: ${tripRef(r)} pickup was ${fmtTime(pickup)} (${minutesAgo(-untilPickup)} ago)`,
      });
      continue;
    }
    const waiting = (r.awbLines ?? []).filter(
      (l) => (l.status === "assigned" || l.status === "accepted") && l.assignedDriverId
    );
    const anyMoving = (r.awbLines ?? []).some(isLineMoving);
    if (waiting.length > 0 && !anyMoving && untilPickup < -PICKUP_LATE_GRACE_MS) {
      alerts.push({
        id: `late-${r.id}`,
        kind: "pickup_late",
        severity: "amber",
        requestId: r.id,
        message: `Not started: ${waiting[0].assignedDriverName ?? "Driver"} on ${tripRef(r)} — pickup was ${fmtTime(pickup)}`,
      });
      continue;
    }
    const unconfirmed = waiting.filter((l) => l.status === "assigned");
    if (unconfirmed.length > 0 && untilPickup >= 0 && untilPickup <= PICKUP_SOON_MS) {
      alerts.push({
        id: `unconf-${r.id}`,
        kind: "not_confirmed",
        severity: "amber",
        requestId: r.id,
        message: `Not confirmed: ${unconfirmed[0].assignedDriverName ?? "Driver"} hasn't accepted ${tripRef(r)} (pickup ${fmtTime(pickup)})`,
      });
    }
  }
  for (const d of drivers) {
    if (!d.busy || !d.locationStale) continue;
    alerts.push({
      id: `gps-${d.driver.uid}`,
      kind: "gps_lost",
      severity: "amber",
      driverId: d.driver.uid,
      requestId: d.current?.request.id,
      message: d.location
        ? `GPS lost: ${d.driver.name} — last point ${minutesAgo(nowMs - d.location.updatedAt)} ago`
        : `No GPS: ${d.driver.name} is on a trip but hasn't shared a location`,
    });
  }
  if (pendingLeads > 0) {
    alerts.push({
      id: "leads",
      kind: "new_leads",
      severity: "info",
      message: `${pendingLeads} website request${pendingLeads === 1 ? "" : "s"} waiting for review`,
    });
  }
  const rank = { red: 0, amber: 1, info: 2 } as const;
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** Alerts grouped by the trip and driver they point at (for list rows). */
export function alertsByTarget(alerts: DispatchAlert[]): {
  byRequest: Map<string, DispatchAlert[]>;
  byDriver: Map<string, DispatchAlert[]>;
} {
  const byRequest = new Map<string, DispatchAlert[]>();
  const byDriver = new Map<string, DispatchAlert[]>();
  for (const a of alerts) {
    if (a.requestId) byRequest.set(a.requestId, [...(byRequest.get(a.requestId) ?? []), a]);
    if (a.driverId) byDriver.set(a.driverId, [...(byDriver.get(a.driverId) ?? []), a]);
  }
  return { byRequest, byDriver };
}
