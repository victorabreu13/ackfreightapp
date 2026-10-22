import type { Role } from "@prisma/client";

/** A returning user keeps the role already stored. New Google users are team, or admin when listed. */
export function roleOnGoogleSignIn(existingRole: Role | null | undefined, email: string, admins: ReadonlySet<string>): Role {
  if (existingRole) return existingRole;
  return admins.has(email.trim().toLowerCase()) ? "ADMIN" : "TEAM";
}
