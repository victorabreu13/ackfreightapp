import assert from "node:assert/strict";
import test from "node:test";
import { checklistRows } from "@/lib/guias/checklist";
import { GUIA_FILE_KINDS, guiaFileName } from "@/lib/guias/files";

const base = { awb: "045-55219415", bup: false, dangerousGoods: false, unNumbers: "", goods: "GENERAL CARGO", hasTrucker: true };
const titles = (input: Parameters<typeof checklistRows>[0]) => checklistRows(input).map((row) => row.title);

test("the CCSF and the CCSP are on the checklist only for a BUP", () => {
  assert.ok(!titles(base).some((title) => /CCSF|CCSP/.test(title)));
  const bup = titles({ ...base, bup: true });
  assert.ok(bup.some((title) => title.startsWith("CCSF certificate")));
  assert.ok(bup.some((title) => title.startsWith("CCSP certification")));
});

test("dangerous goods add the DGD and the DG labels, and lithium adds its letter", () => {
  assert.ok(!titles(base).some((title) => /DGD|DG hazard/.test(title)));
  const dg = titles({ ...base, dangerousGoods: true, unNumbers: "UN1950" });
  assert.ok(dg.some((title) => title.includes("Shipper's Declaration for Dangerous Goods")));
  assert.ok(dg.some((title) => title.startsWith("DG hazard labels")));
  assert.ok(!dg.includes("Lithium battery letter"));
  assert.ok(titles({ ...base, dangerousGoods: true, unNumbers: "UN3481" }).includes("Lithium battery letter"));
  assert.ok(titles({ ...base, goods: "LITHIUM ION BATTERIES" }).includes("Lithium battery letter"));
});

test("the checklist is one of the guía documents and has its own file name", () => {
  assert.ok(GUIA_FILE_KINDS.includes("checklist"));
  assert.equal(guiaFileName("checklist", "045-55219415"), "CHECKLIST 045-55219415.pdf");
  assert.equal(guiaFileName("checklist", ""), "CHECKLIST DRAFT.pdf");
});
