// One status per trip, shown the same way on every dispatch screen.
//
// The data model still has two status fields — the request rollup
// (tripRequests.status) and one status per AWB line (awbLines[].status).
// Nothing here writes or migrates either of them: this module only *reads*
// them and derives a single display status with a fixed label and color.
//
//   AWB line status          → TripStage
//   ─────────────────────────────────────────
//   submitted                → requested
//   assigned / accepted      → assigned   (accepted = "driver confirmed")
//   in_progress              → to_pickup
//   picked_up                → in_transit
//   completed                → delivered
//   request.status invoiced  → invoiced
//   request.status cancelled → cancelled
//
// A request with several AWB lines takes the stage of its *least advanced
// open line* (completed lines are ignored), so a trip only shows "Delivered"
// once every AWB is delivered, and "To Pickup" wins over "In Transit" while a
// driver still has freight to collect. Lines with no driver while others are
// moving are surfaced separately (unassignedCount) so they don't hide.

import type { AwbLine, AwbLineStatus, TripRequest } from "../types";

export type TripStage =
  | "requested"
  | "assigned"
  | "to_pickup"
  | "in_transit"
  | "delivered"
  | "invoiced"
  | "cancelled";

export interface StageInfo {
  label: string;
  short: string;
  color: string;
  /** Light background tint for chips/columns. */
  tint: string;
}

export const TRIP_STAGES: Record<TripStage, StageInfo> = {
  requested: { label: "Requested", short: "Requested", color: "#64748b", tint: "#f1f5f9" },
  assigned: { label: "Assigned", short: "Assigned", color: "#7c3aed", tint: "#f3effe" },
  to_pickup: { label: "To Pickup", short: "To Pickup", color: "#0284c7", tint: "#e6f4fb" },
  in_transit: { label: "Loaded / In Transit", short: "In Transit", color: "#2563eb", tint: "#eaf0fe" },
  delivered: { label: "Delivered", short: "Delivered", color: "#16a34a", tint: "#e9f7ee" },
  invoiced: { label: "Invoiced", short: "Invoiced", color: "#0f766e", tint: "#e6f3f2" },
  cancelled: { label: "Cancelled", short: "Cancelled", color: "#b91c1c", tint: "#fdecec" },
};

/** Board column order (Invoiced is shown inside the Delivered column). */
export const BOARD_STAGES: TripStage[] = [
  "requested",
  "assigned",
  "to_pickup",
  "in_transit",
  "delivered",
];

export const STAGE_ORDER: TripStage[] = [
  "requested",
  "assigned",
  "to_pickup",
  "in_transit",
  "delivered",
  "invoiced",
  "cancelled",
];

const LINE_TO_STAGE: Record<AwbLineStatus, TripStage> = {
  submitted: "requested",
  assigned: "assigned",
  accepted: "assigned",
  in_progress: "to_pickup",
  picked_up: "in_transit",
  completed: "delivered",
};

export function lineStage(line: Pick<AwbLine, "status">): TripStage {
  return LINE_TO_STAGE[line.status] ?? "requested";
}

/** Driver is out on the road for this line (started or loaded). */
export function isLineMoving(line: Pick<AwbLine, "status">): boolean {
  return line.status === "in_progress" || line.status === "picked_up";
}

export function tripStage(
  request: Pick<TripRequest, "status" | "awbLines">
): TripStage {
  if (request.status === "cancelled") return "cancelled";
  if (request.status === "invoiced") return "invoiced";
  const lines = request.awbLines ?? [];
  const open = lines.filter((l) => l.status !== "completed");
  if (lines.length > 0 && open.length === 0) return "delivered";
  if (lines.length === 0) {
    // Malformed / legacy request with no lines: fall back to the rollup.
    if (request.status === "completed") return "delivered";
    if (request.status === "in_progress") return "to_pickup";
    if (request.status === "assigned") return "assigned";
    return "requested";
  }
  const moving = open.filter(isLineMoving);
  if (moving.length > 0) {
    return moving.some((l) => l.status === "in_progress") ? "to_pickup" : "in_transit";
  }
  if (open.some((l) => l.status === "assigned" || l.status === "accepted")) return "assigned";
  return "requested";
}

/** AWB lines with no driver yet on a request that isn't cancelled/invoiced. */
export function unassignedCount(request: Pick<TripRequest, "status" | "awbLines">): number {
  if (request.status === "cancelled" || request.status === "invoiced") return 0;
  return (request.awbLines ?? []).filter((l) => !l.assignedDriverId && l.status !== "completed")
    .length;
}

/** Every assigned, not-yet-started line has been accepted by its driver. */
export function allAssignedConfirmed(request: Pick<TripRequest, "awbLines">): boolean {
  const waiting = (request.awbLines ?? []).filter(
    (l) => l.status === "assigned" || l.status === "accepted"
  );
  return waiting.length > 0 && waiting.every((l) => l.status === "accepted");
}

export function stageInfo(stage: TripStage): StageInfo {
  return TRIP_STAGES[stage];
}
