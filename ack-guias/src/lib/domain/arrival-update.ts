import { applyCargoValue, cargoNumber, parsePrealertCargo, type CargoSource } from "./cargo";

/** Arrival fields the Arrivals Bot may set. Commission and invoice keys are ignored. */

const FLIGHT_KEYS = ["flightNumber", "flight", "airline"] as const;

export type ArrivalPatch = {
  flightNumber?: string | null;
  origin?: string | null;
  dest?: string | null;
  eta?: Date | null;
  etd?: Date | null;
  kgs?: number | null;
  pcs?: number | null;
  kgsSource?: CargoSource | null;
  pcsSource?: CargoSource | null;
};

export type ArrivalPlan =
  | { ok: true; patch: ArrivalPatch; blanks: ArrivalPatch }
  | { ok: false; error: string };

const TEXT_KEYS = ["text", "prealert", "body", "message"] as const;

const MONTHS = new Set(["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]);

const AIRPORT_SKIP = new Set([...MONTHS, "THE", "AND", "FOR", "VIA", "AWB", "PCS", "KGS", "FLT", "ETA", "ETD", "STD", "STA", "USD", "NOT"]);

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function has(input: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function textValue(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

/**
 * Same clock as prealert: a value with no zone suffix is that wall time
 * (appended Z) and the board shows it without converting to Miami local.
 * Invalid text is undefined. Null and "" clear the field.
 */
export function parseArrivalInstant(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const text = String(value).trim();
  if (!text) return null;
  const withZone = /Z$|[+-]\d{2}:\d{2}$/.test(text) ? text : `${text}Z`;
  const date = new Date(withZone);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

export function planArrivalUpdate(input: Record<string, unknown>): ArrivalPlan {
  const patch: ArrivalPatch = {};
  const flightKey = FLIGHT_KEYS.find((key) => has(input, key));
  if (flightKey) {
    const text = textValue(input[flightKey]);
    patch.flightNumber = text ? text.toUpperCase() : null;
  }
  if (has(input, "origin")) {
    const text = textValue(input.origin);
    if (text && !/^[A-Za-z0-9]{2,8}$/.test(text)) {
      return { ok: false, error: "origin should be an airport code." };
    }
    patch.origin = text ? text.toUpperCase() : null;
  }
  if (has(input, "dest")) {
    const text = textValue(input.dest);
    if (text && !/^[A-Za-z]{3}$/.test(text)) {
      return { ok: false, error: "dest should be a 3-letter code." };
    }
    patch.dest = text ? text.toUpperCase() : null;
  }
  for (const field of ["eta", "etd"] as const) {
    if (!has(input, field)) continue;
    const instant = parseArrivalInstant(input[field]);
    if (instant === undefined) return { ok: false, error: `${field} is not a time.` };
    patch[field] = instant;
  }
  if (has(input, "kgs")) {
    const weight = cargoNumber(input.kgs);
    if (weight == null && input.kgs != null && String(input.kgs).trim() !== "") {
      return { ok: false, error: "kgs is not a weight." };
    }
    if (weight != null) patch.kgs = weight;
  }
  if (has(input, "pcs")) {
    const pieces = cargoNumber(input.pcs);
    if (pieces == null && input.pcs != null && String(input.pcs).trim() !== "") {
      return { ok: false, error: "pcs is not a piece count." };
    }
    if (pieces != null) patch.pcs = Math.round(pieces);
  }
  const blanks = scheduleBlanks(input, patch);
  if (!Object.keys(patch).length && !Object.keys(blanks).length) {
    return { ok: false, error: "Send flight, origin, etd, eta, dest, kgs, pcs, or pre-alert text with those fields." };
  }
  return { ok: true, patch, blanks };
}

function scheduleBlanks(input: Record<string, unknown>, patch: ArrivalPatch): ArrivalPatch {
  const textKey = TEXT_KEYS.find((key) => has(input, key));
  if (!textKey) return {};
  const raw = textValue(input[textKey]);
  if (!raw) return {};
  const found = parsePrealertSchedule(raw);
  const blanks: ArrivalPatch = {};
  if (found.flightNumber && !has(patch, "flightNumber")) blanks.flightNumber = found.flightNumber;
  if (found.origin && !has(patch, "origin")) blanks.origin = found.origin;
  if (found.dest && !has(patch, "dest")) blanks.dest = found.dest;
  if (found.etd && !has(patch, "etd")) blanks.etd = found.etd;
  if (found.eta && !has(patch, "eta")) blanks.eta = found.eta;
  const cargo = parsePrealertCargo(raw);
  if (cargo.kgs != null && !has(patch, "kgs")) blanks.kgs = cargo.kgs;
  if (cargo.pcs != null && !has(patch, "pcs")) blanks.pcs = cargo.pcs;
  return blanks;
}

export type PrealertSchedule = {
  flightNumber?: string;
  origin?: string;
  dest?: string;
  etd?: Date;
  eta?: Date;
};

/** Flight, origin, dest, ETD, and ETA pulled out of a pre-alert email body. */
export function parsePrealertSchedule(text: string, now = new Date()): PrealertSchedule {
  const source = text.replace(/\r/g, "");
  const schedule: PrealertSchedule = {};
  const flight = firstFlight(source);
  if (flight) schedule.flightNumber = flight;
  const origin = labeledAirport(source, ["origin", "pol", "aol"]) ?? routedAirport(source, "from");
  const dest = labeledAirport(source, ["destination", "dest", "pod", "aod"]) ?? routedAirport(source, "to");
  if (origin) schedule.origin = origin;
  if (dest) schedule.dest = dest;
  const etdAirport = airportAfterLabel(source, ["etd", "std"]);
  if (!schedule.origin && etdAirport) schedule.origin = etdAirport;
  const etd = labeledInstant(source, ["etd", "std", "departure time", "departure", "departs", "salida"], now);
  const eta = labeledInstant(source, ["eta", "sta", "arrival time", "arrival", "arrives", "llegada"], now);
  if (etd) schedule.etd = etd;
  if (eta) schedule.eta = eta;
  return schedule;
}

function firstFlight(text: string): string | null {
  const labeled = text.match(
    /(?:flight(?:\s*(?:no\.?|number|#))?|flt|vuelo)\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9 /-]{1,24})/i,
  );
  const fromLabel = labeled ? compactFlight(labeled[1]) : null;
  if (fromLabel) return fromLabel;
  return compactFlight(text);
}

function compactFlight(value: string): string | null {
  const withoutDate = value.replace(/\/\d{1,2}[A-Za-z]{3}\b/gi, " ");
  const match = withoutDate.toUpperCase().match(/\b([A-Z]{2}|[A-Z]\d[A-Z]?|\d[A-Z])\s?(\d{2,4})\b/);
  if (!match || MONTHS.has(match[1])) return null;
  return `${match[1]}${match[2]}`;
}

function labeledAirport(text: string, labels: string[]): string | null {
  const pattern = new RegExp(`(?:${labels.join("|")})\\s*[:#]?\\s*([A-Za-z]{3})\\b`, "i");
  const match = text.match(pattern);
  return airport(match?.[1]);
}

function routedAirport(text: string, word: "from" | "to"): string | null {
  const pattern = new RegExp(`\\b${word}\\s+([A-Za-z]{3})\\b`, "i");
  const match = text.match(pattern);
  return airport(match?.[1]);
}

function airport(value: string | undefined): string | null {
  if (!value) return null;
  const code = value.toUpperCase();
  if (!/^[A-Z]{3}$/.test(code) || AIRPORT_SKIP.has(code)) return null;
  return code;
}

function airportAfterLabel(text: string, labels: string[]): string | null {
  const pattern = new RegExp(`(?:${labels.join("|")})\\s+([A-Za-z]{3})\\b`, "i");
  return airport(text.match(pattern)?.[1]);
}

function labeledInstant(text: string, labels: string[], now: Date): Date | null {
  const pattern = new RegExp(`(?:${labels.join("|")})(?:\\s+[A-Za-z]{3})?\\s*[:#]?\\s*([^\\n;|]{4,48})`, "i");
  const match = text.match(pattern);
  if (!match) return null;
  return parseLooseInstant(match[1], now);
}

export function parseLooseInstant(value: string, now = new Date()): Date | null {
  const text = value.trim();
  if (!text) return null;
  const isoLead = text.match(/^(\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?(?:Z|[+-]\d{2}:\d{2})?)/);
  if (isoLead) {
    const normalized = isoLead[1].includes("T") ? isoLead[1] : isoLead[1].replace(" ", "T");
    const iso = parseArrivalInstant(normalized);
    if (iso) return iso;
  }
  const named = text.match(/^(\d{1,2})\s*([A-Za-z]{3})[A-Za-z]*/);
  if (!named) return null;
  const month = MONTH_INDEX[named[2].slice(0, 3).toLowerCase()];
  if (month == null) return null;
  const day = Number(named[1]);
  let rest = text.slice(named[0].length).trim().replace(/^,/, "").trim();
  let year: number | null = null;
  const yearToken = rest.match(/^(\d{4}|\d{2})\b/);
  const timeShaped = /^\d{1,2}:\d{2}/.test(rest);
  if (yearToken && !(yearToken[1].length === 2 && timeShaped)) {
    year = Number(yearToken[1]);
    rest = rest.slice(yearToken[0].length).trim();
  }
  const clock = rest.match(/^(\d{1,2}):(\d{2})/) ?? rest.match(/^(\d{2})(\d{2})\b/);
  const hour = clock ? Number(clock[1]) : 0;
  const minute = clock ? Number(clock[2]) : 0;
  let resolvedYear = year ?? now.getUTCFullYear();
  if (resolvedYear < 100) resolvedYear += 2000;
  if (day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const date = new Date(Date.UTC(resolvedYear, month, day, hour, minute));
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== day) return null;
  if (year == null) {
    const behind = now.getTime() - date.getTime();
    if (behind > 200 * 24 * 60 * 60 * 1000) return new Date(Date.UTC(resolvedYear + 1, month, day, hour, minute));
  }
  return date;
}

export type ArrivalCurrent = {
  flightNumber: string | null;
  origin: string | null;
  dest: string | null;
  eta: Date | null;
  etd: Date | null;
  kgs?: number | null;
  pcs?: number | null;
  kgsSource?: string | null;
  pcsSource?: string | null;
};

/** Explicit schedule keys overwrite. Text fills empty schedule columns. Weight and pieces follow cargo sources. */
export function applyArrivalFields(
  current: ArrivalCurrent,
  planned: { patch: ArrivalPatch; blanks: ArrivalPatch },
): { writes: ArrivalPatch; changed: string[]; kept: string[] } {
  const writes: ArrivalPatch = {};
  const changed: string[] = [];
  const kept: string[] = [];
  const fields = ["flightNumber", "origin", "dest", "eta", "etd"] as const;
  for (const field of fields) {
    const explicit = has(planned.patch, field);
    const fromText = has(planned.blanks, field);
    if (!explicit && !fromText) continue;
    const incoming = (explicit ? planned.patch[field] : planned.blanks[field]) ?? null;
    const before = current[field] ?? null;
    if (!explicit && !isBlank(before)) {
      kept.push(field);
      continue;
    }
    if (sameValue(before, incoming)) continue;
    if (field === "eta" || field === "etd") writes[field] = incoming instanceof Date ? incoming : null;
    else writes[field] = typeof incoming === "string" ? incoming : null;
    changed.push(field);
  }
  for (const field of ["kgs", "pcs"] as const) {
    const explicit = has(planned.patch, field);
    const fromText = has(planned.blanks, field);
    if (!explicit && !fromText) continue;
    const incoming = explicit ? planned.patch[field] : planned.blanks[field];
    if (typeof incoming !== "number") continue;
    const sourceField = field === "kgs" ? "kgsSource" : "pcsSource";
    const decision = applyCargoValue(current[field] ?? null, current[sourceField] ?? null, incoming, "prealert");
    if (!decision) {
      kept.push(field);
      continue;
    }
    if (decision.value !== (current[field] ?? null)) {
      writes[field] = decision.value;
      changed.push(field);
    }
    if (decision.source !== (current[sourceField] ?? null)) writes[sourceField] = decision.source;
  }
  return { writes, changed, kept };
}

function isBlank(value: string | Date | null): boolean {
  if (value == null) return true;
  if (value instanceof Date) return false;
  return value.trim() === "";
}

function sameValue(before: string | Date | null, incoming: string | Date | null): boolean {
  if (incoming instanceof Date) return before instanceof Date && before.getTime() === incoming.getTime();
  return before === incoming;
}

export type PrealertFieldInput = {
  flight?: string | null;
  origin?: string | null;
  dest?: string | null;
  eta?: string | null;
  etd?: string | null;
  pcs?: number | null;
  kgs?: number | null;
  notes?: string | null;
  text?: string | null;
  numberSource?: CargoSource | null;
};

export type PrealertFields = {
  flightNumber: string | null;
  origin: string | null;
  dest: string | null;
  eta: Date | null;
  etd: Date | null;
  pcs: number | null;
  kgs: number | null;
  notes: string | null;
  kgsSource: string | null;
  pcsSource: string | null;
  prealertText: string | null;
};

/**
 * A sent value replaces the column. A missing or blank value leaves a typed
 * column alone. Pre-alert text fills flight, origin, dest, ETD, and ETA only
 * where the column is still empty.
 */
export function composePrealertFields(
  existing: PrealertFields | null,
  explicit: PrealertFieldInput,
): { ok: true; fields: PrealertFields } | { ok: false; error: string } {
  const base: PrealertFields = existing ?? {
    flightNumber: null,
    origin: null,
    dest: null,
    eta: null,
    etd: null,
    pcs: null,
    kgs: null,
    notes: null,
    kgsSource: null,
    pcsSource: null,
    prealertText: null,
  };
  const fields: PrealertFields = { ...base };
  const numberSource: CargoSource = explicit.numberSource === "typed" ? "typed" : "prealert";
  const flight = sentText(explicit.flight);
  if (flight) fields.flightNumber = flight.toUpperCase();
  const origin = sentText(explicit.origin);
  if (origin) {
    if (!/^[A-Za-z0-9]{2,8}$/.test(origin)) return { ok: false, error: "origin should be an airport code." };
    fields.origin = origin.toUpperCase();
  }
  const dest = sentText(explicit.dest);
  if (dest) {
    if (!/^[A-Za-z]{3}$/.test(dest)) return { ok: false, error: "dest should be a 3-letter code." };
    fields.dest = dest.toUpperCase();
  }
  for (const key of ["eta", "etd"] as const) {
    const raw = explicit[key];
    if (raw == null || String(raw).trim() === "") continue;
    const instant = parseArrivalInstant(raw);
    if (!instant) return { ok: false, error: `${key} is not a time.` };
    fields[key] = instant;
  }
  const explicitPcs = explicit.pcs != null && !Number.isNaN(Number(explicit.pcs)) ? Math.round(Number(explicit.pcs)) : null;
  const explicitKgs = explicit.kgs != null && !Number.isNaN(Number(explicit.kgs)) ? Number(explicit.kgs) : null;
  const piecesDecision = applyCargoValue(fields.pcs, fields.pcsSource, explicitPcs, numberSource);
  if (piecesDecision) {
    fields.pcs = piecesDecision.value;
    fields.pcsSource = piecesDecision.source;
  }
  const weightDecision = applyCargoValue(fields.kgs, fields.kgsSource, explicitKgs, numberSource);
  if (weightDecision) {
    fields.kgs = weightDecision.value;
    fields.kgsSource = weightDecision.source;
  }
  const notes = sentText(explicit.notes);
  if (notes) fields.notes = notes;
  const text = sentText(explicit.text);
  if (text) {
    const found = parsePrealertSchedule(text);
    if (!fields.flightNumber && found.flightNumber) fields.flightNumber = found.flightNumber;
    if (!fields.origin && found.origin) fields.origin = found.origin;
    if (!fields.dest && found.dest) fields.dest = found.dest;
    if (!fields.etd && found.etd) fields.etd = found.etd;
    if (!fields.eta && found.eta) fields.eta = found.eta;
    const cargo = parsePrealertCargo(text);
    if (explicitKgs == null) {
      const fromEmail = applyCargoValue(fields.kgs, fields.kgsSource, cargo.kgs, "prealert");
      if (fromEmail) {
        fields.kgs = fromEmail.value;
        fields.kgsSource = fromEmail.source;
      }
    }
    if (explicitPcs == null) {
      const fromEmail = applyCargoValue(fields.pcs, fields.pcsSource, cargo.pcs, "prealert");
      if (fromEmail) {
        fields.pcs = fromEmail.value;
        fields.pcsSource = fromEmail.source;
      }
    }
    fields.prealertText = text;
  }
  return { ok: true, fields };
}

function sentText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

export function chooseArrivalMatch<T extends { id: string }>(
  rows: T[],
): { ok: true; row: T } | { ok: false; reason: "not_found" } | { ok: false; reason: "ambiguous"; ids: string[] } {
  if (rows.length === 0) return { ok: false, reason: "not_found" };
  if (rows.length > 1) return { ok: false, reason: "ambiguous", ids: rows.map((row) => row.id) };
  return { ok: true, row: rows[0] };
}
