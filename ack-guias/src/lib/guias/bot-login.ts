import { timingSafeEqual } from "node:crypto";

export const GUIAS_BOT_EMAIL = "ops-bot@ackfreight.com";

export function botPasswordMatches(email: string, password: string, secret: string | undefined): boolean {
  if (email !== GUIAS_BOT_EMAIL || !secret) return false;
  const left = Buffer.from(password);
  const right = Buffer.from(secret);
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
