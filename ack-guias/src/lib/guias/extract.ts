import { z } from "zod";
import { parsePrealertCargo } from "@/lib/domain/cargo";
import { parsePrealertSchedule } from "@/lib/domain/arrival-update";

export const REVIEW_FIELDS = [
  "client",
  "shipper",
  "consignee",
  "origin",
  "destination",
  "pieces",
  "chargeableKg",
  "goods",
  "issuingCompany",
] as const;

export type ReviewField = (typeof REVIEW_FIELDS)[number];

export type GuiaValues = {
  client: string;
  shipper: string;
  shipperAddress: string;
  consignee: string;
  consigneeAddress: string;
  notify: string;
  notifyAddress: string;
  origin: string;
  destination: string;
  flightNumber: string;
  flightDate: string;
  pieces: string;
  chargeableKg: string;
  grossKg: string;
  goods: string;
  handling: string;
  aesItn: string;
  hawb: string;
  issuingCompany: "" | "kope" | "ack";
};

export type ExtractedGuia = {
  values: GuiaValues;
  review: ReviewField[];
  snippets: Partial<Record<keyof GuiaValues, string>>;
  source: "rules" | "ai";
  note?: string;
};

const EMPTY: GuiaValues = {
  client: "",
  shipper: "",
  shipperAddress: "",
  consignee: "",
  consigneeAddress: "",
  notify: "",
  notifyAddress: "",
  origin: "",
  destination: "",
  flightNumber: "",
  flightDate: "",
  pieces: "",
  chargeableKg: "",
  grossKg: "",
  goods: "",
  handling: "",
  aesItn: "",
  hawb: "",
  issuingCompany: "",
};

const LABELS: Array<{ keys: string[]; field: keyof GuiaValues; address?: "shipperAddress" | "consigneeAddress" | "notifyAddress" }> = [
  { keys: ["client"], field: "client" },
  { keys: ["shipper"], field: "shipper", address: "shipperAddress" },
  { keys: ["consignee"], field: "consignee", address: "consigneeAddress" },
  { keys: ["notify"], field: "notify", address: "notifyAddress" },
  { keys: ["origin"], field: "origin" },
  { keys: ["destination", "dest"], field: "destination" },
  { keys: ["flight number", "flight no", "flight"], field: "flightNumber" },
  { keys: ["date", "flight date"], field: "flightDate" },
  { keys: ["shipping units", "shipping unit", "pieces", "pcs"], field: "pieces" },
  { keys: ["chargeable kg", "chargeable weight", "chargeable", "kg", "kgs"], field: "chargeableKg" },
  { keys: ["gross", "gross kg", "gross weight", "weight"], field: "grossKg" },
  { keys: ["hawb", "hawb number", "house awb"], field: "hawb" },
  { keys: ["goods", "description", "nature"], field: "goods" },
  { keys: ["handling", "special handling"], field: "handling" },
  { keys: ["aes itn", "itn"], field: "aesItn" },
  { keys: ["issuing company", "issuing", "company"], field: "issuingCompany" },
];

function emptyExtract(source: ExtractedGuia["source"]): ExtractedGuia {
  return { values: { ...EMPTY }, review: [], snippets: {}, source };
}

function companyCode(value: string): GuiaValues["issuingCompany"] {
  if (!value.trim()) return "";
  return "ack";
}

function grounded(source: string, value: string): boolean {
  const needle = value.trim().toLowerCase();
  if (!needle) return false;
  return source.toLowerCase().includes(needle);
}

/** A count is kept only when the line is a number plus an optional unit. HAWB piece counts are not master pieces. */
function numericField(line: string, value: string): string {
  if (/hawb/i.test(line)) return "";
  if (/\b(about|approx(?:imately)?|around|maybe|estimated|est\.?)\b/i.test(value)) return "";
  const match = value.match(/^([\d,]+(?:\.\d+)?)(?:\s*(?:pkgs?|packages|pcs|pieces|kg|kgs|kilos?))?$/i);
  if (!match) return "";
  return match[1].replace(/,/g, "");
}

function hawbValue(line: string, value: string): string {
  if (/pieces|pkgs|shipping\s+units|\bpcs\b/i.test(line)) return "";
  const match = value.match(/^([A-Za-z0-9][A-Za-z0-9-]{2,})$/);
  if (!match || /^pcs$/i.test(match[1])) return "";
  return match[1];
}

