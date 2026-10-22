import assert from "node:assert/strict";
import test from "node:test";
import { devLoginAllowed, roleOnGoogleSignIn } from "@/lib/auth-role";
import { normalizeAckEmail, parseUserRole, userRemoveError, userRoleChangeError } from "@/lib/users";

const admins = new Set(["victor.abreu@ackfreight.com", "andres.alvarado@ackfreight.com"]);

test("user emails stay on ackfreight.com and roles are the four app roles", () => {
  assert.equal(normalizeAckEmail(" Xiomara.Viloria@ackfreight.com "), "xiomara.viloria@ackfreight.com");
  assert.equal(normalizeAckEmail("person@gmail.com"), null);
  assert.equal(normalizeAckEmail("ops@mail.ackfreight.com"), null);
  assert.equal(parseUserRole("ACCOUNTING"), "ACCOUNTING");
  assert.equal(parseUserRole("TEAM"), null);
  assert.equal(parseUserRole("SALES"), null);
});

test("the last admin and ADMIN_EMAILS accounts cannot be demoted or removed", () => {
  assert.equal(
    userRoleChangeError({ email: "ops@ackfreight.com", from: "OPERATIONS", to: "VIEWER", activeAdminCount: 2, adminEmails: admins }),
    null,
  );
  assert.match(
    userRoleChangeError({ email: "victor.abreu@ackfreight.com", from: "ADMIN", to: "VIEWER", activeAdminCount: 2, adminEmails: admins }) ?? "",
    /ADMIN_EMAILS/,
  );
  assert.match(
    userRoleChangeError({ email: "lead@ackfreight.com", from: "ADMIN", to: "OPERATIONS", activeAdminCount: 1, adminEmails: admins }) ?? "",
    /al menos un Admin/,
  );
  assert.match(
    userRemoveError({
      email: "andres.alvarado@ackfreight.com",
      role: "ADMIN",
      activeAdminCount: 2,
      adminEmails: admins,
      actorId: "a",
      targetId: "b",
    }) ?? "",
    /ADMIN_EMAILS/,
  );
  assert.match(
    userRemoveError({
      email: "other@ackfreight.com",
      role: "OPERATIONS",
      activeAdminCount: 2,
      adminEmails: admins,
      actorId: "a",
      targetId: "a",
    }) ?? "",
    /propia/,
  );
  assert.equal(
    userRemoveError({
      email: "other@ackfreight.com",
      role: "VIEWER",
      activeAdminCount: 2,
      adminEmails: admins,
      actorId: "a",
      targetId: "b",
    }),
    null,
  );
});

test("development login stays off in production unless ENABLE_DEV_LOGIN is set", () => {
  assert.equal(devLoginAllowed({ NODE_ENV: "production" }), false);
  assert.equal(devLoginAllowed({ NODE_ENV: "production", ENABLE_DEV_LOGIN: "true" }), true);
  assert.equal(devLoginAllowed({ NODE_ENV: "development" }), true);
  assert.equal(roleOnGoogleSignIn(null, "xiomara.viloria@ackfreight.com", admins), null);
  assert.equal(roleOnGoogleSignIn("ACCOUNTING", "xiomara.viloria@ackfreight.com", admins), "ACCOUNTING");
});
