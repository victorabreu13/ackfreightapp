import { FLIGHT_STATUS_LABEL, isFlightStatus, type FlightDetail } from "@/lib/guias/flight-status";

/** How a flight status looks. The client portal and the AWB Status tab share it, so both show the same thing. */
const BADGE: Record<string, string> = {
  SCHEDULED: "bg-slate-100 text-slate-800",
  DELAYED: "bg-amber-100 text-amber-900",
  DEPARTED: "bg-sky-100 text-sky-900",
  ARRIVED: "bg-emerald-100 text-emerald-900",
  CANCELED: "bg-red-100 text-red-900",
  DIVERTED: "bg-orange-100 text-orange-900",
  UNKNOWN: "bg-slate-100 text-slate-700",
};

export function flightStatusLabel(status: string | null): string {
  return isFlightStatus(status) ? FLIGHT_STATUS_LABEL[status] : "Sin información";
}

export function FlightBadge({ status }: { status: string | null }) {
  return <span className={`rounded-full px-3 py-1 text-sm font-medium ${BADGE[status ?? "UNKNOWN"] ?? BADGE.UNKNOWN}`}>{flightStatusLabel(status)}</span>;
}

export function flightDetailOf(value: string | null): Partial<FlightDetail> {
  if (!value) return {};
  try {
    return JSON.parse(value) as Partial<FlightDetail>;
  } catch {
    return {};
  }
}

/** "2026-10-22 08:25-04:00" becomes "2026-10-22 08:25". */
export function flightWhen(value: string | undefined): string {
  const match = (value ?? "").match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  return match ? `${match[1]} ${match[2]}` : (value ?? "");
}

export function flightStamp(date: Date): string {
  return new Intl.DateTimeFormat("es-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }).format(date);
}

/** Departure and arrival times of a lookup, as one line. Empty when the source gave none. */
export function flightTimesLine(detail: Partial<FlightDetail>): string {
  const departure = flightWhen(detail.revisedDeparture || detail.scheduledDeparture);
  const arrival = flightWhen(detail.revisedArrival || detail.scheduledArrival);
  return [departure ? `Salida ${departure}` : "", arrival ? `Llegada ${arrival}` : ""].filter(Boolean).join(" · ");
}

export function FlightHistory({ events }: { events: Array<{ id: string; status: string; createdAt: Date }> }) {
  if (events.length === 0) return null;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted-foreground">Historial del estatus</summary>
      <ul className="mt-2 space-y-1">
        {events.map((event) => (
          <li key={event.id} className="flex gap-3">
            <span className="w-44 text-muted-foreground">{flightStamp(event.createdAt)}</span>
            <span>{flightStatusLabel(event.status)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
