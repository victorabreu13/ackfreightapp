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
  { role: "ADMIN", summary: "Ve y hace todo: guías, stock, documentos, facturación, clientes y tarifas, Company y Usuarios." },
  { role: "OPERATIONS", summary: "Arma guías y las emite, maneja el stock de AWB, los documentos, el Directorio, Carriers y los labels. No factura, no ve Clientes y tarifas, Company ni Usuarios." },
  { role: "ACCOUNTING", summary: "Ve las guías de ACK sin editarlas y las factura. Menú: Guías, Documentos, AWB Status y Templates." },
  { role: "VIEWER", summary: "Solo lee: Guías, Documentos, AWB Status y Templates. No edita ni factura." },
  { role: "CUSTOMER", summary: "Un cliente que se registró con el link de invitación. Entra al portal, no a esta app: ve solo el AWB y el estado del vuelo de sus propias guías, sin documentos. Su acceso se maneja desde el Directorio." },
];

export const CUSTOMER_ROLE_ERROR = "Es un cliente del portal. No se cambia aquí: su acceso se maneja desde el Directorio.";

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
  if (input.role === "CUSTOMER") return CUSTOMER_ROLE_ERROR;
  if (input.actorId === input.targetId) return "No puedes quitar tu propia cuenta.";
  if (input.adminEmails.has(input.email.trim().toLowerCase())) {
    return "Esa cuenta está en ADMIN_EMAILS y no se puede quitar.";
  }
  if (input.role === "ADMIN" && input.activeAdminCount <= 1) {
    return "Tiene que quedar al menos un Admin.";
  }
  return null;
}
