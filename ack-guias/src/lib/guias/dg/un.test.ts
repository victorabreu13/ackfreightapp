import assert from "node:assert/strict";
import test from "node:test";
import { hazardFace, renderDgLabels } from "@/lib/guias/dg/labels-pdf";
import { lookupUn, planDgLabels, planUn } from "@/lib/guias/dg/un";

test("the table has the UN numbers the forwarder ships most", () => {
  for (const un of ["1203", "1950", "3480", "3481", "1789", "1005", "2814", "1845"]) {
    assert.ok(lookupUn(un).length > 0, `UN${un}`);
  }
  assert.equal(lookupUn("9999").length, 0);
});

test("labels follow the class and the subsidiary hazards", () => {
  assert.deepEqual(planUn("1203").labels, ["3"]);
  assert.deepEqual(planUn("1950").labels, ["2.2", "8"]);
  assert.deepEqual(planUn("1005").labels, ["2.3", "8"]);
});

test("lithium batteries use the Class 9 lithium battery label and ion on its own is cargo only", () => {
  for (const un of ["3090", "3091", "3480", "3481"]) assert.deepEqual(planUn(un).labels, ["9A"], un);
  assert.equal(planUn("3480").cargoOnly, true);
  assert.equal(planUn("3481").cargoOnly, false);
});

test("air-only rules: dry ice needs the Class 9 label and magnetized material has its own label", () => {
  assert.deepEqual(planUn("1845").labels, ["9"]);
  assert.deepEqual(planUn("2807").labels, ["MAGNETIZED"]);
  assert.equal(planUn("2807").found, true);
  assert.equal(planUn("9999").found, false);
});

test("the plan adds Cargo Aircraft Only and arrows when asked or when the table says so", () => {
  const auto = planDgLabels({ un: "UN3480", copies: 2, cargoAircraftOnly: "auto", arrows: "auto", marks: false });
  assert.equal(auto.items.filter((item) => item.kind === "hazard").length, 2);
  assert.equal(auto.items.filter((item) => item.kind === "cao").length, 2);
  assert.equal(auto.items.filter((item) => item.kind === "arrows").length, 0);
  const none = planDgLabels({ un: "UN3481", copies: 1, cargoAircraftOnly: "auto", arrows: "auto", marks: false });
  assert.equal(none.items.some((item) => item.kind === "cao"), false);
  const forced = planDgLabels({ un: "UN3481", copies: 1, cargoAircraftOnly: "yes", arrows: "yes", marks: true });
  assert.deepEqual(forced.items.map((item) => item.kind), ["hazard", "cao", "arrows", "mark"]);
  const liquid = planDgLabels({ un: "UN1203", copies: 1, cargoAircraftOnly: "auto", arrows: "auto", marks: false });
  assert.ok(liquid.items.some((item) => item.kind === "arrows"));
  const unknown = planDgLabels({ un: "UN9999", copies: 1, cargoAircraftOnly: "auto", arrows: "auto", marks: false });
  assert.equal(unknown.items.length, 0);
  assert.equal(unknown.warnings.length, 1);
});

test("a hazard face exists for every class the table uses, except radioactive", () => {
  const codes = new Set<string>();
  for (const un of ["0335", "1203", "1950", "1005", "1325", "1361", "1428", "1479", "3101", "2814", "1789", "3481", "1845"]) {
    for (const code of planUn(un).labels) codes.add(code);
  }
  for (const code of codes) assert.ok(hazardFace(code), code);
  assert.equal(hazardFace("7"), null);
});

test("the label sheet is a PDF", async () => {
  const plan = planDgLabels({ un: "UN1203, UN3481", copies: 2, cargoAircraftOnly: "auto", arrows: "auto", marks: true });
  const pdf = await renderDgLabels(plan, { shipper: "SHIPPER", consignee: "CONSIGNEE" });
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.ok((pdf.toString("latin1").match(/\/Type \/Page\b(?!s)/g) ?? []).length >= 2);
});
