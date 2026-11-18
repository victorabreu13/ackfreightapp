import assert from "node:assert/strict";
import test from "node:test";
import { aircraftFrom, driveKinds, LABEL_KINDS, OPTIONAL_KINDS, packKinds } from "@/lib/guias/guia-pack";

test("a Pax guía carries the TSA letter and a cargo one the unknown-shipper TSA", () => {
  assert.deepEqual(packKinds({ aircraft: "pax" }), ["awb", "tsa", "lithium", "delivery"]);
  assert.deepEqual(packKinds({ aircraft: "cargo" }), ["awb", "tsa-unknown", "lithium", "delivery"]);
});

test("a guía with no aircraft yet shows both TSA letters", () => {
  assert.deepEqual(packKinds({ aircraft: null }), ["awb", "tsa", "tsa-unknown", "lithium", "delivery"]);
  assert.deepEqual(packKinds({ aircraft: "boat" }), ["awb", "tsa", "tsa-unknown", "lithium", "delivery"]);
});

test("the CCSF and the CCSP only go with screened cargo", () => {
  assert.ok(!packKinds({ aircraft: "pax", screened: false }).includes("ccsp"));
  assert.deepEqual(packKinds({ aircraft: "pax", screened: true }), ["awb", "tsa", "lithium", "delivery", "ccsp", "ccsf-alternate"]);
  assert.deepEqual(packKinds({ aircraft: "cargo", screened: true }), ["awb", "tsa-unknown", "lithium", "delivery", "ccsp", "ccsf-alternate"]);
});

test("the checklist, the labels and the pickup order are not among the documents", () => {
  const kinds = packKinds({ aircraft: "pax", screened: true });
  for (const kind of [...OPTIONAL_KINDS, ...LABEL_KINDS, "pickup"]) assert.ok(!kinds.includes(kind as never), kind);
  // The pickup order is still saved to Drive when the guía is issued, the checklist and the labels are not.
  assert.deepEqual(driveKinds({ aircraft: "pax" }), ["awb", "tsa", "lithium", "delivery", "pickup"]);
});

test("the aircraft comes from the form in any case and anything else is empty", () => {
  assert.equal(aircraftFrom("Cargo"), "cargo");
  assert.equal(aircraftFrom(" PAX "), "pax");
  assert.equal(aircraftFrom(null), "");
  assert.equal(aircraftFrom("x"), "");
});
