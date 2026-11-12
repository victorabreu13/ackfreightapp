import Link from "next/link";
import { redirect } from "next/navigation";
import { FlightBadge, FlightHistory, flightDetailOf, flightStamp, flightTimesLine } from "@/components/flight-status";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { MigrationPending } from "@/components/migration-pending";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canManageGuias, canReadGuias, guiaWhere } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FLIGHT_STATUSES, FLIGHT_STATUS_LABEL } from "@/lib/guias/flight-status";
import { guiaBillToName } from "@/lib/guias/guia-client";
import { isPendingMigration, logMigrationError } from "@/lib/guias/migration-error";
import { checkGuiaFlight } from "@/server/guia-actions";

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

const SELECT = "block h-10 rounded-md border border-input bg-background px-3 text-sm";

/** The same AWB list and flight status the client sees in its portal, for every client. */
export default async function AwbStatusPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!canReadGuias(user)) redirect("/guias?error=Only%20the%20ACK%20team%20can%20open%20AWB%20Status");
  const params = await searchParams;
  const clientId = (one(params, "client") ?? "").trim();
  const status = (one(params, "status") ?? "").trim();
  const awb = (one(params, "awb") ?? "").trim();
  const flightMessage = one(params, "flight");
  const manage = canManageGuias(user);

  let clients: Array<{ id: string; name: string }> = [];
  let guias: Array<{
    id: string;
    awb: string;
    client: string;
    departure: string | null;
    destination: string | null;
    flightNumber: string | null;
    flightDate: string | null;
    flightStatus: string | null;
    flightStatusDetail: string | null;
    flightCheckedAt: Date | null;
    events: Array<{ id: string; status: string; createdAt: Date }>;
  }> = [];
  try {
    clients = await prisma.guiaClient.findMany({ where: { agentKey: "ack" }, orderBy: { name: "asc" }, select: { id: true, name: true } });
    const rows = await prisma.airWaybillDocument.findMany({
      where: {
        ...guiaWhere(user),
        status: "issued",
        ...(clientId ? { guiaClientId: clientId } : {}),
        ...(status === "NONE" ? { flightStatus: null } : status ? { flightStatus: status } : {}),
        ...(awb ? { awb: { contains: awb } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        guiaClient: { select: { name: true } },
        flightEvents: { orderBy: { createdAt: "desc" }, take: 6, select: { id: true, status: true, createdAt: true } },
      },
    });
    guias = rows.map((row) => ({
      id: row.id,
      awb: row.awb,
      client: guiaBillToName(row),
      departure: row.departure,
      destination: row.destination,
      flightNumber: row.flightNumber,
      flightDate: row.flightDate,
      flightStatus: row.flightStatus,
      flightStatusDetail: row.flightStatusDetail,
      flightCheckedAt: row.flightCheckedAt,
      events: row.flightEvents,
    }));
  } catch (caught) {
    if (!isPendingMigration(caught)) throw caught;
    logMigrationError("/guias/awb-status", caught);
    return <MigrationPending />;
  }

  return (
    <div className="space-y-6">
      <div>
        <GuiaEyebrow />
        <h1 className="font-display text-4xl">AWB Status</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          The same thing the client sees in their portal: every issued AWB with its flight status and history, for all clients. The status is checked on its own every few hours (more often while the flight is en route), from the day before the flight to the day after, and the client gets an email when it changes.
        </p>
      </div>
      {flightMessage === "ok" ? <p className="text-sm text-muted-foreground">Flight status checked.</p> : null}
      {flightMessage && flightMessage !== "ok" ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">Vuelo: {flightMessage}</p> : null}

      <form action="/guias/awb-status" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Client</span>
          <select name="client" defaultValue={clientId} className={SELECT}>
            <option value="">All</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Status</span>
          <select name="status" defaultValue={status} className={SELECT}>
            <option value="">All</option>
            {FLIGHT_STATUSES.filter((item) => item !== "UNKNOWN").map((item) => (
              <option key={item} value={item}>
                {FLIGHT_STATUS_LABEL[item]}
              </option>
            ))}
            <option value="NONE">Not checked</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">AWB</span>
          <Input name="awb" defaultValue={awb} placeholder="045-" className="w-40" />
        </label>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
        {clientId || status || awb ? (
          <Button asChild variant="ghost">
            <Link href="/guias/awb-status">Clear filters</Link>
          </Button>
        ) : null}
      </form>

      {guias.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-card px-4 py-10 text-sm text-muted-foreground">No issued AWBs match those filters.</p>
      ) : (
        <ul className="space-y-4">
          {guias.map((guia) => {
            const times = flightTimesLine(flightDetailOf(guia.flightStatusDetail));
            return (
              <li key={guia.id} className="space-y-3 rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-2xl font-semibold">
                      <Link href={`/guias/${guia.id}`} className="underline-offset-2 hover:underline">
                        {guia.awb}
                      </Link>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {guia.client || "No client"}
                      {[guia.departure, guia.destination].filter(Boolean).length ? ` · ${[guia.departure, guia.destination].filter(Boolean).join(" - ")}` : ""}
                      {guia.flightNumber ? ` · Flight ${guia.flightNumber}` : ""}
                      {guia.flightDate ? ` · ${guia.flightDate}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <FlightBadge status={guia.flightStatus} checked={Boolean(guia.flightCheckedAt)} />
                    <a
                      href={`/api/guias/${guia.id}/file?kind=awb`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                    >
                      View AWB
                    </a>
                    {manage && guia.flightNumber ? (
                      <form action={checkGuiaFlight}>
                        <input type="hidden" name="id" value={guia.id} />
                        <input type="hidden" name="returnTo" value="/guias/awb-status" />
                        <Button type="submit" variant="outline" size="sm">
                          Check now
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </div>
                {times ? <p className="text-sm text-muted-foreground">{times}</p> : null}
                <FlightHistory events={guia.events} />
                <p className="text-xs text-muted-foreground">
                  {guia.flightCheckedAt
                    ? `Checked ${flightStamp(guia.flightCheckedAt)}${guia.flightStatus ? "" : ". The flight service does not have this flight yet; it tries again on its own."}`
                    : guia.flightNumber
                      ? "Not checked yet"
                      : "No flight number on the guía"}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
