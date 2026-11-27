import assert from "node:assert/strict";
import test from "node:test";
import { chargeBasisFrom, splitError, splitRows } from "@/lib/guias/acct-clients";

test("the rows of a split are read as typed and the empty ones are dropped", () => {
  assert.deepEqual(splitRows(["ACK", "Victor", "", ""], ["55", "35", "", ""]), { rows: [{ payee: "ACK", pct: 55 }, { payee: "Victor", pct: 35 }], error: null });
  assert.deepEqual(splitRows(["ACK", "Pamela"], ["55", "10%"].map((value) => value.replace("%", ""))).rows.length, 2);
  assert.match(splitRows(["Victor"], ["abc"]).error ?? "", /Victor is not a number above zero/);
  assert.match(splitRows(["Victor"], ["0"]).error ?? "", /above zero/);
  assert.match(splitRows([""], ["50"]).error ?? "", /no person/);
});

test("a split has to add up to 100 with each person once", () => {
  assert.equal(splitError([{ payee: "ACK", pct: 55 }, { payee: "Victor", pct: 35 }, { payee: "Pamela", pct: 10 }]), null);
  assert.equal(splitError([{ payee: "ACK", pct: 65 }, { payee: "Victor", pct: 35 }]), null);
  assert.match(splitError([{ payee: "ACK", pct: 60 }, { payee: "Victor", pct: 35 }]) ?? "", /adds up to 95%/);
  assert.match(splitError([{ payee: "ACK", pct: 50 }, { payee: "ack", pct: 50 }]) ?? "", /twice/);
  assert.match(splitError([]) ?? "", /at least one person/);
  assert.equal(splitError([{ payee: "A", pct: 33.33 }, { payee: "B", pct: 33.33 }, { payee: "C", pct: 33.34 }]), null);
});

test("the weight of the charges is gross or chargeable, and anything else is chargeable", () => {
  assert.equal(chargeBasisFrom("gross"), "gross");
  assert.equal(chargeBasisFrom("chw"), "chw");
  assert.equal(chargeBasisFrom("whatever"), "chw");
  assert.equal(chargeBasisFrom(null), "chw");
});
