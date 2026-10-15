import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isUldType, uldCountForLines, uldCountForTrip } from "./uld";

describe("ULD counting", () => {
  it("treats Loose and Skid as non-ULD", () => {
    assert.equal(isUldType("PMC"), true);
    assert.equal(isUldType("AKE"), true);
    assert.equal(isUldType("Loose"), false);
    assert.equal(isUldType("Skid"), false);
  });

  it("sums the piece counts of ULD lines only", () => {
    assert.equal(
      uldCountForLines([
        { type: "PMC", qtyPieces: 4 },
        { type: "Loose", qtyPieces: 11 },
        { type: "PAG", qtyPieces: 1 },
        { type: "Skid", qtyPieces: 2 },
      ]),
      5
    );
    assert.equal(uldCountForLines([]), 0);
  });

  it("uses the stored trip count, else counts non-loose units", () => {
    assert.equal(uldCountForTrip({ uldCount: 3, unitTypes: ["PMC"] }), 3);
    assert.equal(uldCountForTrip({ unitTypes: ["PMC", "Loose", "PAG"] }), 2);
    assert.equal(uldCountForTrip({ unitTypes: [] }), 0);
  });
});
