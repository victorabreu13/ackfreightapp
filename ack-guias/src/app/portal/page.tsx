import { redirect } from "next/navigation";
import { FlightBadge, FlightHistory, flightDetailOf, flightStamp, flightTimesLine } from "@/components/flight-status";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
            const times = flightTimesLine(flightDetailOf(guia.flightStatusDetail));
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
                    <FlightBadge status={guia.flightStatus} checked={Boolean(guia.flightCheckedAt)} />
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
                {times ? <p className="text-sm text-muted-foreground">{times}</p> : null}
                <FlightHistory events={guia.flightEvents} />
                {guia.flightCheckedAt ? <p className="text-xs text-muted-foreground">Revisado {flightStamp(guia.flightCheckedAt)}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
