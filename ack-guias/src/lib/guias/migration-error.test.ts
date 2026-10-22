import assert from "node:assert/strict";
import test from "node:test";
import { isPendingMigration, MIGRATION_PENDING_MESSAGE } from "./migration-error";

test("P2021 and P2022 are a pending migration, including a wrapped cause", () => {
  assert.equal(isPendingMigration({ code: "P2022", message: "column product does not exist" }), true);
  assert.equal(isPendingMigration({ code: "P2021", message: "table GuiaDriveFile does not exist" }), true);
  assert.equal(isPendingMigration(new Error("other")), false);
  assert.equal(isPendingMigration({ cause: { code: "P2022" } }), true);
  assert.equal(MIGRATION_PENDING_MESSAGE, "Database migration pending, run migrate");
});
