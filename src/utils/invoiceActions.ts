import { markTripRequestInvoiced, markTripRequestNotInvoiced } from "../services/tripRequests";
import type { TripRequest } from "../types";
import { confirmAction, notify } from "./alert";

function describe(request: TripRequest): string {
  const parts = [request.customerName, request.tripDate, `${request.from || "?"} → ${request.to || "?"}`];
  return parts.filter(Boolean).join(" · ");
}

/** One click + confirm: mark a delivered trip as invoiced. */
export function confirmMarkInvoiced(
  request: TripRequest,
  hooks: { onStart?: () => void; onDone?: (ok: boolean) => void } = {}
) {
  confirmAction(
    {
      title: "Mark this trip as invoiced?",
      message: `${describe(request)}\n\nIt will leave To Invoice / Pending invoice and show as Invoiced. This doesn't create or send anything in QuickBooks.`,
      confirmLabel: "Mark as invoiced",
    },
    async () => {
      hooks.onStart?.();
      try {
        await markTripRequestInvoiced(request.id);
        hooks.onDone?.(true);
      } catch (e: any) {
        hooks.onDone?.(false);
        notify("Couldn't mark as invoiced", e?.message ?? "Something went wrong. Please try again.");
      }
    }
  );
}

/** Undo a manual "Mark as invoiced". */
export function confirmMarkNotInvoiced(
  request: TripRequest,
  hooks: { onStart?: () => void; onDone?: (ok: boolean) => void } = {}
) {
  confirmAction(
    {
      title: "Mark this trip as not invoiced?",
      message: `${describe(request)}\n\nIt goes back to To Invoice / Pending invoice.`,
      confirmLabel: "Mark as not invoiced",
    },
    async () => {
      hooks.onStart?.();
      try {
        await markTripRequestNotInvoiced(request);
        hooks.onDone?.(true);
      } catch (e: any) {
        hooks.onDone?.(false);
        notify("Couldn't undo", e?.message ?? "Something went wrong. Please try again.");
      }
    }
  );
}
