import PDFDocument from "pdfkit";
import type { DgLabelItem, DgLabelPlan } from "@/lib/guias/dg/un";

/**
 * Draws dangerous goods labels. Sizes follow the general ICAO / IATA label rules: hazard labels are squares set at
 * 45 degrees with sides of at least 100 mm and a line 5 mm inside the edge, the Cargo Aircraft Only label is
 * 120 x 110 mm on orange, and orientation arrows are a pair of upward arrows. The symbols are drawn as simple
 * vector shapes. These sheets are for the team to prepare packages and must be checked against the current IATA
 * Dangerous Goods Regulations. The shipper stays responsible for the marking and labelling.
 */

type Doc = PDFKit.PDFDocument;

const MM = 72 / 25.4;

const RED = "#E1251B";
const ORANGE = "#F7941D";
const GREEN = "#00A651";
const BLUE = "#0072BC";
const YELLOW = "#FFD500";
const BLACK = "#000000";
const WHITE = "#FFFFFF";

/* ───────────── symbols ───────────── */

function flame(doc: Doc, x: number, y: number, h: number, color: string) {
  const w = h * 0.74;
  const ox = x - w / 2;
  const oy = y - h / 2;
  const p = (px: number, py: number): [number, number] => [ox + px * w, oy + py * h];
  doc.save().fillColor(color);
  doc.moveTo(...p(0.5, 0));
  doc.bezierCurveTo(...p(0.62, 0.22), ...p(0.9, 0.38), ...p(0.9, 0.64));
  doc.bezierCurveTo(...p(0.9, 0.86), ...p(0.72, 1), ...p(0.5, 1));
  doc.bezierCurveTo(...p(0.28, 1), ...p(0.1, 0.86), ...p(0.1, 0.64));
  doc.bezierCurveTo(...p(0.1, 0.48), ...p(0.2, 0.4), ...p(0.3, 0.28));
  doc.bezierCurveTo(...p(0.32, 0.42), ...p(0.38, 0.48), ...p(0.44, 0.5));
  doc.bezierCurveTo(...p(0.4, 0.34), ...p(0.42, 0.16), ...p(0.5, 0));
  doc.fill().restore();
}

function cylinder(doc: Doc, x: number, y: number, h: number, color: string) {
  doc.save().fillColor(color);
  doc.roundedRect(x - 0.24 * h, y - 0.2 * h, 0.48 * h, 0.7 * h, 0.2 * h).fill();
  doc.rect(x - 0.06 * h, y - 0.34 * h, 0.12 * h, 0.16 * h).fill();
  doc.rect(x - 0.16 * h, y - 0.42 * h, 0.32 * h, 0.09 * h).fill();
  doc.restore();
}

function skullAndCrossbones(doc: Doc, x: number, y: number, h: number, fg: string, bg: string) {
  doc.save().strokeColor(fg).fillColor(fg).lineCap("round").lineWidth(0.1 * h);
  doc.moveTo(x - 0.38 * h, y + 0.14 * h).lineTo(x + 0.38 * h, y + 0.46 * h).stroke();
  doc.moveTo(x + 0.38 * h, y + 0.14 * h).lineTo(x - 0.38 * h, y + 0.46 * h).stroke();
  for (const [kx, ky] of [[-0.4, 0.12], [0.4, 0.12], [-0.4, 0.48], [0.4, 0.48]] as const) {
    doc.circle(x + kx * h, y + ky * h, 0.06 * h).fill();
  }
  doc.circle(x, y - 0.12 * h, 0.27 * h).fill();
  doc.roundedRect(x - 0.15 * h, y + 0.05 * h, 0.3 * h, 0.18 * h, 0.04 * h).fill();
  doc.fillColor(bg);
  doc.circle(x - 0.1 * h, y - 0.14 * h, 0.07 * h).fill();
  doc.circle(x + 0.1 * h, y - 0.14 * h, 0.07 * h).fill();
  doc.moveTo(x, y - 0.08 * h).lineTo(x - 0.035 * h, y).lineTo(x + 0.035 * h, y).closePath().fill();
  doc.strokeColor(bg).lineWidth(0.02 * h);
  for (const tx of [-0.07, 0, 0.07]) doc.moveTo(x + tx * h, y + 0.1 * h).lineTo(x + tx * h, y + 0.22 * h).stroke();
  doc.restore();
}

