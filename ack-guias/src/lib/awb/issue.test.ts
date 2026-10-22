import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canManageGuias, type SessionUser } from "@/lib/access";
import { CLAIM_ATTEMPTS, pendingReview, unattachedReleaseWhere } from "./issue";

test("stock release only matches a row that is not attached", () => {
  assert.deepEqual(unattachedReleaseWhere("stock-1"), { id: "stock-1", documentId: null });
  assert.equal(CLAIM_ATTEMPTS > 4, true);
});

test("a review list is a warning and does not block issuing", () => {
  assert.equal(pendingReview(null), false);
  assert.equal(pendingReview("[]"), false);
  assert.equal(pendingReview('["client"]'), true);
  const source = readFileSync(new URL("./issue.ts", import.meta.url), "utf8");
  const body = source.slice(source.indexOf("export async function issueWaybillAtomic"));
  assert.equal(body.includes("pendingReview"), false);
  assert.equal(body.includes("needs_review"), false);
});

test("only admin and team can create or issue a guía", () => {
  const base = { id: "u", clientId: null, clientName: null };
  for (const role of ["ADMIN", "TEAM"] as const) {
    assert.equal(canManageGuias({ ...base, email: "a@ackfreight.com", role } satisfies SessionUser), true);
  }
  assert.equal(canManageGuias({ ...base, email: "a@ackfreight.com", role: "ACCOUNTING" } satisfies SessionUser), false);
});
