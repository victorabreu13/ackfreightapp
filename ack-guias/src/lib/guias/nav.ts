/** Who sees a link. No flag means everyone who is signed in. */
export type NavLink = { href: string; label: string; team?: boolean; admin?: boolean; accounting?: boolean; viewer?: boolean };
export type NavGroup = { label: string; links: NavLink[] };
export type NavItem = NavLink | NavGroup;

export function isNavGroup(item: NavItem): item is NavGroup {
  return "links" in item;
}

/**
 * Guías header menu. Groups open a submenu and their links are in alphabetical order.
 * Every href must stay allowed when APP_MODE=guias.
 */
export const GUIAS_MENU: NavItem[] = [
  { href: "/guias", label: "Guías" },
  { href: "/guias/documents", label: "Documentos", team: true, accounting: true, viewer: true },
  { href: "/guias/awb-status", label: "AWB Status", team: true, accounting: true, viewer: true },
  {
    label: "Operaciones",
    links: [
      { href: "/guias/pickups", label: "Pickup requests", team: true },
      { href: "/guias/warehouse", label: "Warehouse receipts", team: true },
    ],
  },
  {
    label: "Clientes",
    links: [
      { href: "/guias/clients", label: "Clientes y tarifas", admin: true },
      { href: "/guias/directory", label: "Directorio", team: true },
    ],
  },
  {
    label: "Recursos",
    links: [
      { href: "/awb/stock", label: "AWB stock", team: true },
      { href: "/guias/carriers", label: "Carriers", team: true },
      { href: "/guias/custom-labels", label: "Custom Labels", team: true },
      { href: "/guias/drivers", label: "Drivers", team: true },
      { href: "/guias/dg-labels", label: "Labels DG", team: true },
      { href: "/guias/templates", label: "Templates", team: true, accounting: true, viewer: true },
    ],
  },
  {
    label: "Settings",
    links: [
      { href: "/guias/settings", label: "Company", admin: true },
      { href: "/guias/users", label: "Usuarios", admin: true },
    ],
  },
];

/** Every link of the menu, flat. */
export const GUIAS_NAV: NavLink[] = GUIAS_MENU.flatMap((item) => (isNavGroup(item) ? item.links : [item]));

/** Whether a person with this role sees the link. */
export function navLinkVisible(link: NavLink, role: string): boolean {
  const operations = role === "ADMIN" || role === "OPERATIONS" || role === "TEAM";
  if (link.admin) return role === "ADMIN";
  if (link.team || link.accounting || link.viewer) {
    return (Boolean(link.team) && operations) || (Boolean(link.accounting) && role === "ACCOUNTING") || (Boolean(link.viewer) && role === "VIEWER");
  }
  return true;
}

/** The menu a person with this role sees. A group with no link left for them is left out. */
export function menuFor(role: string): NavItem[] {
  const items: NavItem[] = [];
  for (const item of GUIAS_MENU) {
    if (!isNavGroup(item)) {
      if (navLinkVisible(item, role)) items.push(item);
      continue;
    }
    const links = item.links.filter((link) => navLinkVisible(link, role));
    if (links.length) items.push({ label: item.label, links });
  }
  return items;
}