function bomb(doc: Doc, x: number, y: number, h: number, color: string) {
  doc.save().fillColor(color).strokeColor(color).lineWidth(0.04 * h);
  doc.circle(x - 0.1 * h, y + 0.16 * h, 0.2 * h).fill();
  doc.moveTo(x + 0.04 * h, y + 0.04 * h).lineTo(x + 0.12 * h, y - 0.06 * h).stroke();
  const cx = x + 0.2 * h;
  const cy = y - 0.18 * h;
  const points = 8;
  doc.moveTo(cx + 0.3 * h, cy);
  for (let i = 1; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? 0.3 * h : 0.12 * h;
    const angle = (Math.PI * i) / points;
    doc.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
  }
  doc.closePath().fill().restore();
}

function corrosion(doc: Doc, x: number, y: number, h: number, fg: string, bg: string) {
  doc.save().fillColor(fg).strokeColor(fg);
  for (const [dx, angle] of [[-0.14, 28], [0.14, -28]] as const) {
    doc.save().translate(x + dx * h, y - 0.36 * h).rotate(angle);
    doc.roundedRect(-0.05 * h, 0, 0.1 * h, 0.3 * h, 0.05 * h).fill();
    doc.restore();
  }
  for (const [dx, dy] of [[-0.3, 0.02], [-0.3, 0.1], [0.3, 0.02], [0.3, 0.1]] as const) {
    doc.circle(x + dx * h, y + dy * h, 0.025 * h).fill();
  }
  doc.rect(x - 0.4 * h, y + 0.22 * h, 0.3 * h, 0.16 * h).fill();
  for (let i = 0; i < 4; i += 1) doc.rect(x - 0.4 * h + i * 0.08 * h, y + 0.12 * h, 0.06 * h, 0.12 * h).fill();
  doc.rect(x + 0.06 * h, y + 0.22 * h, 0.36 * h, 0.12 * h).fill();
  doc.fillColor(bg);
  doc.restore();
}

function biohazard(doc: Doc, x: number, y: number, h: number, color: string) {
  doc.save().strokeColor(color).fillColor(color).lineWidth(0.03 * h);
  doc.circle(x, y, 0.34 * h).stroke();
  doc.circle(x, y, 0.07 * h).fill();
  for (const angle of [-90, 30, 150]) {
    const rad = (angle * Math.PI) / 180;
    doc.circle(x + 0.15 * h * Math.cos(rad), y + 0.15 * h * Math.sin(rad), 0.17 * h).stroke();
  }
  doc.restore();
}

function oxidizer(doc: Doc, x: number, y: number, h: number, color: string) {
  doc.save().strokeColor(color).fillColor(color).lineWidth(0.05 * h);
  doc.circle(x, y + 0.22 * h, 0.17 * h).stroke();
  doc.restore();
  flame(doc, x, y - 0.12 * h, 0.5 * h, color);
}

function battery(doc: Doc, x: number, y: number, h: number, color: string, bg: string) {
  doc.save().strokeColor(color).fillColor(color).lineWidth(0.04 * h);
  doc.roundedRect(x - 0.3 * h, y - 0.18 * h, 0.4 * h, 0.5 * h, 0.04 * h).stroke();
  doc.rect(x - 0.18 * h, y - 0.26 * h, 0.16 * h, 0.08 * h).fill();
  doc.fillColor(color).rect(x - 0.26 * h, y + 0.08 * h, 0.32 * h, 0.2 * h).fill();
  doc.strokeColor(bg).lineWidth(0.04 * h);
  doc.moveTo(x - 0.1 * h, y - 0.08 * h).lineTo(x - 0.1 * h, y + 0.02 * h).stroke();
  doc.moveTo(x - 0.15 * h, y - 0.03 * h).lineTo(x - 0.05 * h, y - 0.03 * h).stroke();
  doc.restore();
  flame(doc, x + 0.26 * h, y + 0.02 * h, 0.5 * h, color);
}

