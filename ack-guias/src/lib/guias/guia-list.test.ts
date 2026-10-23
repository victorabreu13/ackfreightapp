import assert from "node:assert/strict";
import test from "node:test";
import { guiaOnList } from "@/lib/guias/guia-list";

const now = new Date("2026-10-23T15:00:00.000Z");

test("drafts always stay on the Guías screen", () => {
  assert.equal(guiaOnList({ status: "draft", flightDate: "Oct/01/2026" }, now), true);
  assert.equal(guiaOnList({ status: "draft", flightDate: null }, now), true);
});

test("an issued guía stays through the day of its flight and leaves the day after", () => {
  assert.equal(guiaOnList({ status: "issued", flightDate: "Oct/24/2026" }, now), true);
  assert.equal(guiaOnList({ status: "issued", flightDate: "2026-10-23" }, now), true);
  assert.equal(guiaOnList({ status: "issued", flightDate: "Oct/22/2026" }, now), false);
  assert.equal(guiaOnList({ status: "issued", flightDate: "2026-10-01" }, now), false);
});

test("an issued guía with no readable flight date stays", () => {
  assert.equal(guiaOnList({ status: "issued", flightDate: "" }, now), true);
  assert.equal(guiaOnList({ status: "issued", flightDate: "soon" }, now), true);
});

test("the day is New York's, not UTC's", () => {
  // 02:30 UTC on Oct 24 is still Oct 23 in New York.
  assert.equal(guiaOnList({ status: "issued", flightDate: "Oct/23/2026" }, new Date("2026-10-24T02:30:00.000Z")), true);
  assert.equal(guiaOnList({ status: "issued", flightDate: "Oct/23/2026" }, new Date("2026-10-24T05:00:00.000Z")), false);
});
