import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchesTokens, searchKey } from "./search";

describe("search matching", () => {
  it("ignores case, spaces, dashes and dots", () => {
    assert.equal(searchKey("045-5406 6773"), "04554066773");
    assert.equal(matchesTokens(["045 54066773"], "045-54066773"), true);
    assert.equal(matchesTokens(["04554066773"], "045-54066773"), true);
    assert.equal(matchesTokens(["045-54066773"], "54066"), true);
    assert.equal(matchesTokens(["045-54066773"], "999-1111"), false);
  });

  it("needs every word, each in some field", () => {
    const fields = ["Ivi Logistics", "Atlas", "IVI Warehouse", "045-54066773"];
    assert.equal(matchesTokens(fields, "ivi atlas"), true);
    assert.equal(matchesTokens(fields, "ivi kope"), false);
    assert.equal(matchesTokens(fields, ""), true);
  });

  it("does not match across the end of one field and the start of the next", () => {
    assert.equal(matchesTokens(["abc", "def"], "cd"), false);
    assert.equal(matchesTokens(["abc", "def"], "ab"), true);
  });

  it("copes with empty fields", () => {
    assert.equal(matchesTokens([undefined, null, "Kope"], "kope"), true);
  });
});
