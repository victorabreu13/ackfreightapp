// The link from ACK Guías to ACK Freight (the dispatch app): a pickup order or a guía
// whose cargo is ready becomes a trip request there. This file builds what is sent and
// sends it; it needs no database, so it can be tested on its own.

export const ACK_FREIGHT_DEFAULT_URL = "https://us-central1-ack-freight.cloudfunctions.net/guiasTripRequest";
/** Where a pickup is taken to, and where a delivery starts. Can be changed with ACK_FREIGHT_WAREHOUSE. */
export const ACK_FREIGHT_DEFAULT_WAREHOUSE = "ACK Warehouse";
const SEND_TIMEOUT_MS = 25000;
/** ACK Freight refuses a file over about 6 MB. */
export const MAX_DOCUMENT_BYTES = 6 * 1024 * 1024;

export type TripDocument = { slot: "awb" | "loa" | "do"; name: string; contentBase64: string };

export type TripPayload = {
  externalId: string;
  kind: "pickup" | "delivery";
  clientName: string;
  clientEmail?: string;
  from: string;
  to: string;
  tripDate?: string;
  pickupTime?: string;
  personRequesting?: string;
  notes?: string;
  awbLines: {
    awbNumber: string;
    type?: string;
    qtyPieces: number;
    kilograms: number;
    hazmat?: boolean;
    unNumber?: string;
    documents?: TripDocument[];
  }[];
};

export type SendResult = { state: "sent" | "exists" | "skipped" | "failed"; id?: string; message: string };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function realDay(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return "";
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** The day as typed ("2026-10-30", "10/30/2026", "10/30") to YYYY-MM-DD, or "" when it can't be read. */
export function parsePickupDay(value: string | null | undefined, now: Date = new Date()): string {
  const text = String(value ?? "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (m) return realDay(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(text);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return realDay(year, Number(m[1]), Number(m[2]));
  }
  m = /^(\d{1,2})[/-](\d{1,2})$/.exec(text);
  if (m) return realDay(now.getFullYear(), Number(m[1]), Number(m[2]));
  return "";
}

/** "14:30", "2:30 PM", "2pm" to HH:mm, or "" when it can't be read. */
export function parseReadyTime(value: string | null | undefined): string {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?$|^(\d{1,2}):(\d{2})$/i.exec(String(value ?? "").trim());
  if (!m) return "";
  if (m[4] !== undefined) {
    const h = Number(m[4]);
    const min = Number(m[5]);
    return h <= 23 && min <= 59 ? `${pad(h)}:${pad(min)}` : "";
  }
  let h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  if (h < 1 || h > 12 || min > 59) return "";
  const pm = m[3].toLowerCase() === "p";
  if (h === 12) h = pm ? 12 : 0;
  else if (pm) h += 12;
  return `${pad(h)}:${pad(min)}`;
}

function oneLine(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s*\n+\s*/g, ", ").trim();
}

export type PickupInput = {
  number: string; // "PU-0007"
  clientLabel: string;
  shipperName: string;
  shipperAddress?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  consigneeName?: string | null;
  destination?: string | null;
  pieces?: number | null;
  weightKg?: number | null;
  description?: string | null;
  pickupDate?: string | null;
  readyTime?: string | null;
  truckerName?: string | null;
  truckerPhone?: string | null;
  driverName?: string | null;
  notes?: string | null;
  awb?: string | null;
};

/**
 * Pickup order -> trip request: from the shipper to the warehouse. The line carries the pickup number
 * (not the AWB), so the AWB stays on one trip request only: the delivery one.
 */
export function pickupTripPayload(p: PickupInput, warehouse: string = ACK_FREIGHT_DEFAULT_WAREHOUSE): TripPayload {
  const notes = [
    p.awb ? `AWB reservado: ${p.awb}` : "",
    p.consigneeName || p.destination ? `Consignee: ${[p.consigneeName, p.destination].filter(Boolean).join(" · ")}` : "",
    p.description ? `Carga: ${oneLine(p.description)}` : "",
    p.contactName || p.contactPhone || p.contactEmail
      ? `Contacto en el shipper: ${[p.contactName, p.contactPhone, p.contactEmail].filter(Boolean).join(" · ")}`
      : "",
    p.truckerName || p.driverName ? `Trucker: ${[p.truckerName, p.driverName, p.truckerPhone].filter(Boolean).join(" · ")}` : "",
    p.notes ? oneLine(p.notes) : "",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    externalId: p.number,
    kind: "pickup",
    clientName: p.clientLabel,
    from: [p.shipperName, oneLine(p.shipperAddress)].filter(Boolean).join(", "),
    to: warehouse,
    tripDate: parsePickupDay(p.pickupDate),
    pickupTime: parseReadyTime(p.readyTime),
    personRequesting: p.contactName || "ACK Guías",
    notes,
    awbLines: [{ awbNumber: p.number, type: "Loose", qtyPieces: Math.max(1, Math.round(p.pieces ?? 1)), kilograms: p.weightKg ?? 0 }],
  };
}