function snippetLine(text: string, pattern: RegExp): string {
  return text.split("\n").map((line) => line.trim()).find((line) => pattern.test(line)) ?? "";
}

function applyCargoHints(text: string, extracted: ExtractedGuia) {
  const cargo = parsePrealertCargo(text);
  const schedule = parsePrealertSchedule(text);
  if (!extracted.values.pieces && cargo.pcs != null) {
    extracted.values.pieces = String(cargo.pcs);
    const line = snippetLine(text, /shipping\s+units|(?:pieces|pkgs|packages|pcs)\s*:/i);
    if (line) extracted.snippets.pieces = line;
  }
  if (!extracted.values.grossKg && cargo.kgs != null) {
    extracted.values.grossKg = String(cargo.kgs);
    const line = snippetLine(text, /weight|kgs?/i);
    if (line) extracted.snippets.grossKg = line;
  }
  if (!extracted.values.flightNumber && schedule.flightNumber) {
    extracted.values.flightNumber = schedule.flightNumber;
    const line = snippetLine(text, /flight/i);
    if (line) extracted.snippets.flightNumber = line;
  }
  if (!extracted.values.origin && schedule.origin) {
    extracted.values.origin = schedule.origin;
    const line = snippetLine(text, /origin|\betd\b/i);
    if (line) extracted.snippets.origin = line;
  }
  if (!extracted.values.destination && schedule.dest) {
    extracted.values.destination = schedule.dest;
    const line = snippetLine(text, /destination|\beta\b/i);
    if (line) extracted.snippets.destination = line;
  }
  if (!extracted.values.flightDate && schedule.etd) {
    const iso = schedule.etd.toISOString().slice(0, 10);
    if (text.includes(iso)) {
      extracted.values.flightDate = iso;
      const line = snippetLine(text, /\betd\b/i);
      if (line) extracted.snippets.flightDate = line;
    }
  }
  if (!extracted.values.hawb) {
    const line = text.split("\n").map((item) => item.trim()).find((item) => /^hawb\b/i.test(item) && !/pieces|pkgs|\bpcs\b/i.test(item));
    const number = line ? hawbValue(line, line.replace(/^hawb(?:\s*(?:no\.?|number|#))?\s*[:#-]?\s*/i, "")) : "";
    if (number) {
      extracted.values.hawb = number;
      extracted.snippets.hawb = line ?? number;
    }
  }
}

function flagReview(extracted: ExtractedGuia) {
  extracted.review = REVIEW_FIELDS.filter((field) => !extracted.values[field]);
}

/** Label reader. Kg without the word gross is chargeable weight. Gross is stored aside. */
export function rulesExtract(text: string): ExtractedGuia {
  const extracted = emptyExtract("rules");
  const lines = text.replace(/\r/g, "").split("\n");
  const labelPattern = LABELS.flatMap((entry) => entry.keys).sort((a, b) => b.length - a.length);
  const matcher = new RegExp(`^(${labelPattern.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\s*:\\s*(.*)$`, "i");

  let current: { field: keyof GuiaValues; address?: "shipperAddress" | "consigneeAddress" | "notifyAddress" } | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^from:/i.test(line) || /^subject:/i.test(line) || /^to:/i.test(line) || /^sent:/i.test(line)) {
      current = null;
      continue;
    }
    const match = line.match(matcher);
    if (match) {
      const key = match[1].toLowerCase();
      const entry = LABELS.find((item) => item.keys.includes(key));
      const value = match[2].trim();
      current = entry ? { field: entry.field, address: entry.address } : null;
      if (!entry || !value) continue;
      if (entry.field === "issuingCompany") {
        extracted.values.issuingCompany = companyCode(value);
        extracted.snippets.issuingCompany = line;
      } else if (entry.field === "aesItn") {
        const token = value.replace(/^AES\s*ITN\s*:\s*/i, "").trim();
        if (!token) continue;
        extracted.values.aesItn = token;
        extracted.snippets.aesItn = line;
      } else if (entry.field === "chargeableKg" || entry.field === "grossKg" || entry.field === "pieces" || entry.field === "hawb") {
        const number = entry.field === "hawb" ? hawbValue(line, value) : numericField(line, value);
        if (!number) {
          current = null;
          continue;
        }
        extracted.values[entry.field] = number;
        extracted.snippets[entry.field] = line;
      } else {
        extracted.values[entry.field] = value;
        extracted.snippets[entry.field] = line;
      }
      continue;
    }
    if (current?.address && !extracted.values[current.address]) {
      extracted.values[current.address] = line;
      extracted.snippets[current.address] = line;
      current = null;
    } else {
      current = null;
    }
  }
  applyCargoHints(text, extracted);
  for (const field of Object.keys(extracted.values) as Array<keyof GuiaValues>) {
    const value = extracted.values[field];
    if (!value) continue;
    if (!grounded(text, value)) {
      if (field === "issuingCompany") extracted.values.issuingCompany = "";
      else extracted.values[field] = "";
      delete extracted.snippets[field];
    }
  }
  flagReview(extracted);
  return extracted;
}

const aiField = z.object({
  value: z.string().optional().default(""),
  uncertain: z.boolean().optional().default(false),
  snippet: z.string().optional().default(""),
});

const aiSchema = z.object({
  fields: z.record(z.string(), aiField),
});

export function fromAiPayload(text: string, payload: unknown): ExtractedGuia {
  const extracted = emptyExtract("ai");
  const parsed = aiSchema.safeParse(payload);
  if (!parsed.success) {
    const rules = rulesExtract(text);
    rules.note = "The model reply was not usable. Filled from labels only.";
    return rules;
  }
  for (const field of Object.keys(EMPTY) as Array<keyof GuiaValues>) {
    const item = parsed.data.fields[field];
    if (!item) continue;
    const value = item.value.trim();
    const snippet = item.snippet.trim();
    if (item.uncertain || !value) continue;
    const inSource = grounded(text, value) || (snippet && grounded(text, snippet) && grounded(snippet, value));
    if (!inSource) continue;
    if (field === "issuingCompany") {
      const code = companyCode(value);
      if (!code) continue;
      extracted.values.issuingCompany = code;
    } else if (field === "pieces" || field === "chargeableKg" || field === "grossKg" || field === "hawb") {
      if (field === "pieces" && /hawb/i.test(`${snippet}\n${value}`)) continue;
      if (field === "chargeableKg" && snippet && /\bweight\b/i.test(snippet) && !/chargeable/i.test(snippet)) continue;
      const number = field === "hawb" ? value : value.match(/[\d.]+/)?.[0] ?? "";
      if (!number || !grounded(text, number)) continue;
      if (field === "hawb" && /pieces|pkgs|\bpcs\b/i.test(snippet)) continue;
      extracted.values[field] = number;
    } else {
      extracted.values[field] = value;
    }
    if (snippet) extracted.snippets[field] = snippet;
  }
  flagReview(extracted);
  return extracted;
}

export type AiComplete = (prompt: string) => Promise<string>;

export function extractionPrompt(text: string): string {
  return [
    "Extract a cargo guía from the message below.",
    "Return JSON only, shape {\"fields\": {\"client\": {\"value\": \"\", \"uncertain\": false, \"snippet\": \"\"}}}.",
    "Fields: client, shipper, shipperAddress, consignee, consigneeAddress, notify, notifyAddress, origin, destination, flightNumber, flightDate, pieces, chargeableKg, grossKg, goods, handling, hawb, issuingCompany.",
    "pieces is Shipping Units or a pieces line that is not a HAWB piece count. chargeableKg is only a chargeable weight. A plain Weight line is grossKg.",
    "issuingCompany is always ACK. ACK TEAM LLC is the only issuer.",
    "chargeableKg is the billed weight. grossKg is optional and is never the billed weight.",
    "If you are not sure, set uncertain true and value to an empty string. Never invent a value that is not in the message.",
    "snippet must be the exact source phrase.",
    "",
    text,
  ].join("\n");
}

export async function extractGuia(text: string, complete?: AiComplete | null): Promise<ExtractedGuia> {
  if (!complete) {
    const rules = rulesExtract(text);
    rules.note = "No AI key is set. Filled from labels only.";
    return rules;
  }
  let raw = "";
  try {
    raw = await complete(extractionPrompt(text));
  } catch {
    const rules = rulesExtract(text);
    rules.note = "The AI parser failed. Filled from labels only.";
    return rules;
  }
  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < jsonStart) {
    const rules = rulesExtract(text);
    rules.note = "The model reply was not JSON. Filled from labels only.";
    return rules;
  }
  try {
    return fromAiPayload(text, JSON.parse(raw.slice(jsonStart, jsonEnd + 1)));
  } catch {
    const rules = rulesExtract(text);
    rules.note = "The model reply was not usable. Filled from labels only.";
    return rules;
  }
}
