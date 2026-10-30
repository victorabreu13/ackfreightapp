import PDFDocument from "pdfkit";

/** A free-text label for a 4 x 6 in thermal printer, portrait or landscape. */
export type CustomLabelSpec = {
  text: string;
  orientation: "portrait" | "landscape";
  family: "Helvetica" | "Times" | "Courier";
  /** Points. 0 lets the text fill the label. */
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  uppercase: boolean;
  align: "left" | "center" | "right";
  valign: "top" | "middle" | "bottom";
  /** Line height as a multiple of the font size. */
  spacing: number;
  border: "none" | "thin" | "thick";
  copies: number;
};

export const LABEL_SHORT = 4 * 72;
export const LABEL_LONG = 6 * 72;
export const MIN_SIZE = 6;
export const MAX_SIZE = 220;
const AUTO_MIN_UNWRAPPED = 14;
export const MAX_COPIES = 100;
export const MAX_LINES = 40;
export const MAX_TEXT = 2000;

export const DEFAULT_SPEC: CustomLabelSpec = {
  text: "",
  orientation: "landscape",
  family: "Helvetica",
  size: 0,
  bold: true,
  italic: false,
  underline: false,
  uppercase: false,
  align: "center",
  valign: "middle",
  spacing: 1.15,
  border: "none",
  copies: 1,
};

function pick<T extends string>(value: string | null | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.find((item) => item === value) ?? fallback;
}

function bounded(value: string | null | undefined, fallback: number, min: number, max: number): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/** Reads and bounds the form fields. Anything missing or wrong falls back to the default. */
export function parseCustomLabel(params: { get(name: string): string | null }): CustomLabelSpec {
  const flag = (name: string, fallback: boolean) => {
    const value = params.get(name);
    return value == null ? fallback : value === "1";
  };
  // An unchecked box is not sent, so `form=1` marks a submitted form and the boxes then mean what they say.
  const submitted = params.get("form") === "1";
  const size = bounded(params.get("size"), DEFAULT_SPEC.size, 0, MAX_SIZE);
  return {
    text: (params.get("text") ?? DEFAULT_SPEC.text).replace(/\r\n?/g, "\n").slice(0, MAX_TEXT),
    orientation: pick(params.get("orientation"), ["portrait", "landscape"] as const, DEFAULT_SPEC.orientation),
    family: pick(params.get("family"), ["Helvetica", "Times", "Courier"] as const, DEFAULT_SPEC.family),
    size: size > 0 && size < MIN_SIZE ? MIN_SIZE : size,
    bold: submitted ? flag("bold", false) : DEFAULT_SPEC.bold,
    italic: submitted ? flag("italic", false) : DEFAULT_SPEC.italic,
    underline: submitted ? flag("underline", false) : DEFAULT_SPEC.underline,
    uppercase: submitted ? flag("uppercase", false) : DEFAULT_SPEC.uppercase,
    align: pick(params.get("align"), ["left", "center", "right"] as const, DEFAULT_SPEC.align),
    valign: pick(params.get("valign"), ["top", "middle", "bottom"] as const, DEFAULT_SPEC.valign),
    spacing: bounded(params.get("spacing"), DEFAULT_SPEC.spacing, 1, 2),
    border: pick(params.get("border"), ["none", "thin", "thick"] as const, DEFAULT_SPEC.border),
    copies: Math.round(bounded(params.get("copies"), DEFAULT_SPEC.copies, 1, MAX_COPIES)),
  };
}

/** The query string that gives this label back through parseCustomLabel. */
export function customLabelQuery(spec: CustomLabelSpec): string {
  const query = new URLSearchParams({
    form: "1",
    text: spec.text,
    orientation: spec.orientation,
    family: spec.family,
    size: String(spec.size),
    align: spec.align,
    valign: spec.valign,
    spacing: String(spec.spacing),
    border: spec.border,
    copies: String(spec.copies),
  });
  if (spec.bold) query.set("bold", "1");
  if (spec.italic) query.set("italic", "1");
  if (spec.underline) query.set("underline", "1");
  if (spec.uppercase) query.set("uppercase", "1");
  return query.toString();
}

export function labelDimensions(orientation: CustomLabelSpec["orientation"]): { width: number; height: number } {
  return orientation === "portrait" ? { width: LABEL_SHORT, height: LABEL_LONG } : { width: LABEL_LONG, height: LABEL_SHORT };
}

/** The standard PDF font for a family and style. */
export function fontName(spec: Pick<CustomLabelSpec, "family" | "bold" | "italic">): string {
  const { family, bold, italic } = spec;
  if (family === "Times") return bold && italic ? "Times-BoldItalic" : bold ? "Times-Bold" : italic ? "Times-Italic" : "Times-Roman";
  const slant = "Oblique";
  if (bold && italic) return `${family}-Bold${slant}`;
  if (bold) return `${family}-Bold`;
  if (italic) return `${family}-${slant}`;
  return family;
}

