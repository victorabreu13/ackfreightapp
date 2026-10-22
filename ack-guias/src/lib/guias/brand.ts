export type GuiaBrand = "ack";

const RESERVED_GUIA_PAGES = new Set(["new", "documents", "settings", "clients"]);

export function ackEmail(email: string | null | undefined): boolean {
  const normalized = (email ?? "").trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at < 0) return false;
  return normalized.slice(at + 1) === "ackfreight.com";
}

export function userBrand(_user?: unknown): GuiaBrand {
  return "ack";
}

export function guiaBrand(_input?: unknown): GuiaBrand {
  return "ack";
}

export function brandTitle(_brand?: string): string {
  return "ACK Guías";
}

export function brandIconPath(_brand?: string): string {
  return "/brand-icon";
}

export function brandIconIsAck(_company?: string | null, _scope?: string): boolean {
  return true;
}

export function guiaIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/guias\/([^/]+)$/);
  const id = match?.[1] ? decodeURIComponent(match[1]) : "";
  if (!id || RESERVED_GUIA_PAGES.has(id)) return null;
  return id;
}

export function documentsCompanyFromRequest(pathname: string): string | null {
  if (pathname !== "/guias/documents") return null;
  return "ack";
}