function airplane(doc: Doc, x: number, y: number, h: number, color: string) {
  const w = h;
  doc.save().fillColor(color);
  doc.ellipse(x, y, 0.07 * w, 0.46 * h).fill();
  doc.moveTo(x - 0.05 * w, y - 0.04 * h).lineTo(x - 0.5 * w, y + 0.18 * h).lineTo(x - 0.5 * w, y + 0.26 * h).lineTo(x - 0.05 * w, y + 0.14 * h).closePath().fill();
  doc.moveTo(x + 0.05 * w, y - 0.04 * h).lineTo(x + 0.5 * w, y + 0.18 * h).lineTo(x + 0.5 * w, y + 0.26 * h).lineTo(x + 0.05 * w, y + 0.14 * h).closePath().fill();
  doc.moveTo(x - 0.04 * w, y + 0.34 * h).lineTo(x - 0.22 * w, y + 0.46 * h).lineTo(x - 0.22 * w, y + 0.5 * h).lineTo(x - 0.04 * w, y + 0.44 * h).closePath().fill();
  doc.moveTo(x + 0.04 * w, y + 0.34 * h).lineTo(x + 0.22 * w, y + 0.46 * h).lineTo(x + 0.22 * w, y + 0.5 * h).lineTo(x + 0.04 * w, y + 0.44 * h).closePath().fill();
  doc.restore();
}

/* ───────────── hazard diamonds ───────────── */

const SIDE = 100 * MM;
const HALF_DIAGONAL = (SIDE * Math.SQRT2) / 2;

function diamondPath(doc: Doc, cx: number, cy: number, d: number) {
  doc.moveTo(cx, cy - d).lineTo(cx + d, cy).lineTo(cx, cy + d).lineTo(cx - d, cy).closePath();
}

type Face = {
  /** Fill of the whole diamond, or the top and bottom halves. */
  top: string;
  bottom?: string;
  /** Vertical stripes across the diamond. */
  stripes?: { color: string; whole: boolean };
  ink: string;
  numberInk: string;
  number: string;
  symbol: "flame" | "cylinder" | "skull" | "bomb" | "corrosion" | "biohazard" | "oxidizer" | "battery" | "none";
  symbolInk: string;
  /** Text printed between the symbol and the class number, such as the division and compatibility group. */
  division?: string;
  caption?: string;
};

