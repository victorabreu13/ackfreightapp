/** Guías header links. Every href must stay allowed when APP_MODE=guias. */
export const GUIAS_NAV: Array<{ href: string; label: string; team?: boolean; admin?: boolean; accounting?: boolean; viewer?: boolean }> = [
  { href: "/guias", label: "Guías" },
  { href: "/guias/documents", label: "Documentos", team: true, accounting: true, viewer: true },
  { href: "/guias/templates", label: "Templates", team: true, accounting: true, viewer: true },
  { href: "/guias/awb-status", label: "AWB Status", team: true, accounting: true, viewer: true },
  { href: "/guias/directory", label: "Directorio", team: true },
  { href: "/guias/dg-labels", label: "Labels DG", team: true },
  { href: "/awb/stock", label: "AWB stock", team: true },
  { href: "/guias/clients", label: "Clientes y tarifas", admin: true },
  { href: "/guias/settings", label: "Settings", admin: true },
  { href: "/guias/users", label: "Usuarios", admin: true },
];
