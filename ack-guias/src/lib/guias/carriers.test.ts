import assert from "node:assert/strict";
import test from "node:test";
import { carrierLabel } from "@/lib/guias/carriers";

test("a carrier in the guía list shows its prefix when it has one", () => {
  assert.equal(carrierLabel({ name: "LATAM AIRLINES CARGO (MIA)", prefix: "045" }), "LATAM AIRLINES CARGO (MIA)  ·  045");
  assert.equal(carrierLabel({ name: "ATLAS AIR", prefix: null }), "ATLAS AIR");
});
