import { nyDay } from "@/lib/guias/documents-index";
import { flightDateIso } from "@/lib/guias/flight-status";

/**
 * The AWBs screen keeps drafts and the AWBs whose flight has not left yet. An AWB drops off the day after its
 * flight date. One with no readable flight date stays until the team marks it completed. An AWB marked completed is
 * off the screen, draft or not. Documentos keeps all.
 */
export function guiaOnList(guia: { status: string; flightDate: string | null | undefined; completedAt?: Date | null }, now = new Date()): boolean {
  if (guia.completedAt) return false;
  if (guia.status !== "issued") return true;
  const flight = flightDateIso(guia.flightDate);
  if (!flight) return true;
  return flight >= nyDay(now);
}