export function hazardFace(code: string): Face | null {
  const [division] = code.match(/^\d(?:\.\d)?/) ?? [""];
  switch (division) {
    case "1":
    case "1.1":
    case "1.2":
    case "1.3":
    case "1.4":
    case "1.5":
    case "1.6": {
      const withBomb = ["1.1", "1.2", "1.3"].includes(division);
      return { top: ORANGE, ink: BLACK, numberInk: BLACK, number: "1", symbol: withBomb ? "bomb" : "none", symbolInk: BLACK, division: division === "1" ? "" : code };
    }
    case "2.1":
      return { top: RED, ink: WHITE, numberInk: WHITE, number: "2", symbol: "flame", symbolInk: WHITE };
    case "2.2":
      return { top: GREEN, ink: WHITE, numberInk: WHITE, number: "2", symbol: "cylinder", symbolInk: WHITE };
    case "2.3":
      return { top: WHITE, ink: BLACK, numberInk: BLACK, number: "2", symbol: "skull", symbolInk: BLACK };
    case "3":
      return { top: RED, ink: WHITE, numberInk: WHITE, number: "3", symbol: "flame", symbolInk: WHITE };
    case "4.1":
      return { top: WHITE, stripes: { color: RED, whole: true }, ink: BLACK, numberInk: BLACK, number: "4", symbol: "flame", symbolInk: BLACK };
    case "4.2":
      return { top: WHITE, bottom: RED, ink: BLACK, numberInk: BLACK, number: "4", symbol: "flame", symbolInk: BLACK };
    case "4.3":
      return { top: BLUE, ink: WHITE, numberInk: WHITE, number: "4", symbol: "flame", symbolInk: WHITE };
    case "5.1":
      return { top: YELLOW, ink: BLACK, numberInk: BLACK, number: "5.1", symbol: "oxidizer", symbolInk: BLACK };
    case "5.2":
      return { top: RED, bottom: YELLOW, ink: BLACK, numberInk: BLACK, number: "5.2", symbol: "flame", symbolInk: BLACK };
    case "6.1":
      return { top: WHITE, ink: BLACK, numberInk: BLACK, number: "6", symbol: "skull", symbolInk: BLACK };
    case "6.2":
      return { top: WHITE, ink: BLACK, numberInk: BLACK, number: "6", symbol: "biohazard", symbolInk: BLACK, caption: "INFECTIOUS SUBSTANCE" };
    case "8":
      return { top: WHITE, bottom: BLACK, ink: BLACK, numberInk: WHITE, number: "8", symbol: "corrosion", symbolInk: BLACK, caption: "CORROSIVE" };
    case "9":
      return {
        top: WHITE,
        stripes: { color: BLACK, whole: false },
        ink: BLACK,
        numberInk: BLACK,
        number: "9",
        symbol: code === "9A" ? "battery" : "none",
        symbolInk: BLACK,
      };
    default:
      return null;
  }
}

function drawHazard(doc: Doc, face: Face, cx: number, cy: number) {
  const d = HALF_DIAGONAL;
  doc.save();
  diamondPath(doc, cx, cy, d);
  doc.clip();
  doc.rect(cx - d, cy - d, 2 * d, 2 * d).fill(face.top);
  if (face.bottom) doc.rect(cx - d, cy, 2 * d, d).fill(face.bottom);
  if (face.stripes) {
    const slot = (2 * d) / 13;
    const bottomEdge = face.stripes.whole ? cy + d : cy;
    for (let i = 0; i < 7; i += 1) doc.rect(cx - d + 2 * i * slot, cy - d, slot, bottomEdge - (cy - d)).fill(face.stripes.color);
  }
  doc.restore();
  // The outer edge and the line 5 mm inside it.
  doc.save().lineWidth(0.6).strokeColor(BLACK);
  diamondPath(doc, cx, cy, d);
  doc.stroke().restore();
  doc.save().lineWidth(1.6).strokeColor(face.stripes?.whole ? BLACK : face.ink === WHITE ? WHITE : BLACK);
  diamondPath(doc, cx, cy, d - 5 * MM * Math.SQRT2);
  doc.stroke().restore();

  // The corrosion symbol has to sit in the white top half, above the black half.
  const h = face.symbol === "corrosion" ? 0.52 * d : 0.46 * d;
  const sy = face.symbol === "corrosion" ? cy - 0.3 * d : cy - 0.14 * d;
  switch (face.symbol) {
    case "flame":
      flame(doc, cx, sy, h, face.symbolInk);
      break;
    case "cylinder":
      cylinder(doc, cx, sy, h, face.symbolInk);
      break;
    case "skull":
      skullAndCrossbones(doc, cx, sy, h, face.symbolInk, face.top);
      break;
    case "bomb":
      bomb(doc, cx, sy, h, face.symbolInk);
      break;
    case "corrosion":
      corrosion(doc, cx, sy, h, face.symbolInk, face.top);
      break;
    case "biohazard":
      biohazard(doc, cx, sy, h, face.symbolInk);
      break;
    case "oxidizer":
      oxidizer(doc, cx, sy, h, face.symbolInk);
      break;
    case "battery":
      battery(doc, cx, cy + 0.2 * d, h, face.symbolInk, WHITE);
      break;
    default:
      break;
  }
  doc.fillColor(face.ink).font("Helvetica-Bold");
  if (face.division) {
    doc.fontSize(34);
    doc.text(face.division, cx - 80, cy + 0.12 * d, { width: 160, align: "center", lineBreak: false });
  }
  if (face.caption) {
    doc.fillColor(face.ink === WHITE ? WHITE : BLACK).fontSize(11);
    doc.text(face.caption, cx - 80, cy + 0.36 * d, { width: 160, align: "center", lineBreak: false });
  }
  doc.fillColor(face.numberInk).fontSize(face.number.length > 1 ? 40 : 46);
  doc.text(face.number, cx - 60, cy + 0.5 * d, { width: 120, align: "center", lineBreak: false });
  if (face.number === "9") {
    doc.save().lineWidth(2).strokeColor(BLACK);
    doc.moveTo(cx - 17, cy + 0.5 * d + 50).lineTo(cx + 17, cy + 0.5 * d + 50).stroke().restore();
  }
}

