import assert from "node:assert/strict";
import test from "node:test";
import { hazardFace, hazardLabelName, renderDgChecklist, renderDgParties } from "@/lib/guias/dg/labels-pdf";
import { cleanDgAddress, dgParty } from "@/lib/guias/dg/party-text";
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

function pageBoxes(pdf: Buffer) {
  return [...pdf.toString("latin1").matchAll(/\/MediaBox \[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g)].map((match) => [Number(match[1]), Number(match[2])]);
}

test("the checklist is a 4 x 6 in landscape PDF with a page per three labels", async () => {
  const plan = planDgLabels({ un: "UN1950, UN3481", copies: 2, cargoAircraftOnly: "auto", arrows: "auto", marks: true });
  const pdf = await renderDgChecklist(plan, { copies: 2, reference: "AWB 123-45678901" });
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
  const boxes = pageBoxes(pdf);
  assert.ok(boxes.length >= 2);
  for (const [width, height] of boxes) assert.deepEqual([width, height], [432, 288]);
});

test("the shipper and consignee label is one 4 x 6 in landscape page", async () => {
  const pdf = await renderDgParties({ name: "ACME CORP", address: "100 MAIN ST\nMIAMI FL 33126 US" }, { name: "RECEIVER SA", address: "AVE 1\nGUATEMALA" });
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.deepEqual(pageBoxes(pdf), [[432, 288]]);
});

test("every required label has a name for the checklist", () => {
  assert.equal(hazardLabelName("3"), "Class 3 - Flammable liquid");
  assert.equal(hazardLabelName("9A"), "Class 9A - Lithium battery");
  assert.equal(hazardLabelName("2.2"), "Class 2.2 - Non-flammable, non-toxic gas");
});

test("the DGD parties keep the name and the address and drop the contact details", () => {
  assert.equal(cleanDgAddress("100 MAIN ST\nTel: 305-555-1234\nMIAMI FL 33126\nops@acme.com\n+1 305 555 1234\nAttn: John"), "100 MAIN ST\nMIAMI FL 33126");
  assert.deepEqual(dgParty("  ACME   CORP ", "1 A ST\nPhone 12345"), { name: "ACME CORP", address: "1 A ST" });
  assert.deepEqual(dgParty(null, undefined), { name: "", address: "" });
});

test("a contact at the end of an address line is cut and the address stays", () => {
  assert.equal(
    cleanDgAddress("8504 NW 70TH ST, MEDLEY,\nFL 33166, UNITED STATES. CONTACT: PABLO MORALES, EMAIL: PMORALES@PACIFIKO.COM"),
    "8504 NW 70TH ST, MEDLEY,\nFL 33166, UNITED STATES",
  );
  assert.equal(cleanDgAddress("CALLE 5, SUITE 12 PH 2, TEL: 305 555 1234"), "CALLE 5, SUITE 12 PH 2");
  assert.equal(cleanDgAddress("AV LAS ACACIAS PISO 3. Attn Maria Perez"), "AV LAS ACACIAS PISO 3");
  assert.equal(cleanDgAddress("RIF: J502525904\nCALLE REAL DE PARIATA\nVENEZUELA"), "RIF: J502525904\nCALLE REAL DE PARIATA\nVENEZUELA");
  assert.equal(cleanDgAddress("1 MAIN ST\nEmail: ops@acme.com"), "1 MAIN ST");
});
