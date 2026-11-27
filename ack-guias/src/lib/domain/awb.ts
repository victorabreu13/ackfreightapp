const AWB_RE = /^(\d{3})-(\d{8})$/;

export function normalizeAwb(value: unknown): string | null {
  if (value == null) return null;
  let raw = String(value).trim().replace(/\s+/g, "");
  if (!raw || raw.startsWith("#")) return null;
  if (/^\d+\.0$/.test(raw)) raw = raw.slice(0, -2);
  if (/^\d{11}$/.test(raw)) raw = `${raw.slice(0, 3)}-${raw.slice(3)}`;
  const match = raw.match(AWB_RE);
  return match ? `${match[1]}-${match[2]}` : null;
}

export function awbPrefix(awb: string): string {
  return awb.slice(0, 3);
}

/** Every AWB in the text, as PPP-NNNNNNNN. Accepts dashes, spaces, or 11 bare digits. */
export function awbCandidates(value: unknown): string[] {
  const text = String(value ?? "");
  const found = new Set<string>();
  const direct = normalizeAwb(text);
  if (direct) found.add(direct);
  for (const match of text.match(/\d{3}[\s\-–]?\d{4}\s?\d{4}|\d{11}/g) || []) {
    const normalized = normalizeAwb(match);
    if (normalized) found.add(normalized);
  }
  return [...found];
}

export function isSplitMarker(value: unknown): boolean {
  if (value == null) return false;
  return String(value).trim().toUpperCase() === "SPLIT";
}

export function padPrefix(value: unknown): string | null {
  if (value == null || value === "") return null;
  let raw = String(value).trim();
  if (/^\d+\.0$/.test(raw)) raw = raw.slice(0, -2);
  if (!/^\d{1,3}$/.test(raw)) return raw.toUpperCase();
  return raw.padStart(3, "0");
}

export function padSerial(value: unknown): string | null {
  if (value == null || value === "") return null;
  let raw = String(value).trim();
  if (/^\d+\.0$/.test(raw)) raw = raw.slice(0, -2);
  if (!/^\d+$/.test(raw)) return raw;
  if (raw.length > 8) return raw;
  return raw.padStart(8, "0");
}

export function composeMawb(prefix: unknown, serial: unknown): string | null {
  const awb = normalizeAwb(serial);
  if (awb) return awb;
  const p = padPrefix(prefix);
  const s = padSerial(serial);
  if (!p || !s || !/^\d{3}$/.test(p) || !/^\d{8}$/.test(s)) return null;
  return `${p}-${s}`;
}

const ULD_RE =
  /\b([A-Z]{3})\s*([0-9]{3,6})\s*([A-Z]{1,3}\d?)?\s*[=\-–]\s*(\d+)\s*PCS\b/gi;

export type ParsedUld = {
  code: string;
  contour: string | null;
  pcs: number;
  raw: string;
};

export function parseUldNotes(notes: string | null | undefined): ParsedUld[] {
  if (!notes) return [];
  const found: ParsedUld[] = [];
  for (const match of notes.matchAll(ULD_RE)) {
    found.push({
      code: `${match[1].toUpperCase()} ${match[2]}`,
      contour: match[3] ? match[3].toUpperCase() : null,
      pcs: Number(match[4]),
      raw: match[0].replace(/\s+/g, " ").trim(),
    });
  }
  return found;
}

export function awbParts(awb: string): { prefix: string; serial: string } | null {
  const match = awb.replace(/\s+/g, "").match(/^(\d{3})-?(\d{8})$/);
  if (!match) return null;
  return { prefix: match[1], serial: match[2] };
}

export function trackingUrl(
  template: string | null | undefined,
  awb: string,
  flightNumber?: string | null,
): string {
  const base = template?.trim();
  if (!base) return "";
  const compact = awb.replace(/-/g, "");
  const parts = awbParts(awb);
  return base
    .replaceAll("{awb}", encodeURIComponent(awb))
    .replaceAll("{compact}", encodeURIComponent(compact))
    .replaceAll("{prefix}", encodeURIComponent(parts?.prefix ?? awbPrefix(awb)))
    .replaceAll("{serial}", encodeURIComponent(parts?.serial ?? ""))
    .replaceAll("{flight}", encodeURIComponent(flightNumber ?? ""));
}
