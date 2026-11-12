import type { Role } from "@prisma/client";
import { ackEmail } from "@/lib/guias/brand";

export const USER_ROLES = ["ADMIN", "OPERATIONS", "ACCOUNTING", "VIEWER"] as const;

export const USER_ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  OPERATIONS: "Operations",
  ACCOUNTING: "Accounting",
  VIEWER: "Viewer",
  CUSTOMER: "Customer",
};

/** What each role can do, for the Usuarios screen. Customer is not a staff role: it is a client who registered in the portal. */
export const ROLE_DETAIL: Array<{ role: Role; summary: string }> = [
  { role: "ADMIN", summary: "Sees and does everything: guías, stock, documents, billing, clients and rates, Company and Users." },
  { role: "OPERATIONS", summary: "Builds and issues guías, manages the AWB stock, the documents, the Directory, Carriers and the labels. Does not invoice, does not see Clients and rates, Company or Users." },
  { role: "ACCOUNTING", summary: "Sees the ACK guías without editing them and invoices them. Menu: Guías, Documents, AWB Status and Templates." },
  { role: "VIEWER", summary: "Read only: Guías, Documents, AWB Status and Templates. Does not edit or invoice." },
  { role: "CUSTOMER", summary: "A client who registered with the invitation link. Enters the portal, not this app: sees only the AWB and the flight status of their own guías, without documents. Their access is managed from the Directory." },
];

export const CUSTOMER_ROLE_ERROR = "It is a portal client. It is not changed here: its access is managed from the Directory.";

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
  if (input.from === "CUSTOMER") return CUSTOMER_ROLE_ERROR;
  if (input.adminEmails.has(input.email.trim().toLowerCase()) && input.to !== "ADMIN") {
    return "That account is in ADMIN_EMAILS and stays as Admin.";
  }
  if (input.from === "ADMIN" && input.to !== "ADMIN" && input.activeAdminCount <= 1) {
    return "At least one Admin must remain.";
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
  if (input.role === "CUSTOMER") return CUSTOMER_ROLE_ERROR;
  if (input.actorId === input.targetId) return "You cannot remove your own account.";
  if (input.adminEmails.has(input.email.trim().toLowerCase())) {
    return "That account is in ADMIN_EMAILS and cannot be removed.";
  }
  if (input.role === "ADMIN" && input.activeAdminCount <= 1) {
    return "At least one Admin must remain.";
  }
  return null;
}
