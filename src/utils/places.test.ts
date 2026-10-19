import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Place } from "../data/miaPlaces";
import { mergePlaces, placeKey, suggestPlaces } from "./places";

const places: Place[] = [
  { name: "Atlas Air", kind: "Cargo airline" },
  { name: "Avianca Cargo", kind: "Cargo airline" },
  { name: "Avianca", kind: "Passenger airline" },
  { name: "Air China Cargo", kind: "Cargo airline" },
  { name: "Tampa Cargo", kind: "Cargo airline" },
];

describe("place suggestions", () => {
  it("ranks names that start with the text first", () => {
    assert.deepEqual(suggestPlaces(places, "av").map((p) => p.name), ["Avianca", "Avianca Cargo"]);
  });

  it("matches the start of any word, then anywhere in the name", () => {
    assert.deepEqual(suggestPlaces(places, "cargo").map((p) => p.name), ["Air China Cargo", "Avianca Cargo", "Tampa Cargo"]);
    assert.deepEqual(suggestPlaces(places, "pa").map((p) => p.name), ["Tampa Cargo"]);
  });

  it("does not suggest what is already typed exactly, or anything for empty text", () => {
    assert.equal(suggestPlaces(places, "avianca").some((p) => p.name === "Avianca"), false);
    assert.deepEqual(suggestPlaces(places, "  "), []);
  });

  it("limits the list", () => {
    assert.equal(suggestPlaces(places, "a", 2).length, 2);
  });

  it("merges saved places without duplicates", () => {
    const merged = mergePlaces(places, ["AVIANCA", "Ivi Warehouse", "ivi  warehouse"]);
    assert.deepEqual(merged.slice(5).map((p) => p.name), ["Ivi Warehouse"]);
    assert.equal(placeKey("Air-China  cargo"), "airchinacargo");
  });
});
