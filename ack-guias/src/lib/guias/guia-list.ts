import { nyDay } from "@/lib/guias/documents-index";
import { flightDateIso } from "@/lib/guias/flight-status";

/**
 * The Guías screen keeps drafts and the guías whose flight has not left yet. A guía drops off the day after its
 * flight date. One with no readable flight date stays, since there is nothing to age it by. Documentos keeps all.
 */
export function guiaOnList(guia: { status: string; flightDate: string | null | undefined }, now = new Date()): boolean {
  if (guia.status !== "issued") return true;
  const flight = flightDateIso(guia.flightDate);
  if (!flight) return true;
  return flight >= nyDay(now);
}
