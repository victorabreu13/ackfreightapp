/** ACK Guías is the only app in this service. */
export function isGuiasApp(): boolean {
  return true;
}

const RESERVED = new Set(["new", "documents", "settings", "clients"]);

export function isGuiasAllowed(pathname: string): boolean {
  if (pathname === "/" || pathname === "/login" || pathname === "/brand-icon" || pathname === "/favicon.ico") return true;
  if (pathname === "/guias" || pathname.startsWith("/guias/")) return true;
  if (pathname === "/awb" || pathname === "/awb/stock") return true;
  if (pathname === "/api/guias" || pathname.startsWith("/api/guias/")) return true;
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) return true;
  if (RESERVED.has(pathname)) return false;
  return false;
}
