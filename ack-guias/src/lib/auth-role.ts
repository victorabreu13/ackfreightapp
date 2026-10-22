import type { Role } from "@prisma/client";

const DEFAULT_ADMINS = "victor.abreu@ackfreight.com,andres.alvarado@ackfreight.com";

export function adminEmailSet(raw?: string): Set<string> {
  const source = raw ?? process.env.ADMIN_EMAILS ?? DEFAULT_ADMINS;
  return new Set(
    source
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * ADMIN_EMAILS always sign in as Admin.
 * Anyone else must already be on the user list. A new domain account is rejected.
 */
export function roleOnGoogleSignIn(existingRole: Role | null | undefined, email: string, admins: ReadonlySet<string>): Role | null {
  if (admins.has(email.trim().toLowerCase())) return "ADMIN";
  if (existingRole) return existingRole;
  return null;
}

/** Development login is off in production unless ENABLE_DEV_LOGIN=true. */
export function devLoginAllowed(env: { NODE_ENV?: string; ENABLE_DEV_LOGIN?: string }): boolean {
  return env.ENABLE_DEV_LOGIN === "true" || env.NODE_ENV !== "production";
}
