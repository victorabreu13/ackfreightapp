import assert from "node:assert/strict";
import test from "node:test";
import PDFDocument from "pdfkit";
import { DEFAULT_SPEC, MAX_COPIES, customLabelQuery, fontName, layoutCustomLabel, parseCustomLabel, renderCustomLabel, type CustomLabelSpec } from "@/lib/guias/custom-label";

const parse = (query: string) => parseCustomLabel(new URLSearchParams(query));
const spec = (overrides: Partial<CustomLabelSpec>): CustomLabelSpec => ({ ...DEFAULT_SPEC, text: "ACK FREIGHT", ...overrides });
const boxes = (pdf: Buffer) => [...pdf.toString("latin1").matchAll(/\/MediaBox \[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g)].map((match) => [Number(match[1]), Number(match[2])]);

test("the form fields are read and bounded, and the defaults fill what is missing", () => {
  assert.deepEqual(parse(""), DEFAULT_SPEC);
  const read = parse("form=1&text=A%0D%0AB&orientation=portrait&family=Courier&size=500&align=right&valign=bottom&spacing=9&border=thick&copies=1000&bold=1&underline=1");
  assert.equal(read.text, "A\nB");
  assert.equal(read.orientation, "portrait");
  assert.equal(read.family, "Courier");
  assert.equal(read.size, 220);
  assert.equal(read.spacing, 2);
  assert.equal(read.copies, MAX_COPIES);
  assert.deepEqual([read.bold, read.italic, read.underline, read.uppercase], [true, false, true, false]);
  assert.equal(parse("size=3").size, 6);
  assert.equal(parse("size=abc").size, 0);
  assert.equal(parse("orientation=sideways").orientation, "landscape");
});

test("a submitted form with the boxes unchecked turns the styles off, and the query round-trips", () => {
  assert.equal(parse("form=1&text=X").bold, false);
  assert.equal(parse("text=X").bold, true);
  const original = spec({ text: "MIA-GUA\n045-12345678", orientation: "portrait", family: "Times", size: 40, bold: false, italic: true, uppercase: true, border: "thin", copies: 3 });
  assert.deepEqual(parse(customLabelQuery(original)), original);
});

test("each family and style maps to a standard PDF font", () => {
  assert.equal(fontName({ family: "Helvetica", bold: true, italic: false }), "Helvetica-Bold");
  assert.equal(fontName({ family: "Helvetica", bold: true, italic: true }), "Helvetica-BoldOblique");
  assert.equal(fontName({ family: "Times", bold: false, italic: false }), "Times-Roman");
  assert.equal(fontName({ family: "Times", bold: true, italic: true }), "Times-BoldItalic");
  assert.equal(fontName({ family: "Courier", bold: false, italic: true }), "Courier-Oblique");
});

test("automatic size fills the label and a fixed size that does not fit is reduced", () => {
  const doc = new PDFDocument({ size: "LETTER", margin: 0 });
  const auto = layoutCustomLabel(doc, spec({ size: 0, text: "HI" }));
  assert.ok(auto.size > 100 && !auto.reduced);
  const fixed = layoutCustomLabel(doc, spec({ size: 24, text: "HELLO" }));
  assert.equal(fixed.size, 24);
  assert.equal(fixed.reduced, false);
  const long = layoutCustomLabel(doc, spec({ size: 100, text: "ONE VERY LONG LINE OF TEXT THAT CANNOT POSSIBLY FIT AT THIS SIZE ON A FOUR BY SIX LABEL" }));
  assert.ok(long.reduced && long.size < 100);
  assert.ok(long.rows.length * long.lineHeight <= long.height - 2 * long.margin + 0.01);
});

test("the label is 4 x 6 in, one page per copy, in the orientation asked for", async () => {
  const landscape = boxes(await renderCustomLabel(spec({ copies: 2 })));
  assert.deepEqual(landscape, [[432, 288], [432, 288]]);
  const portrait = boxes(await renderCustomLabel(spec({ orientation: "portrait", underline: true, border: "thick", italic: true })));
  assert.deepEqual(portrait, [[288, 432]]);
});

test("automatic size keeps each typed line whole while the letters stay readable", () => {
  const doc = new PDFDocument({ size: "LETTER", margin: 0 });
  assert.deepEqual(layoutCustomLabel(doc, spec({ text: "ACK FREIGHT\nMIA-GUA" })).rows, ["ACK FREIGHT", "MIA-GUA"]);
  const wrapped = layoutCustomLabel(doc, spec({ text: Array.from({ length: 12 }, () => "WORD").join(" ") + " AND A MUCH LONGER TAIL OF WORDS TO FORCE A WRAP ON THE LABEL" }));
  assert.ok(wrapped.rows.length > 1);
});
