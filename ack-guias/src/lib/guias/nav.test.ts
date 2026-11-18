import assert from "node:assert/strict";
import test from "node:test";
import { GUIAS_MENU, GUIAS_NAV, isNavGroup, menuFor } from "@/lib/guias/nav";

const labels = (role: string) => menuFor(role).map((item) => (isNavGroup(item) ? `${item.label}: ${item.links.map((link) => link.label).join(" | ")}` : item.label));

test("the menu is Guías, Documents, AWB Status and the groups", () => {
  assert.deepEqual(
    GUIAS_MENU.map((item) => item.label),
    ["Guías", "Documents", "AWB Status", "Operations", "Clients", "Accounting", "Resources", "Settings"],
  );
});

test("the submenus are in alphabetical order, and Settings holds Company and Users", () => {
  for (const item of GUIAS_MENU) {
    if (!isNavGroup(item)) continue;
    const names = item.links.map((link) => link.label);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })), item.label);
  }
  const settings = GUIAS_MENU.find((item) => item.label === "Settings");
  assert.ok(settings && isNavGroup(settings));
  assert.deepEqual(settings.links.map((link) => [link.label, link.href]), [
    ["Company", "/guias/settings"],
    ["Users", "/guias/users"],
  ]);
});

test("each role sees only its own links, and an empty group is left out", () => {
  assert.deepEqual(labels("ADMIN"), [
    "Guías",
    "Documents",
    "AWB Status",
    "Operations: Houses | Pickup requests | Warehouse receipts",
    "Clients: Clients and rates | Directory",
    "Accounting: Costs | Rates",
    "Resources: AWB stock | Carriers | Custom Labels | Drivers | Labels DG | Templates",
    "Settings: Company | Users",
  ]);
  assert.deepEqual(labels("OPERATIONS"), ["Guías", "Documents", "AWB Status", "Operations: Houses | Pickup requests | Warehouse receipts", "Clients: Directory", "Resources: AWB stock | Carriers | Custom Labels | Drivers | Labels DG | Templates"]);
  assert.deepEqual(labels("ACCOUNTING"), ["Guías", "Documents", "AWB Status", "Accounting: Costs | Rates", "Resources: Templates"]);
  assert.deepEqual(labels("VIEWER"), ["Guías", "Documents", "AWB Status", "Resources: Templates"]);
});

test("the flat list still has every page of the menu", () => {
  assert.equal(GUIAS_NAV.length, 18);
  assert.ok(GUIAS_NAV.some((link) => link.href === "/guias/users"));
});
