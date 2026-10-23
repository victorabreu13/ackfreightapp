import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FLIGHT_STATUS_LABEL, isFlightStatus, type FlightDetail } from "@/lib/guias/flight-status";

const BADGE: Record<string, string> = {
  SCHEDULED: "bg-slate-100 text-slate-800",
  DELAYED: "bg-amber-100 text-amber-900",
  DEPARTED: "bg-sky-100 text-sky-900",
  ARRIVED: "bg-emerald-100 text-emerald-900",
  CANCELED: "bg-red-100 text-red-900",
  DIVERTED: "bg-orange-100 text-orange-900",
  UNKNOWN: "bg-slate-100 text-slate-700",
};

function statusLabel(status: string | null): string {
  return isFlightStatus(status) ? FLIGHT_STATUS_LABEL[status] : "Sin información";
}

function detailOf(value: string | null): Partial<FlightDetail> {
  if (!value) return {};
  try {
    return JSON.parse(value) as Partial<FlightDetail>;
  } catch {
    return {};
  }
}

function when(value: string | undefined): string {
  const match = (value ?? "").match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  return match ? `${match[1]} ${match[2]}` : (value ?? "");
}

function stamp(date: Date): string {
  return new Intl.DateTimeFormat("es-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function CustomerPortalPage() {
  const user = await getSessionUser();
  if (!user || user.role !== "CUSTOMER" || !user.clientId) redirect("/login?customer=1");
  const guias = await prisma.airWaybillDocument.findMany({
    where: { product: "guia", status: "issued", guiaClientId: user.clientId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      awb: true,
      departure: true,
      destination: true,
      flightNumber: true,
      flightDate: true,
      flightStatus: true,
      flightStatusDetail: true,
      flightCheckedAt: true,
      flightEvents: { orderBy: { createdAt: "desc" }, take: 6, select: { id: true, status: true, createdAt: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{user.clientName}</p>
        <h1 className="font-display text-4xl">Sus embarques</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Aquí ve la guía aérea (AWB) de cada embarque y el estatus de su vuelo. Le enviamos un correo cuando el estatus cambie.
        </p>
      </div>
      {guias.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-card px-4 py-10 text-sm text-muted-foreground">
          Todavía no hay embarques para mostrar.
        </p>
      ) : (
        <ul className="space-y-4">
          {guias.map((guia) => {
            const detail = detailOf(guia.flightStatusDetail);
            const status = guia.flightStatus ?? "UNKNOWN";
            return (
              <li key={guia.id} className="space-y-3 rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-2xl font-semibold">{guia.awb}</p>
                    <p className="text-sm text-muted-foreground">
                      {[guia.departure, guia.destination].filter(Boolean).join(" - ")}
                      {guia.flightNumber ? ` · Vuelo ${guia.flightNumber}` : ""}
                      {guia.flightDate ? ` · ${guia.flightDate}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`rounded-full px-3 py-1 text-sm font-medium ${BADGE[status] ?? BADGE.UNKNOWN}`}>{statusLabel(guia.flightStatus)}</span>
                    <a
                      href={`/api/guias/portal/awb/${guia.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                    >
                      Ver AWB
                    </a>
                  </div>
                </div>
                {when(detail.revisedDeparture || detail.scheduledDeparture) || when(detail.revisedArrival || detail.scheduledArrival) ? (
                  <p className="text-sm text-muted-foreground">
                    {when(detail.revisedDeparture || detail.scheduledDeparture) ? `Salida ${when(detail.revisedDeparture || detail.scheduledDeparture)}` : ""}
                    {when(detail.revisedArrival || detail.scheduledArrival) ? ` · Llegada ${when(detail.revisedArrival || detail.scheduledArrival)}` : ""}
                  </p>
                ) : null}
                {guia.flightEvents.length ? (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground">Historial del estatus</summary>
                    <ul className="mt-2 space-y-1">
                      {guia.flightEvents.map((event) => (
                        <li key={event.id} className="flex gap-3">
                          <span className="w-44 text-muted-foreground">{stamp(event.createdAt)}</span>
                          <span>{statusLabel(event.status)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                {guia.flightCheckedAt ? <p className="text-xs text-muted-foreground">Revisado {stamp(guia.flightCheckedAt)}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
