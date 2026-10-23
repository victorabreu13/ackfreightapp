import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { resolveAppUrl } from "@/lib/app-url";

const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const KEY_LENGTH = 64;
export const MIN_PASSWORD_LENGTH = 10;
export const INVITE_DAYS = 7;

/** Scrypt hash with its own random salt, stored as "scrypt$salt$hash" in base64. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** A message when the password is too weak, or null when it is fine. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `La clave debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "La clave debe llevar letras y números.";
  return null;
}

/** The token goes in the link. Only its hash is saved, so a copy of the database cannot be used to register. */
export function newInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function inviteKey(secret: string): Buffer {
  return createHash("sha256").update(`ack-guias-invite:${secret}`).digest();
}

/** AES-256-GCM. Lets staff copy a pending link again without the token ever being stored in the clear. */
export function encryptInviteToken(token: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", inviteKey(secret), iv);
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${body.toString("base64url")}`;
}

export function decryptInviteToken(value: string | null | undefined, secret: string): string | null {
  if (!value) return null;
  const [iv, tag, body] = value.split(".");
  if (!iv || !tag || !body) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", inviteKey(secret), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** The registration link a client's contact opens. */
export function inviteLink(token: string): string {
  return `${resolveAppUrl()}/register/${token}`;
}

export function inviteExpiry(now = new Date()): Date {
  return new Date(now.getTime() + INVITE_DAYS * 24 * 60 * 60 * 1000);
}

export function normalizeCustomerEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

export type InviteState = "ok" | "used" | "expired" | "missing";

export function inviteState(invite: { usedAt: Date | null; expiresAt: Date } | null | undefined, now = new Date()): InviteState {
  if (!invite) return "missing";
  if (invite.usedAt) return "used";
  if (invite.expiresAt.getTime() <= now.getTime()) return "expired";
  return "ok";
}

/**
 * Failed sign-ins per email, kept in memory. It slows down guessing on one instance. It is not a lock-out
 * across instances, so the password rules and the scrypt cost are the real protection.
 */
const attempts = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export function signInBlocked(email: string, now = Date.now()): boolean {
  const entry = attempts.get(email);
  if (!entry) return false;
  if (now - entry.first > WINDOW_MS) {
    attempts.delete(email);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

export function recordFailedSignIn(email: string, now = Date.now()): void {
  const entry = attempts.get(email);
  if (!entry || now - entry.first > WINDOW_MS) attempts.set(email, { count: 1, first: now });
  else entry.count += 1;
}

export function clearFailedSignIns(email: string): void {
  attempts.delete(email);
}