export type DeliveryInput = {
  id: string;
  awb: string;
  clientLabel?: string | null;
  carrierName?: string | null;
  destination?: string | null;
  flightNumber?: string | null;
  flightDate?: string | null;
  shipperName?: string | null;
  consigneeName?: string | null;
  seal?: string | null;
  bup?: boolean;
  dgDeclarable?: boolean;
  unNumbers?: string | null;
  lines: { pieces: number | null; grossWeight: number | null; kgLb: string }[];
  documents: TripDocument[];
};

/** Cargo ready -> trip request: from the warehouse to the airline, with the guía's documents attached. */
export function deliveryTripPayload(g: DeliveryInput, warehouse: string = ACK_FREIGHT_DEFAULT_WAREHOUSE): TripPayload {
  const pieces = g.lines.reduce((n, l) => n + (l.pieces ?? 0), 0);
  const kg = g.lines.reduce((n, l) => n + (l.kgLb === "L" ? (l.grossWeight ?? 0) / 2.20462 : (l.grossWeight ?? 0)), 0);
  const flight = [g.flightNumber, g.flightDate].filter(Boolean).join(" · ");
  const notes = [
    `AWB ${g.awb}${g.destination ? ` · destino ${g.destination}` : ""}`,
    flight ? `Vuelo: ${flight}` : "",
    g.shipperName || g.consigneeName ? `Shipper: ${g.shipperName ?? "-"} · Consignee: ${g.consigneeName ?? "-"}` : "",
    g.seal ? `Seal: ${g.seal}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const un = String(g.unNumbers ?? "").split(/[,;\s]+/).filter(Boolean)[0] ?? "";
  return {
    externalId: g.id,
    kind: "delivery",
    clientName: String(g.clientLabel ?? "").trim(),
    from: warehouse,
    to: String(g.carrierName ?? "").trim() || "Airline cargo counter",
    personRequesting: "ACK Guías",
    notes,
    awbLines: [
      {
        awbNumber: g.awb,
        type: g.bup ? "PMC" : "Loose",
        qtyPieces: Math.max(1, pieces),
        kilograms: Math.round(kg * 10) / 10,
        hazmat: g.dgDeclarable === true,
        unNumber: g.dgDeclarable ? un : "",
        documents: g.documents,
      },
    ],
  };
}

/** Which ACK Freight document each kind of Guías document becomes (the pickup order is the authorization to truck). */
export const DOCUMENT_SLOT_BY_KIND: Record<string, TripDocument["slot"]> = { awb: "awb", pickup: "loa", delivery: "do" };

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ status: number; json: () => Promise<unknown> }>;

/** Sends the trip request to ACK Freight. Never throws: the order it came from must not fail because of the link. */
export async function sendTripRequest(
  payload: TripPayload,
  options: { env?: Record<string, string | undefined>; fetchImpl?: FetchLike } = {},
): Promise<SendResult> {
  const env = options.env ?? process.env;
  const secret = env.ACK_FREIGHT_INTAKE_SECRET?.trim();
  if (!secret) return { state: "skipped", message: "La conexión con ACK Freight no está configurada." };
  const url = env.ACK_FREIGHT_INTAKE_URL?.trim() || ACK_FREIGHT_DEFAULT_URL;
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-guias-secret": secret },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => ({}))) as { id?: string; created?: boolean; message?: string; error?: string };
    if (response.status === 201) return { state: "sent", id: body.id, message: "Trip request creado en ACK Freight." };
    if (response.status === 200) return { state: "exists", id: body.id, message: "Ese trip request ya estaba en ACK Freight." };
    return { state: "failed", message: body.message || body.error || `ACK Freight respondió ${response.status}.` };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return { state: "failed", message: timedOut ? "ACK Freight no respondió a tiempo." : "No se pudo conectar con ACK Freight." };
  } finally {
    clearTimeout(timer);
  }
}