/* ───────────── handling labels and marks ───────────── */

const CAO_W = 120 * MM;
const CAO_H = 110 * MM;

function drawCargoOnly(doc: Doc, x: number, y: number) {
  doc.save().rect(x, y, CAO_W, CAO_H).fill(ORANGE).restore();
  doc.save().lineWidth(0.6).strokeColor(BLACK).rect(x, y, CAO_W, CAO_H).stroke().restore();
  doc.save().lineWidth(2.5).strokeColor(BLACK).roundedRect(x + 8, y + 8, CAO_W - 16, CAO_H - 16, 8).stroke().restore();
  airplane(doc, x + CAO_W / 2, y + 72, 110, BLACK);
  doc.fillColor(BLACK).font("Helvetica-Bold").fontSize(30);
  doc.text("CARGO AIRCRAFT", x + 10, y + CAO_H - 92, { width: CAO_W - 20, align: "center", lineBreak: false });
  doc.fontSize(40).text("ONLY", x + 10, y + CAO_H - 58, { width: CAO_W - 20, align: "center", lineBreak: false });
}

const ARROW_W = 74 * MM;
const ARROW_H = 105 * MM;

function drawArrows(doc: Doc, x: number, y: number) {
  doc.save().lineWidth(1).strokeColor(BLACK).rect(x, y, ARROW_W, ARROW_H).stroke().restore();
  for (const cx of [x + ARROW_W * 0.28, x + ARROW_W * 0.72]) {
    const top = y + 24;
    const bottom = y + ARROW_H - 24;
    doc.save().fillColor(RED);
    doc.moveTo(cx, top).lineTo(cx + 24, top + 48).lineTo(cx + 9, top + 48).lineTo(cx + 9, bottom).lineTo(cx - 9, bottom).lineTo(cx - 9, top + 48).lineTo(cx - 24, top + 48).closePath().fill();
    doc.restore();
  }
}

function drawMagnetized(doc: Doc, x: number, y: number) {
  doc.save().lineWidth(1).strokeColor(BLACK).rect(x, y, CAO_W, CAO_H).stroke().restore();
  doc.save().lineWidth(16).strokeColor(BLUE).lineCap("butt");
  const cx = x + CAO_W / 2;
  doc.moveTo(cx - 40, y + 20).lineTo(cx - 40, y + 70).bezierCurveTo(cx - 40, y + 110, cx + 40, y + 110, cx + 40, y + 70).lineTo(cx + 40, y + 20).stroke().restore();
  doc.fillColor(BLUE).font("Helvetica-Bold").fontSize(24);
  doc.text("MAGNETIZED", x + 10, y + CAO_H - 64, { width: CAO_W - 20, align: "center", lineBreak: false });
  doc.text("MATERIAL", x + 10, y + CAO_H - 36, { width: CAO_W - 20, align: "center", lineBreak: false });
}

