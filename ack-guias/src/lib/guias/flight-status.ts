/**
 * Flight status for a guía. The status comes from AeroDataBox (via RapidAPI): one request per flight number and
 * date. Raw statuses are folded into a short list the client understands.
 */
export const FLIGHT_STATUSES = ["SCHEDULED", "DELAYED", "DEPARTED", "ARRIVED", "CANCELED", "DIVERTED", "UNKNOWN"] as const;
export type FlightStatus = (typeof FLIGHT_STATUSES)[number];

export const FLIGHT_STATUS_LABEL: Record<FlightStatus, string> = {
  SCHEDULED: "Programado",
  DELAYED: "Retrasado",
  DEPARTED: "En ruta",
  ARRIVED: "Aterrizó",
  CANCELED: "Cancelado",
  DIVERTED: "Desviado",
  UNKNOWN: "Sin información",
};

export function isFlightStatus(value: string | null | undefined): value is FlightStatus {
  return (FLIGHT_STATUSES as readonly string[]).includes(value ?? "");
}

/** Once a flight has landed or been canceled there is nothing more to watch. */
export function isFinalStatus(status: string | null | undefined): boolean {
  return status === "ARRIVED" || status === "CANCELED";
}

export function statusFromAeroDataBox(raw: string | null | undefined): FlightStatus {
  switch ((raw ?? "").trim().toLowerCase()) {
    case "expected":
    case "checkin":
    case "boarding":
    case "gateclosed":
      return "SCHEDULED";
    case "delayed":
      return "DELAYED";
    case "departed":
    case "enroute":
    case "approaching":
      return "DEPARTED";
    case "arrived":
      return "ARRIVED";
    case "canceled":
    case "cancelled":
    case "canceleduncertain":
      return "CANCELED";
    case "diverted":
      return "DIVERTED";
    default:
      return "UNKNOWN";
  }
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** The flight date as YYYY-MM-DD, from the formats the guía form accepts. Null when it cannot be read. */
export function flightDateIso(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slashed = raw.match(/^([A-Za-z]{3})[A-Za-z]*\/(\d{1,2})\/(\d{2,4})$/);
  if (slashed) {
    const month = MONTHS.indexOf(slashed[1].toLowerCase());
    if (month >= 0) {
      const year = slashed[3].length === 2 ? 2000 + Number(slashed[3]) : Number(slashed[3]);
      return `${year}-${String(month + 1).padStart(2, "0")}-${String(Number(slashed[2])).padStart(2, "0")}`;
    }
  }
  const named = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (named) {
    const month = MONTHS.indexOf(named[2].slice(0, 3).toLowerCase());
    if (month >= 0) return `${named[3]}-${String(month + 1).padStart(2, "0")}-${String(Number(named[1])).padStart(2, "0")}`;
  }
  return null;
}

/** "L7 1803" and "la401" become "L71803" and "LA401". */
export function flightNumberKey(value: string | null | undefined): string {
  return (value ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export type FlightDetail = {
  rawStatus: string;
  departureAirport: string;
  arrivalAirport: string;
  scheduledDeparture: string;
  revisedDeparture: string;
  scheduledArrival: string;
  revisedArrival: string;
};

export type FlightLookup = { status: FlightStatus; detail: FlightDetail };

type TimeBlock = { utc?: string; local?: string } | undefined;
type Leg = {
  airport?: { iata?: string; name?: string };
  scheduledTime?: TimeBlock;
  revisedTime?: TimeBlock;
  runwayTime?: TimeBlock;
};
type AeroFlight = { status?: string; departure?: Leg; arrival?: Leg };

function clock(block: TimeBlock): string {
  return block?.local ?? block?.utc ?? "";
}

/**
 * The flight of the guía among the ones the source returns for that number and day. A number can show several
 * legs, or a flight that only arrives that day, so the one that leaves the origin and lands at the destination
 * wins, then the one that leaves the origin, then the one that lands at the destination, then the first.
 */
export function pickFlight(flights: AeroFlight[], origin: string, destination = ""): AeroFlight | null {
  if (flights.length === 0) return null;
  const from = origin.trim().toUpperCase();
  const to = destination.trim().toUpperCase();
  const score = (flight: AeroFlight) =>
    (from && flight.departure?.airport?.iata?.toUpperCase() === from ? 2 : 0) + (to && flight.arrival?.airport?.iata?.toUpperCase() === to ? 1 : 0);
  let best = flights[0];
  for (const flight of flights) if (score(flight) > score(best)) best = flight;
  return best;
}

export function lookupFromFlight(flight: AeroFlight): FlightLookup {
  return {
    status: statusFromAeroDataBox(flight.status),
    detail: {
      rawStatus: flight.status ?? "",
      departureAirport: flight.departure?.airport?.iata ?? "",
      arrivalAirport: flight.arrival?.airport?.iata ?? "",
      scheduledDeparture: clock(flight.departure?.scheduledTime),
      revisedDeparture: clock(flight.departure?.revisedTime ?? flight.departure?.runwayTime),
      scheduledArrival: clock(flight.arrival?.scheduledTime),
      revisedArrival: clock(flight.arrival?.revisedTime ?? flight.arrival?.runwayTime),
    },
  };
}

export type FlightFetch = (url: string, init?: RequestInit) => Promise<Response>;

/** One lookup. Returns null when the source does not know the flight on that date. Throws on a source error. */
export async function fetchFlightStatus(input: {
  flightNumber: string;
  date: string;
  origin: string;
  /** Airport of destination, when the guía has one. Picks the right leg of a flight number. */
  destination?: string;
  apiKey: string;
  fetchImpl?: FlightFetch;
}): Promise<FlightLookup | null> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(input.flightNumber)}/${encodeURIComponent(input.date)}`,
    { headers: { "x-rapidapi-key": input.apiKey, "x-rapidapi-host": "aerodatabox.p.rapidapi.com", accept: "application/json" } },
  );
  if (response.status === 204 || response.status === 404) return null;
  if (!response.ok) throw new Error(`Flight status source answered ${response.status}`);
  const body = (await response.json()) as unknown;
  const flights = Array.isArray(body) ? (body as AeroFlight[]) : [];
  const flight = pickFlight(flights, input.origin, input.destination);
  return flight ? lookupFromFlight(flight) : null;
}

/**
 * Whether a change of status is worth an email. The first sighting of a flight that is simply on schedule is
 * only recorded. An unknown answer never produces an email.
 */
export function shouldNotify(previous: string | null | undefined, next: FlightStatus): boolean {
  if (next === "UNKNOWN") return false;
  if (previous === next) return false;
  if (!previous && next === "SCHEDULED") return false;
  return true;
}

export type FlightEmailInput = {
  awb: string;
  flightNumber: string;
  route: string;
  status: FlightStatus;
  detail: Partial<FlightDetail>;
  portalUrl: string;
};

function when(value: string | undefined): string {
  const text = (value ?? "").trim();
  if (!text) return "";
  const match = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  return match ? `${match[1]} ${match[2]}` : text;
}

/** The email a client gets when the flight of one of its guías changes status. */
export function flightEmail(input: FlightEmailInput): { subject: string; text: string; html: string } {
  const label = FLIGHT_STATUS_LABEL[input.status];
  const subject = `AWB ${input.awb}: vuelo ${input.flightNumber} ${label.toLowerCase()}`;
  const lines = [
    `El estatus del vuelo de su embarque cambió a: ${label}.`,
    "",
    `AWB: ${input.awb}`,
    `Vuelo: ${input.flightNumber}`,
    input.route ? `Ruta: ${input.route}` : "",
    when(input.detail.revisedDeparture || input.detail.scheduledDeparture)
      ? `Salida: ${when(input.detail.revisedDeparture || input.detail.scheduledDeparture)}`
      : "",
    when(input.detail.revisedArrival || input.detail.scheduledArrival)
      ? `Llegada: ${when(input.detail.revisedArrival || input.detail.scheduledArrival)}`
      : "",
    "",
    `Puede ver su guía y el estatus aquí: ${input.portalUrl}`,
    "",
    "ACK TEAM LLC",
  ].filter((line, index, all) => line !== "" || all[index - 1] !== "");
  const text = lines.join("\n");
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1c1917">${lines
    .map((line) => (line ? `<p style="margin:0 0 8px">${escape(line)}</p>` : "<br>"))
    .join("")}</div>`;
  return { subject, text, html };
}
