import assert from "node:assert/strict";
import test from "node:test";
import { checklistRows } from "@/lib/guias/checklist";
import { GUIA_FILE_KINDS, guiaFileName } from "@/lib/guias/files";

const base = { awb: "045-55219415", bup: false, dangerousGoods: false, unNumbers: "", goods: "GENERAL CARGO", hasTrucker: true };
const titles = (input: Parameters<typeof checklistRows>[0]) => checklistRows(input).map((row) => row.title);

test("the CCSP and the CCSF are always on the checklist, and the ULD Distribution only for a BUP, in the order the team collects the documents", () => {
  assert.deepEqual(titles(base), [
    "Air Waybill (12 pages)",
    "CCSP certification (ACK)",
    "CCSF certificate (Kope)",
    "TSA letter",
    "Delivery order (DO)",
    "Commercial invoice or manifest",
  ]);
  const bup = titles({ ...base, bup: true });
  assert.deepEqual(bup, [
    "Air Waybill (12 pages)",
    "CCSP certification (ACK)",
    "CCSF certificate (Kope)",
    "TSA letter",
    "ULD Distribution",
    "Delivery order (DO)",
    "Commercial invoice or manifest",
  ]);
  const notes = checklistRows({ ...base, bup: true }).filter((row) => /CCS/.test(row.title)).map((row) => row.note);
  assert.ok(notes.every((note) => note.startsWith("BUP.")));
});

test("lithium and dangerous goods add their rows between the AWB and the CCSP", () => {
  const dg = titles({ ...base, dangerousGoods: true, unNumbers: "UN1950" });
  assert.deepEqual(dg.slice(0, 3), ["Air Waybill (12 pages)", "Shipper's Declaration for Dangerous Goods (DGD)", "CCSP certification (ACK)"]);
  assert.ok(!dg.includes("Lithium battery letter"));
  const both = titles({ ...base, dangerousGoods: true, unNumbers: "UN3481" });
  assert.deepEqual(both.slice(0, 3), ["Air Waybill (12 pages)", "Lithium battery letter", "Shipper's Declaration for Dangerous Goods (DGD)"]);
  assert.ok(titles({ ...base, goods: "LITHIUM ION BATTERIES" }).includes("Lithium battery letter"));
});

test("labels, the client instructions and the AES ITN are not on the checklist", () => {
  const all = titles({ ...base, bup: true, dangerousGoods: true, unNumbers: "UN3481", lithiumPi: "967" });
  assert.ok(!all.some((title) => /label|instruction|AES|EEI|Pickup/i.test(title.replace("Lithium battery letter", ""))));
});

test("the checklist is one of the guía documents and has its own file name", () => {
  assert.ok(GUIA_FILE_KINDS.includes("checklist"));
  assert.equal(guiaFileName("checklist", "045-55219415"), "CHECKLIST 045-55219415.pdf");
  assert.equal(guiaFileName("checklist", ""), "CHECKLIST DRAFT.pdf");
});

test("Section II lithium adds the lithium row and never the DGD", () => {
  const rows = checklistRows({ ...base, lithiumPi: "967", goods: "LAPTOPS" });
  const letter = rows.find((row) => row.title === "Lithium battery letter");
  assert.ok(letter);
  assert.match(letter.note, /Section II of PI967/);
  assert.ok(!rows.some((row) => /DGD/.test(row.title)));
});
