import assert from "node:assert/strict";
import test from "node:test";
import { acctNameFor, matchAcctClient, type AcctCandidate } from "@/lib/guias/acct-match";

const list: AcctCandidate[] = [
  { id: "a1", name: "PACIFIKO", guiaClientId: null },
  { id: "a2", name: "JUSTINE", guiaClientId: "g9" },
  { id: "a3", name: "KAY AIR", guiaClientId: null },
];

test("a client of the AWBs goes with the accounting client already linked to it", () => {
  assert.equal(matchAcctClient(list, { id: "g9", name: "Something else entirely" })?.id, "a2");
});

test("an unlinked accounting client with the same name, or the first words of it, is the match", () => {
  assert.equal(matchAcctClient(list, { id: "g1", name: "PACIFIKO, LLC" })?.id, "a1");
  assert.equal(matchAcctClient(list, { id: "g2", name: "kay air" })?.id, "a3");
  assert.equal(matchAcctClient(list, { id: "g3", name: "Kay Air Cargo Inc" })?.id, "a3");
});

test("a linked accounting client is never taken by another client of the AWBs, and no match means a new one is made", () => {
  assert.equal(matchAcctClient(list, { id: "g4", name: "JUSTINE" }), null);
  assert.equal(matchAcctClient(list, { id: "g5", name: "NEW CLIENT LLC" }), null);
  assert.equal(matchAcctClient(list, { id: "g6", name: "  " }), null);
  // Two letters are not enough to be the first words of a name.
  assert.equal(matchAcctClient([{ id: "x", name: "KA", guiaClientId: null }], { id: "g7", name: "KA SHIPPING" }), null);
});

test("a new accounting client is named in capitals, like the others", () => {
  assert.equal(acctNameFor("  Pacifiko,  LLC "), "PACIFIKO, LLC");
});
