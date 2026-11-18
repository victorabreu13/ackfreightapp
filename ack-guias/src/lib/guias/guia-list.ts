import { nyDay } from "@/lib/guias/documents-index";
import { flightDateIso } from "@/lib/guias/flight-status";

/**
 * The Guías screen keeps drafts and the guías whose flight has not left yet. A guía drops off the day after its
 * flight date. One with no readable flight date stays until the team marks it completed. A guía marked completed is
 * off the screen, draft or not. Documentos keeps all.
 */
export function guiaOnList(guia: { status: string; flightDate: string | null | undefined; completedAt?: Date | null }, now = new Date()): boolean {
  if (guia.completedAt) return false;
  if (guia.status !== "issued") return true;
  const flight = flightDateIso(guia.flightDate);
  if (!flight) return true;
  return flight >= nyDay(now);
}