/* ───────────── names ───────────── */

const HAZARD_NAME: Record<string, string> = {
  "2.1": "Class 2.1 - Flammable gas",
  "2.2": "Class 2.2 - Non-flammable, non-toxic gas",
  "2.3": "Class 2.3 - Toxic gas",
  "3": "Class 3 - Flammable liquid",
  "4.1": "Class 4.1 - Flammable solid",
  "4.2": "Class 4.2 - Spontaneously combustible",
  "4.3": "Class 4.3 - Dangerous when wet",
  "5.1": "Class 5.1 - Oxidizer",
  "5.2": "Class 5.2 - Organic peroxide",
  "6.1": "Class 6.1 - Toxic",
  "6.2": "Class 6.2 - Infectious substance",
  "7": "Class 7 - Radioactive",
  "8": "Class 8 - Corrosive",
  "9": "Class 9 - Miscellaneous dangerous goods",
  "9A": "Class 9A - Lithium battery",
  MAGNETIZED: "Magnetized material",
};

/** The name a label goes by on the checklist. */
export function hazardLabelName(code: string): string {
  if (HAZARD_NAME[code]) return HAZARD_NAME[code];
  if (/^1(\.\d)?/.test(code)) return `Class 1 - Explosive ${code === "1" ? "(subsidiary)" : code}`;
  return `Class ${code}`;
}

/* ───────────── the checklist of required labels ───────────── */

export type DgChecklistOptions = {
  /** Packages, so each label says how many are needed. */
  copies: number;
  /** Shown at the top, like the AWB number of the guía. */
  reference?: string;
};

type Entry = { name: string; detail: string; draw: ((doc: Doc, x: number, y: number, w: number, h: number) => void) | null };

function iconBox(width: number, height: number, draw: (doc: Doc) => void) {
  return (doc: Doc, x: number, y: number, w: number, h: number) => {
    const scale = Math.min(w / width, h / height);
    doc.save();
    doc.translate(x + (w - width * scale) / 2, y + (h - height * scale) / 2);
    doc.scale(scale);
    draw(doc);
    doc.restore();
  };
}

function entryFor(item: DgLabelItem, copies: number): Entry | null {
  const packages = `${copies} ${copies === 1 ? "package" : "packages"}`;
  if (item.kind === "hazard") {
    if (item.code === "MAGNETIZED") return { name: hazardLabelName(item.code), detail: `1 per package · ${packages}`, draw: iconBox(CAO_W, CAO_H, (doc) => drawMagnetized(doc, 0, 0)) };
    const face = hazardFace(item.code);
    const box = 2 * HALF_DIAGONAL;
    return {
      name: hazardLabelName(item.code),
      detail: `1 per package · ${packages}`,
      draw: face ? iconBox(box, box, (doc) => drawHazard(doc, face, box / 2, box / 2)) : null,
    };
  }
  if (item.kind === "cao") return { name: "Cargo Aircraft Only", detail: `1 per package · ${packages}`, draw: iconBox(CAO_W, CAO_H, (doc) => drawCargoOnly(doc, 0, 0)) };
  if (item.kind === "arrows") return { name: "Orientation arrows", detail: `2 per package (opposite sides) · ${packages}`, draw: iconBox(ARROW_W, ARROW_H, (doc) => drawArrows(doc, 0, 0)) };
  return { name: `Package marking UN${item.un}`, detail: `UN number and proper shipping name on each package · ${packages}`, draw: null };
}

function checkbox(doc: Doc, x: number, y: number) {
  doc.save().lineWidth(1.2).strokeColor(BLACK).rect(x, y, 13, 13).stroke().restore();
}

/* Both documents print on a 4 x 6 in thermal label, landscape: 432 x 288 pt. */
const LABEL_W = 432;
const LABEL_H = 288;
const MARGIN = 12;

