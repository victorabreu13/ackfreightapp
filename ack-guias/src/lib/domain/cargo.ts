/**
 * Weight and pieces read from a pre-alert email: the body and, when the body
 * is missing a figure, the MAWB PDF or Excel attached to it.
 *
 * Shipping units are the master piece count. A "Pieces" line marked HAWB is
 * the house count and is not the board pieces column.
 *
 * Sources:
 * - typed: a person saved the shipment, or the arrivals sheet already had the number
 * - carrier: a tracking lookup
 * - prealert: this email, its PDF, or its workbook
 *
 * A carrier weight replaces a pre-alert weight. A typed weight stays.
 * A missing carrier weight does not clear a number that is already stored.
 */

export type CargoSource = "typed" | "carrier" | "prealert";

export type CargoFigures = {
  pcs: number | null;
  kgs: number | null;
};

const EMPTY: CargoFigures = { pcs: null, kgs: null };

export function cargoNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/,/g, "");
  if (!text || !/^\d+(?:\.\d+)?$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** IVI-style pre-alert body, and the same labels when they appear in a PDF or a sheet. */
export function parsePrealertCargo(text: string): CargoFigures {
  const source = String(text || "").replace(/\r/g, "");
  if (!source.trim()) return EMPTY;
  return {
    pcs: masterPieces(source),
    kgs: grossWeight(source),
  };
}

export function cargoFromCells(cells: string[]): CargoFigures {
  return parsePrealertCargo(cells.map((cell) => cell.trim()).filter(Boolean).join("\n"));
}

/**
 * The email body wins. Attachments fill only the figures the body left blank.
 * MAWB PDFs are preferred over drafts, then other workbooks, then other PDFs.
 */
export function mergePrealertCargo(body: CargoFigures, files: Array<CargoFigures & { filename: string }>): CargoFigures {
  const ranked = [...files].sort((left, right) => attachmentRank(left.filename) - attachmentRank(right.filename));
  let pcs = body.pcs;
  let kgs = body.kgs;
  for (const file of ranked) {
    if (attachmentRank(file.filename) >= 9) continue;
    if (pcs == null && file.pcs != null) pcs = file.pcs;
    if (kgs == null && file.kgs != null) kgs = file.kgs;
    if (pcs != null && kgs != null) break;
  }
  return { pcs, kgs };
}

export function attachmentRank(filename: string): number {
  const name = filename.trim().toLowerCase();
  if (/\.(png|jpe?g|gif|webp|heic)$/.test(name)) return 9;
  if (/awb/.test(name) && name.endsWith(".pdf")) return 0;
  if (/draft/.test(name) && /\.xls/.test(name)) return 1;
  if (/\.xls/.test(name)) return 2;
  if (name.endsWith(".pdf")) return 3;
  return 9;
}

/**
 * Returns the value to store, or null when the incoming figure must not replace
 * what is already there. A number with no recorded source is treated as typed.
 */
export function applyCargoValue(
  current: number | null,
  source: string | null,
  incoming: number | null,
  incomingSource: CargoSource,
): { value: number; source: CargoSource } | null {
  if (incoming == null || !Number.isFinite(incoming) || incoming <= 0) return null;
  const locked = source === "typed" || (current != null && (source == null || source === ""));
  if (locked && incomingSource !== "typed") return null;
  if (source === "carrier" && incomingSource === "prealert") return null;
  if (current === incoming && (source === incomingSource || locked)) return null;
  if (current === incoming && source !== incomingSource && !locked) {
    return { value: incoming, source: incomingSource };
  }
  if (current === incoming) return null;
  return { value: incoming, source: incomingSource };
}

function masterPieces(text: string): number | null {
  const lines = text.split("\n");
  for (const line of lines) {
    if (/hawb/i.test(line)) continue;
    const shipping = line.match(/shipping\s+units?\s*[:#-]?\s*([\d,]+(?:\.\d+)?)/i);
    const count = cargoNumber(shipping?.[1] ?? null);
    if (count != null) return Math.round(count);
  }
  for (const line of lines) {
    if (/hawb/i.test(line)) continue;
    const labeled = line.match(/(?:pieces|pkgs|packages|bultos|pcs)\s*[:#-]?\s*([\d,]+(?:\.\d+)?)/i);
    const count = cargoNumber(labeled?.[1] ?? null);
    if (count != null) return Math.round(count);
    const suffix = line.match(/\b([\d,]+(?:\.\d+)?)\s*(?:pkgs|packages)\b/i);
    const fromSuffix = cargoNumber(suffix?.[1] ?? null);
    if (fromSuffix != null) return Math.round(fromSuffix);
  }
  return null;
}

function grossWeight(text: string): number | null {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (/chargeable|volumetric|\bchw\b/i.test(line)) continue;
    const labeled = line.match(/(?:gross\s+)?weight\s*[:#-]?\s*([\d,]+(?:\.\d+)?)/i);
    const fromLabel = cargoNumber(labeled?.[1] ?? null);
    if (fromLabel != null) return fromLabel;
    const kilos = line.match(/(?:^|\b)(?:kgs?|kilos|gross)\s*[:#-]?\s*([\d,]+(?:\.\d+)?)/i);
    const fromKilos = cargoNumber(kilos?.[1] ?? null);
    if (fromKilos != null) return fromKilos;
  }
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!/^(?:gross\s+)?weight$|^kgs?$|^g\.?w\.?$/i.test(lines[index])) continue;
    const next = lines[index + 1].match(/^([\d,]+(?:\.\d+)?)(?:\s*(?:kgs?|kilos?))?$/i);
    const value = cargoNumber(next?.[1] ?? null);
    if (value != null) return value;
  }
  const inline = text.match(/\b([\d,]+(?:\.\d+)?)\s*kgs?\b/i);
  return cargoNumber(inline?.[1] ?? null);
}
