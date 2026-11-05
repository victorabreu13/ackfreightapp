import assert from "node:assert/strict";
import test from "node:test";
import {
  clearFailedSignIns,
  decryptInviteToken,
  encryptInviteToken,
  hashInviteToken,
  hashPassword,
  inviteExpiry,
  inviteState,
  newInviteToken,
  normalizeCustomerEmail,
  passwordProblem,
  recordFailedSignIn,
  signInBlocked,
  verifyPassword,
} from "@/lib/guias/customer-auth";
import { mailSettings } from "@/lib/guias/mailer";

test("a password is stored as a salted scrypt hash and only the right one passes", async () => {
  const stored = await hashPassword("Correct horse 42");
  assert.match(stored, /^scrypt\$/);
  assert.ok(!stored.includes("Correct horse 42"));
  assert.equal(await verifyPassword("Correct horse 42", stored), true);
  assert.equal(await verifyPassword("correct horse 42", stored), false);
  assert.equal(await verifyPassword("anything", null), false);
  assert.equal(await verifyPassword("anything", "plain-text"), false);
  assert.notEqual(stored, await hashPassword("Correct horse 42"));
});

test("passwords need length, letters and numbers", () => {
  assert.ok(passwordProblem("short1"));
  assert.ok(passwordProblem("onlyletterslong"));
  assert.ok(passwordProblem("1234567890"));
  assert.equal(passwordProblem("Gwen2026shipping"), null);
});

test("invitation tokens are random, stored only as a hash, and can be shown again to staff", () => {
  const first = newInviteToken();
  const second = newInviteToken();
  assert.notEqual(first.token, second.token);
  assert.equal(first.tokenHash, hashInviteToken(first.token));
  assert.ok(first.token.length >= 40);
  const sealed = encryptInviteToken(first.token, "auth-secret");
  assert.ok(!sealed.includes(first.token));
  assert.equal(decryptInviteToken(sealed, "auth-secret"), first.token);
  assert.equal(decryptInviteToken(sealed, "another-secret"), null);
  assert.equal(decryptInviteToken("garbage", "auth-secret"), null);
  assert.equal(decryptInviteToken(null, "auth-secret"), null);
});

test("an invitation works once and expires after seven days", () => {
  const now = new Date("2026-10-22T12:00:00.000Z");
  const expiresAt = inviteExpiry(now);
  assert.equal(expiresAt.toISOString(), "2026-10-29T12:00:00.000Z");
  assert.equal(inviteState({ usedAt: null, expiresAt }, now), "ok");
  assert.equal(inviteState({ usedAt: now, expiresAt }, now), "used");
  assert.equal(inviteState({ usedAt: null, expiresAt }, new Date("2026-10-29T12:00:01.000Z")), "expired");
  assert.equal(inviteState(null, now), "missing");
});

test("emails are normalized and checked", () => {
  assert.equal(normalizeCustomerEmail("  Ana@Empresa.COM "), "ana@empresa.com");
  assert.equal(normalizeCustomerEmail("not-an-email"), null);
  assert.equal(normalizeCustomerEmail(""), null);
});

test("repeated failed sign-ins are blocked for a while and cleared by a good one", () => {
  const email = "guess@example.com";
  const start = 1_000_000;
  for (let i = 0; i < 8; i += 1) recordFailedSignIn(email, start + i);
  assert.equal(signInBlocked(email, start + 100), true);
  assert.equal(signInBlocked(email, start + 16 * 60 * 1000), false);
  for (let i = 0; i < 8; i += 1) recordFailedSignIn(email, start + i);
  clearFailedSignIns(email);
  assert.equal(signInBlocked(email, start + 100), false);
});

test("email settings need the mailbox and its password, and default to Google Workspace", () => {
  assert.equal(mailSettings({}), null);
  assert.equal(mailSettings({ SMTP_USER: "ops@ackfreight.com" }), null);
  const settings = mailSettings({ SMTP_USER: "ops@ackfreight.com", SMTP_PASSWORD: "app-password" });
  assert.equal(settings?.host, "smtp.gmail.com");
  assert.equal(settings?.port, 587);
  assert.equal(settings?.from, "ACK TEAM LLC <ops@ackfreight.com>");
  assert.equal(mailSettings({ SMTP_USER: "a@b.com", SMTP_PASSWORD: "x", MAIL_FROM: "ACK <info@ackfreight.com>" })?.from, "ACK <info@ackfreight.com>");
});