/** The symbols are drawn at their full size and then scaled, so text sits far below the small page before scaling; a deep bottom margin stops pdfkit from turning that into new pages. */
const NO_BREAK = { top: 0, left: 0, right: 0, bottom: -4000 };

const COLUMNS = 3;
const CELL_W = (LABEL_W - 2 * MARGIN) / COLUMNS;
const CELLS_TOP = 58;
const CELLS_BOTTOM = 244;

function newLabel() {
  const doc = new PDFDocument({ size: [LABEL_W, LABEL_H], margins: NO_BREAK });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  return { doc, done };
}

/**
 * The labels each UN number needs, on 4 x 6 in landscape pages: the drawing, its name and a box to check once it is
 * on the package. Three labels fit on a page, so a UN with more continues on the next one. Nothing here is printed
 * on the package itself.
 */
export function renderDgChecklist(plan: DgLabelPlan, options: DgChecklistOptions): Promise<Buffer> {
  const { doc, done } = newLabel();
  try {
    const copies = Math.max(1, options.copies);
    doc.info.Title = `DG LABEL CHECKLIST ${plan.units.map((unit) => `UN${unit.un}`).join(" ")}`;
    let first = true;
    const page = (title: string, facts: string, notes: string[]) => {
      if (!first) doc.addPage({ size: [LABEL_W, LABEL_H], margins: NO_BREAK });
      first = false;
      doc.fillColor("#6b7280").font("Helvetica").fontSize(7);
      doc.text(`DANGEROUS GOODS LABEL CHECKLIST  ·  ${options.reference ? `${options.reference}  ·  ` : ""}Packages: ${copies}`, MARGIN, 10, { lineBreak: false });
      doc.save().rect(MARGIN, 21, LABEL_W - 2 * MARGIN, 18).fill("#111827").restore();
      doc.fillColor(WHITE).font("Helvetica-Bold").fontSize(9.5);
      doc.text(title, MARGIN + 6, 26, { width: LABEL_W - 2 * MARGIN - 12, height: 11, ellipsis: true, lineBreak: false });
      if (facts) doc.fillColor("#374151").font("Helvetica").fontSize(8).text(facts, MARGIN, 44, { lineBreak: false });
      if (notes.length) {
        doc.fillColor("#6b7280").font("Helvetica-Oblique").fontSize(6.5);
        doc.text(notes.join("  ·  "), MARGIN, CELLS_BOTTOM + 4, { width: LABEL_W - 2 * MARGIN, height: 22, ellipsis: true });
      }
      doc.fillColor("#6b7280").font("Helvetica").fontSize(5.5);
      doc.text("Prepared in ACK Guías from the 49 CFR 172.101 table and the general IATA/ICAO label rules.", MARGIN, LABEL_H - 20, { lineBreak: false });
      doc.text("Confirm every label against the current IATA DGR. The shipper is responsible for classification, marking and labelling.", MARGIN, LABEL_H - 12, { lineBreak: false });
    };
    if (plan.units.length === 0) {
      page("No UN numbers were entered", "", []);
    }
    for (const unit of plan.units) {
      const items = plan.items.filter((item) => item.un === unit.un && item.copy === 1);
      const entries = items.map((item) => entryFor(item, copies)).filter((entry): entry is Entry => entry !== null);
      const title = unit.found ? `UN${unit.un}  ·  ${unit.name}` : `UN${unit.un}  ·  not in the table`;
      const facts = unit.found ? [`Class ${unit.cls}`, unit.pg ? `PG ${unit.pg}` : "", unit.cargoOnly ? "Cargo aircraft only" : "", unit.forbidden ? "FORBIDDEN on aircraft in the table" : ""].filter(Boolean).join("  ·  ") : "";
      if (entries.length === 0) {
        page(title, facts, unit.notes);
        doc.fillColor(BLACK).font("Helvetica").fontSize(10).text("No label to apply for this UN number.", MARGIN, CELLS_TOP + 10, { lineBreak: false });
        continue;
      }
      for (let start = 0; start < entries.length; start += COLUMNS) {
        page(start === 0 ? title : `${title}  (continued)`, facts, start === 0 ? unit.notes : []);
        entries.slice(start, start + COLUMNS).forEach((entry, index) => {
          const x = MARGIN + index * CELL_W;
          checkbox(doc, x, CELLS_TOP);
          doc.fillColor(BLACK).font("Helvetica-Bold").fontSize(8.5).text(entry.name, x + 19, CELLS_TOP, { width: CELL_W - 22, height: 22 });
          doc.fillColor("#6b7280").font("Helvetica").fontSize(6.5).text(entry.detail, x + 19, CELLS_TOP + 23, { width: CELL_W - 22, height: 16 });
          if (entry.draw) entry.draw(doc, x + 6, CELLS_TOP + 42, CELL_W - 12, CELLS_BOTTOM - CELLS_TOP - 44);
        });
      }
    }
  } catch (error) {
    return Promise.reject(error);
  }
  doc.end();
  return done;
}

