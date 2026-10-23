import { prisma } from "@/lib/db";
import { resolveAppUrl } from "@/lib/app-url";
import { codeForPlace } from "@/lib/awb/airports";
import {
  fetchFlightStatus,
  flightDateIso,
  flightEmail,
  flightNumberKey,
  isFinalStatus,
  shouldNotify,
  type FlightFetch,
  type FlightLookup,
} from "@/lib/guias/flight-status";
import { sendMail, type MailSender } from "@/lib/guias/mailer";

/** A guía is watched from the day before its flight to two days after, until it lands or is canceled. */
const DAYS_BEFORE = 1;
const DAYS_AFTER = 2;

function newYorkDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** True when the flight date falls inside the watch window around `now`. */
export function inWatchWindow(flightDate: string, now = new Date()): boolean {
  const today = newYorkDay(now);
  return flightDate >= shiftDay(today, -DAYS_AFTER) && flightDate <= shiftDay(today, DAYS_BEFORE);
}

export type FlightCheckSummary = {
  checked: number;
  changed: number;
  emails: number;
  errors: string[];
  skipped: number;
};

export type FlightCheckOptions = {
  apiKey?: string;
  now?: Date;
  fetchImpl?: FlightFetch;
  mailer?: MailSender;
  /** Only these guías. Used by the Check now button. */
  guiaIds?: string[];
};

/**
 * Looks up the flight of every issued guía that is inside its watch window, saves a change of status, and emails
 * the client's logins when the change is worth telling them about.
 */
export async function checkFlights(options: FlightCheckOptions = {}): Promise<FlightCheckSummary> {
  const summary: FlightCheckSummary = { checked: 0, changed: 0, emails: 0, errors: [], skipped: 0 };
  const apiKey = options.apiKey ?? process.env.AERODATABOX_API_KEY?.trim() ?? "";
  if (!apiKey) {
    summary.errors.push("AERODATABOX_API_KEY is not set.");
    return summary;
  }
  const now = options.now ?? new Date();
  const mailer = options.mailer ?? sendMail;
  const guias = await prisma.airWaybillDocument.findMany({
    where: {
      product: "guia",
      status: "issued",
      flightNumber: { not: null },
      ...(options.guiaIds ? { id: { in: options.guiaIds } } : {}),
    },
    include: { guiaClient: { select: { id: true, name: true } } },
  });
  for (const guia of guias) {
    const date = flightDateIso(guia.flightDate);
    const flightNumber = flightNumberKey(guia.flightNumber);
    if (!date || !flightNumber || isFinalStatus(guia.flightStatus) || (!options.guiaIds && !inWatchWindow(date, now))) {
      summary.skipped += 1;
      continue;
    }
    let lookup: FlightLookup | null;
    try {
      lookup = await fetchFlightStatus({
        flightNumber,
        date,
        origin: codeForPlace(guia.departure ?? "") || "MIA",
        destination: codeForPlace(guia.destination ?? ""),
        apiKey,
        fetchImpl: options.fetchImpl,
      });
    } catch (error) {
      summary.errors.push(`${guia.awb}: ${error instanceof Error ? error.message : "lookup failed"}`);
      continue;
    }
    summary.checked += 1;
    if (!lookup) {
      await prisma.airWaybillDocument.update({ where: { id: guia.id }, data: { flightCheckedAt: now } });
      continue;
    }
    const detail = JSON.stringify(lookup.detail);
    const changed = lookup.status !== guia.flightStatus && lookup.status !== "UNKNOWN";
    await prisma.airWaybillDocument.update({
      where: { id: guia.id },
      data: {
        flightCheckedAt: now,
        flightStatusDetail: detail,
        ...(changed ? { flightStatus: lookup.status } : {}),
      },
    });
    if (!changed) continue;
    summary.changed += 1;

    let emailedTo: string | null = null;
    let emailError: string | null = null;
    if (shouldNotify(guia.flightStatus, lookup.status) && guia.guiaClientId) {
      const customers = await prisma.user.findMany({
        where: { role: "CUSTOMER", active: true, guiaClientId: guia.guiaClientId, passwordHash: { not: null } },
        select: { email: true },
      });
      if (customers.length) {
        const message = flightEmail({
          awb: guia.awb,
          flightNumber: guia.flightNumber ?? flightNumber,
          route: [guia.departure, guia.destination].filter(Boolean).join(" - "),
          status: lookup.status,
          detail: lookup.detail,
          portalUrl: `${resolveAppUrl()}/portal`,
        });
        const sent = await mailer({ to: customers.map((customer) => customer.email), subject: message.subject, text: message.text, html: message.html });
        if (sent.ok) {
          emailedTo = customers.map((customer) => customer.email).join(", ");
          summary.emails += customers.length;
        } else {
          emailError = sent.error;
          summary.errors.push(`${guia.awb}: ${sent.error}`);
        }
      }
    }
    await prisma.guiaFlightEvent.create({
      data: { documentId: guia.id, status: lookup.status, detail, emailedTo, emailError },
    });
  }
  return summary;
}
