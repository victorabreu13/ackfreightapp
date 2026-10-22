import type { Role } from "@prisma/client";
import { ackEmail } from "@/lib/guias/brand";

export const USER_ROLES = ["ADMIN", "OPERATIONS", "ACCOUNTING", "VIEWER"] as const;

export const USER_ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  OPERATIONS: "Operations",
  ACCOUNTING: "Accounting",
  VIEWER: "Viewer",
};

export function parseUserRole(value: string): Role | null {
  return (USER_ROLES as readonly string[]).includes(value) ? (value as Role) : null;
}

export function normalizeAckEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (!ackEmail(email)) return null;
  if (!/^[^\s@]+@ackfreight\.com$/.test(email)) return null;
  return email;
}

export function userRoleChangeError(input: {
  email: string;
  from: Role;
  to: Role;
  activeAdminCount: number;
  adminEmails: ReadonlySet<string>;
}): string | null {
  if (input.adminEmails.has(input.email.trim().toLowerCase()) && input.to !== "ADMIN") {
    return "Esa cuenta está en ADMIN_EMAILS y se queda como Admin.";
  }
  if (input.from === "ADMIN" && input.to !== "ADMIN" && input.activeAdminCount <= 1) {
    return "Tiene que quedar al menos un Admin.";
  }
  return null;
}

export function userRemoveError(input: {
  email: string;
  role: Role;
  activeAdminCount: number;
  adminEmails: ReadonlySet<string>;
  actorId: string;
  targetId: string;
}): string | null {
  if (input.actorId === input.targetId) return "No puedes quitar tu propia cuenta.";
  if (input.adminEmails.has(input.email.trim().toLowerCase())) {
    return "Esa cuenta está en ADMIN_EMAILS y no se puede quitar.";
  }
  if (input.role === "ADMIN" && input.activeAdminCount <= 1) {
    return "Tiene que quedar al menos un Admin.";
  }
  return null;
}