/* ───────────── shipper and consignee as the DGD shows them ───────────── */

export type DgParty = { name: string; address: string };

/** Each party gets a box as wide as the label. The DGD fields are 241 x 52 pt, so the text is set at a size that reads the same in proportion. */
const FIELD_W = LABEL_W - 2 * MARGIN;
const FIELD_H = 118;

function fitParty(doc: Doc, party: DgParty): { lines: Array<{ text: string; bold: boolean }>; size: number } {
  const rows = [{ text: party.name, bold: true }, ...party.address.split(/\r?\n/).map((text) => ({ text, bold: false }))].filter((row) => row.text.trim());
  let lines: Array<{ text: string; bold: boolean }> = [];
  for (let size = 14; size >= 5; size -= 0.5) {
    lines = [];
    for (const row of rows) {
      doc.font(row.bold ? "Helvetica-Bold" : "Helvetica").fontSize(size);
      let current = "";
      for (const word of row.text.trim().split(/\s+/)) {
        const next = current ? `${current} ${word}` : word;
        if (current && doc.widthOfString(next) > FIELD_W - 12) {
          lines.push({ text: current, bold: row.bold });
          current = word;
        } else current = next;
      }
      if (current) lines.push({ text: current, bold: row.bold });
    }
    if (lines.length * size * 1.18 <= FIELD_H - 10 || size <= 5) return { lines, size };
  }
  return { lines, size: 5 };
}

/**
 * The Shipper and the Consignee as the DGD shows them: the name and the full address and nothing else, each in its
 * own box. One 4 x 6 in landscape label.
 */
export function renderDgParties(shipper: DgParty, consignee: DgParty): Promise<Buffer> {
  const { doc, done } = newLabel();
  try {
    doc.info.Title = "DGD SHIPPER AND CONSIGNEE";
    let y = MARGIN;
    for (const [caption, party] of [["Shipper", shipper], ["Consignee", consignee]] as const) {
      doc.fillColor("#374151").font("Helvetica-Bold").fontSize(7.5).text(caption.toUpperCase(), MARGIN, y, { lineBreak: false });
      y += 10;
      doc.save().lineWidth(1).strokeColor(BLACK).rect(MARGIN, y, FIELD_W, FIELD_H).stroke().restore();
      const fit = fitParty(doc, party);
      doc.fillColor(BLACK);
      fit.lines.forEach((line, index) => {
        doc.font(line.bold ? "Helvetica-Bold" : "Helvetica").fontSize(fit.size).text(line.text, MARGIN + 6, y + 5 + index * fit.size * 1.18, { lineBreak: false });
      });
      y += FIELD_H + 8;
    }
  } catch (error) {
    return Promise.reject(error);
  }
  doc.end();
  return done;
}
