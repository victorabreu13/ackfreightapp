import assert from "node:assert/strict";
import test from "node:test";
import { hasRate } from "@/lib/guias/issue-rules";

test("a guía needs a rate above zero on one of its lines to be issued", () => {
  assert.equal(hasRate([{ rate: 1.7 }]), true);
  assert.equal(hasRate([{ rate: 0 }]), false);
  assert.equal(hasRate([{ rate: null }]), false);
  assert.equal(hasRate([{}]), false);
  assert.equal(hasRate([]), false);
  assert.equal(hasRate([{ rate: Number.NaN }]), false);
});
