// Marking a trip request as invoiced (or undoing it) by hand.
//
// "Invoiced" is stored the same way it always has been: tripRequests.status
// = "invoiced" (QuickBooks also sets quickbooksInvoiceId + invoicedAt).
// Eligibility follows the stage the Dispatch screens *show* (tripStage), not
// only the stored rollup, so every trip listed under To Invoice / Pending
// invoice can actually be marked.

import { computeTripRequestRollup, TripRequest, TripRequestStatus } from "../types";
import { tripStage } from "./tripStatus";

// Undo puts the rollup back to "completed". Until the onTripRequestStatusEmails
// Cloud Function ignores an "invoiced" → "completed" change, that write would
// re-send the "trip completed" email to the customer and admins, so undo stays
// off until that functions change is deployed. Flip to true afterwards.
export const ALLOW_UNDO_INVOICED = false;

type InvoiceFields = Pick<TripRequest, "status" | "awbLines" | "quickbooksInvoiceId">;

/** Delivered (every AWB completed), not invoiced or cancelled yet. */
export function canMarkInvoiced(request: InvoiceFields): boolean {
  return tripStage(request) === "delivered";
}

/** Manually-invoiced trips can be put back; QuickBooks ones must be voided there. */
export function canUndoInvoiced(request: InvoiceFields, allowUndo = ALLOW_UNDO_INVOICED): boolean {
  return allowUndo && request.status === "invoiced" && !request.quickbooksInvoiceId;
}

export function markInvoicedUpdate(now: number): { status: TripRequestStatus; invoicedAt: number; updatedAt: number } {
  return { status: "invoiced", invoicedAt: now, updatedAt: now };
}

/** Status to go back to: the normal rollup of the AWB lines (normally "completed"). */
export function notInvoicedStatus(request: Pick<TripRequest, "awbLines">): TripRequestStatus {
  return computeTripRequestRollup(request.awbLines ?? []).status;
}