export type CustomLabelLayout = {
  rows: string[];
  size: number;
  /** The size asked for did not fit, so the text was reduced. */
  reduced: boolean;
  lineHeight: number;
  width: number;
  height: number;
  /** Space between the label edge and the text. */
  margin: number;
};

const BORDER_WIDTH = { none: 0, thin: 1, thick: 4 } as const;

function wrapRows(doc: PDFKit.PDFDocument, text: string, size: number, width: number): string[] {
  doc.fontSize(size);
  const rows: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      rows.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      // A word wider than the label is cut where it no longer fits.
      const pieces: string[] = [];
      let rest = word;
      while (doc.widthOfString(rest) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && doc.widthOfString(rest.slice(0, cut)) > width) cut -= 1;
        pieces.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      pieces.push(rest);
      for (const piece of pieces) {
        const next = current ? `${current} ${piece}` : piece;
        if (current && doc.widthOfString(next) > width) {
          rows.push(current);
          current = piece;
        } else current = next;
      }
    }
    if (current) rows.push(current);
  }
  return rows;
}

/** Wraps the text at the size asked for, or at the largest size that fits when the size is automatic. */
export function layoutCustomLabel(doc: PDFKit.PDFDocument, spec: CustomLabelSpec): CustomLabelLayout {
  const { width, height } = labelDimensions(spec.orientation);
  const margin = 14 + BORDER_WIDTH[spec.border];
  const text = (spec.uppercase ? spec.text.toUpperCase() : spec.text).replace(/\s+$/g, "");
  const availableWidth = width - 2 * margin;
  const availableHeight = height - 2 * margin;
  doc.font(fontName(spec));
  const attempt = (size: number) => {
    const rows = wrapRows(doc, text, size, availableWidth);
    const lineHeight = size * spec.spacing;
    return { rows, lineHeight, fits: rows.length <= MAX_LINES && rows.length * lineHeight <= availableHeight + 0.01 };
  };
  // Automatic size keeps each line as typed on one line when that still gives readable letters, and only wraps below that.
  if (spec.size === 0) {
    const typed = text.split("\n");
    for (let size = MAX_SIZE; size >= AUTO_MIN_UNWRAPPED; size -= 1) {
      doc.fontSize(size);
      const lineHeight = size * spec.spacing;
      if (typed.length <= MAX_LINES && typed.length * lineHeight <= availableHeight + 0.01 && typed.every((row) => doc.widthOfString(row) <= availableWidth)) {
        return { rows: typed, size, reduced: false, lineHeight, width, height, margin };
      }
    }
  }
  const start = spec.size > 0 ? spec.size : MAX_SIZE;
  let size = start;
  let result = attempt(size);
  while (!result.fits && size > MIN_SIZE) {
    size = Math.max(MIN_SIZE, Math.round((size - 0.5) * 10) / 10);
    result = attempt(size);
  }
  return { rows: result.rows, size, reduced: spec.size > 0 && size < spec.size, lineHeight: result.lineHeight, width, height, margin };
}

function drawLabel(doc: PDFKit.PDFDocument, spec: CustomLabelSpec, layout: CustomLabelLayout) {
  const { width, height, margin, size, lineHeight, rows } = layout;
  const border = BORDER_WIDTH[spec.border];
  if (border > 0) {
    doc.save().lineWidth(border).strokeColor("#000000").rect(border / 2 + 4, border / 2 + 4, width - border - 8, height - border - 8).stroke().restore();
  }
  doc.font(fontName(spec)).fontSize(size).fillColor("#000000");
  const block = rows.length * lineHeight;
  const free = height - 2 * margin - block;
  const top = margin + (spec.valign === "top" ? 0 : spec.valign === "bottom" ? free : free / 2);
  rows.forEach((row, index) => {
    if (!row) return;
    const lineTop = top + index * lineHeight + (lineHeight - size) / 2;
    doc.text(row, margin, lineTop, { width: width - 2 * margin, align: spec.align, lineBreak: false });
    if (spec.underline) {
      const rowWidth = doc.widthOfString(row);
      const x = spec.align === "left" ? margin : spec.align === "right" ? width - margin - rowWidth : (width - rowWidth) / 2;
      const y = lineTop + size * 0.93;
      doc.save().lineWidth(Math.max(0.5, size / 16)).strokeColor("#000000").moveTo(x, y).lineTo(x + rowWidth, y).stroke().restore();
    }
  });
}

/** One 4 x 6 in page per copy. */
export function renderCustomLabel(spec: CustomLabelSpec): Promise<Buffer> {
  const { width, height } = labelDimensions(spec.orientation);
  const doc = new PDFDocument({ size: [width, height], margins: { top: 0, left: 0, right: 0, bottom: -4000 } });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  try {
    doc.info.Title = "CUSTOM LABEL";
    const layout = layoutCustomLabel(doc, spec);
    for (let copy = 0; copy < spec.copies; copy += 1) {
      if (copy > 0) doc.addPage({ size: [width, height], margins: { top: 0, left: 0, right: 0, bottom: -4000 } });
      drawLabel(doc, spec, layout);
    }
  } catch (error) {
    return Promise.reject(error);
  }
  doc.end();
  return done;
}
