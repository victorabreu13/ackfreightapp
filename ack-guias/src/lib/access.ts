import type { Prisma, Role } from "@prisma/client";

export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
  role: Role;
  /** Always null. Kept so session callers stay stable. */
  clientId: string | null;
  clientName: string | null;
  /** ACK when the user is company accounting. */
  agentKey?: string | null;
};

export const ACK_AGENT_KEY = "ack";

export function isCompanyAccounting(user: SessionUser): boolean {
  return user.role === "ACCOUNTING" && user.agentKey === ACK_AGENT_KEY;
}

export function isTeam(user: SessionUser): boolean {
  return user.role === "ADMIN" || user.role === "TEAM";
}

export function canManageGuias(user: SessionUser): boolean {
  return user.role === "ADMIN" || user.role === "TEAM";
}

export function canReadGuias(user: SessionUser): boolean {
  return canManageGuias(user) || isCompanyAccounting(user);
}

export function canEditAgreedRate(user: SessionUser): boolean {
  return canManageGuias(user);
}

export function canInvoiceGuia(user: SessionUser, agentKey: string): boolean {
  if (agentKey !== ACK_AGENT_KEY) return false;
  if (user.role === "ADMIN") return true;
  return isCompanyAccounting(user);
}

export function guiaWhere(user: SessionUser): Prisma.AirWaybillDocumentWhereInput {
  if (canManageGuias(user)) return { product: "guia", agentKey: ACK_AGENT_KEY };
  if (isCompanyAccounting(user)) return { product: "guia", agentKey: ACK_AGENT_KEY };
  return { product: "guia", id: "__no_guia__" };
}

export function guiaVisible(user: SessionUser, guia: { agentKey: string }): boolean {
  if (guia.agentKey !== ACK_AGENT_KEY) return false;
  return canManageGuias(user) || isCompanyAccounting(user);
}

export function isAdmin(user: SessionUser): boolean {
  return user.role === "ADMIN";
}
