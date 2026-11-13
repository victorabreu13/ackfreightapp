// Bulk upload of AWBs: the AWB number is read from each file's name, files are
// grouped per AWB (and per document: AWB, Letter of Authorization, Delivery
// Order), and a list pasted from a spreadsheet fills in pieces / kilograms / type.
import { ULD_TYPES, UldType } from "../types";

export type DocSlot = "awb" | "loa" | "do";

export interface PickedFile {
  uri: string;
  name: string;
}

export interface FileRow {
  awbNumber: string;
  files: Partial<Record<DocSlot, PickedFile>>;
}

export interface LeftFile {
  file: PickedFile;
  reason: string;
}

// Same AWB in any spelling ("045-5406 6773", "04554066773") compares equal.
export function awbKeyOf(value: string): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function baseName(name: string): string {
  return String(name ?? "").replace(/\.[A-Za-z0-9]{1,5}$/, "");
}

// "045-54066773 LOA.pdf" -> "045-54066773". Null when the name carries no AWB number.
export function awbFromFileName(name: string): string | null {
  const text = baseName(name);
  let m = /(?:^|\D)(\d{3})[\s_.-]?(\d{8})(?!\d)/.exec(text);
  if (m) return `${m[1]}-${m[2]}`;
  m = /(?:^|\D)(\d{3})[\s_.-]?(\d{4})[\s_.-]?(\d{4})(?!\d)/.exec(text);
  if (m) return `${m[1]}-${m[2]}${m[3]}`;
  return null;
}

// Which document a file is, from words in its name. Anything else is the AWB itself.
export function slotFromFileName(name: string): DocSlot {
  const text = baseName(name)
    .toLowerCase()
    .replace(/\d+/g, " ");
  if (/(^|[^a-z])(loa|authori[sz]ation|letter)([^a-z]|$)/.test(text)) return "loa";
  if (/(^|[^a-z])(do|d\.o|delivery|ticket|dt)([^a-z]|$)/.test(text)) return "do";
  return "awb";
}

const SLOT_LABEL: Record<DocSlot, string> = { awb: "AWB", loa: "LOA", do: "Delivery Order" };

// Puts each picked file on the row of its AWB, making a row when there is none yet.
// A file that can't be placed (no AWB number in its name, or that document is
// already on the row) comes back in `left` with the reason.
export function placeFiles<T extends FileRow>(
  rows: T[],
  picked: PickedFile[],
  makeRow: (awbNumber: string) => T
): { rows: T[]; left: LeftFile[] } {
  const next = rows.map((r) => ({ ...r, files: { ...r.files } }));
  const left: LeftFile[] = [];
  for (const file of picked) {
    const awbNumber = awbFromFileName(file.name);
    if (!awbNumber) {
      left.push({ file, reason: "No AWB number in the file name" });
      continue;
    }
    const slot = slotFromFileName(file.name);
    const key = awbKeyOf(awbNumber);
    let row = next.find((r) => awbKeyOf(r.awbNumber) === key);
    if (!row) {
      row = makeRow(awbNumber);
      row.files = { ...row.files };
      next.push(row);
    }
    if (row.files[slot]) {
      left.push({ file, reason: `${row.awbNumber} already has a ${SLOT_LABEL[slot]} file` });
      continue;
    }
    row.files[slot] = file;
  }
  return { rows: next, left };
}

export interface SheetRow {
  awbNumber: string;
  qtyPieces?: number;
  kilograms?: number;
  type?: UldType;
  hazmat?: boolean;
  unNumber?: string;
}

const HEADER_NAMES: Record<string, string[]> = {
  awb: ["awb", "awbnumber", "waybill", "guia", "guía", "mawb"],
  pieces: ["pieces", "piece", "pcs", "qty", "quantity", "piezas", "bultos"],
  kg: ["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms", "weight", "peso"],
  type: ["type", "uld", "uldtype", "tipo"],
  hazmat: ["hazmat", "dg", "dangerous"],
  un: ["un", "unnumber", "un#"],
};

function columnOf(header: string): string | null {
  const h = header.trim().toLowerCase().replace(/[\s_.]/g, "");
  for (const [column, names] of Object.entries(HEADER_NAMES)) {
    if (names.includes(h)) return column;
  }
  return null;
}

function isYes(value: string): boolean {
  return /^(y|yes|true|1|x|si|sí)$/i.test(value.trim());
}

function toType(value: string): UldType {
  const found = ULD_TYPES.find((t) => t.toLowerCase() === value.trim().toLowerCase());
  return found ?? "Loose";
}

function num(value: string): number | undefined {
  const parsed = parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

// Rows copied from Excel / Google Sheets (tab separated) or typed as CSV. With a
// header row ("AWB, Pieces, KG, Type, Hazmat, UN") columns can come in any order;
// without one the order is AWB, pieces, kg, type, hazmat, UN.
export function parseSheet(text: string): SheetRow[] {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  const delimiter = (l: string) => (l.includes("\t") ? "\t" : l.includes(";") ? ";" : ",");
  const split = (l: string) => l.split(delimiter(l)).map((c) => c.trim());

  let order = ["awb", "pieces", "kg", "type", "hazmat", "un"];
  const first = split(lines[0]);
  const mapped = first.map(columnOf);
  let body = lines;
  if (mapped.includes("awb")) {
    order = mapped.map((c) => c ?? "");
    body = lines.slice(1);
  }

  const out: SheetRow[] = [];
  for (const line of body) {
    const cells = split(line);
    const get = (column: string) => {
      const i = order.indexOf(column);
      return i >= 0 ? cells[i] ?? "" : "";
    };
    const awbNumber = get("awb");
    if (awbKeyOf(awbNumber).length < 6) continue;
    const row: SheetRow = { awbNumber };
    const pieces = num(get("pieces"));
    if (pieces !== undefined && pieces >= 1) row.qtyPieces = Math.round(pieces);
    const kg = num(get("kg"));
    if (kg !== undefined && kg > 0) row.kilograms = kg;
    if (get("type")) row.type = toType(get("type"));
    if (get("hazmat")) row.hazmat = isYes(get("hazmat"));
    if (row.hazmat && get("un")) row.unNumber = get("un");
    out.push(row);
  }
  return out;
}
