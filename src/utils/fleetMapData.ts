import type { FleetMapDriver, FleetMapRoute } from "../components/fleetMapTypes";
import type { TripRequest } from "../types";
import type { DriverState } from "./dispatchBoard";
import { isOpenStage } from "./dispatchBoard";
import { stageInfo, tripStage } from "./tripStatus";

const FREE_COLOR = "#16a34a";

function ago(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  return min < 1 ? "just now" : min < 60 ? `${min} min ago` : `${Math.floor(min / 60)}h ${min % 60}m ago`;
}

/** Map pins for every driver with a stored last point. */
export function fleetMapDrivers(states: DriverState[], nowMs: number): FleetMapDriver[] {
  return states
    .filter((s) => s.location)
    .map((s) => {
      const loc = s.location!;
      const color = s.current ? stageInfo(s.current.stage).color : FREE_COLOR;
      const first = s.driver.name?.split(" ")[0] ?? "Driver";
      const status = s.current
        ? `${stageInfo(s.current.stage).label} · ${s.current.request.customerName} (${s.current.request.from} → ${s.current.request.to})`
        : "Free";
      return {
        id: s.driver.uid,
        lat: loc.lat,
        lng: loc.lng,
        label: first,
        color,
        stale: !!s.current && s.locationStale,
        detail: `${s.driver.name} — ${status} · GPS ${ago(nowMs - loc.updatedAt)}`,
      };
    });
}

/**
 * Straight pickup → delivery lines for open trips that already have
 * geocoded endpoints (routeEstimate.origin/destination is filled in by the
 * existing route-estimate function). Not a driven route.
 */
export function fleetMapRoutes(requests: TripRequest[]): FleetMapRoute[] {
  const out: FleetMapRoute[] = [];
  for (const r of requests) {
    const stage = tripStage(r);
    if (!isOpenStage(stage)) continue;
    const o = r.routeEstimate?.origin;
    const d = r.routeEstimate?.destination;
    if (!o || !d) continue;
    out.push({
      id: r.id,
      from: o,
      to: d,
      color: stageInfo(stage).color,
      label: `${r.customerName}: ${r.from} → ${r.to}`,
    });
  }
  return out;
}
