import assert from "node:assert/strict";
import test from "node:test";
import { PACKAGE_TYPES, packageTypeFrom } from "@/lib/guias/package-types";

test("the Package list is Pallet, Box, Pieces and Crates, and anything else is blank", () => {
  assert.deepEqual([...PACKAGE_TYPES], ["Pallet", "Box", "Pieces", "Crates"]);
  assert.equal(packageTypeFrom("crates"), "Crates");
  assert.equal(packageTypeFrom(" PALLET "), "Pallet");
  assert.equal(packageTypeFrom("Drum"), "");
  assert.equal(packageTypeFrom(null), "");
});
