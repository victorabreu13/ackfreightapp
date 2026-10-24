import assert from "node:assert/strict";
import test from "node:test";
import { GUIAS_MENU, GUIAS_NAV, isNavGroup, menuFor } from "@/lib/guias/nav";

const labels = (role: string) => menuFor(role).map((item) => (isNavGroup(item) ? `${item.label}: ${item.links.map((link) => link.label).join(" | ")}` : item.label));

test("the menu is Guías, Documentos, AWB Status and three groups", () => {
  assert.deepEqual(
    GUIAS_MENU.map((item) => item.label),
    ["Guías", "Documentos", "AWB Status", "Clientes", "Recursos", "Settings"],
  );
});

test("the submenus are in alphabetical order, and Settings holds Company and Usuarios", () => {
  for (const item of GUIAS_MENU) {
    if (!isNavGroup(item)) continue;
    const names = item.links.map((link) => link.label);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })), item.label);
  }
  const settings = GUIAS_MENU.find((item) => item.label === "Settings");
  assert.ok(settings && isNavGroup(settings));
  assert.deepEqual(settings.links.map((link) => [link.label, link.href]), [
    ["Company", "/guias/settings"],
    ["Usuarios", "/guias/users"],
  ]);
});

test("each role sees only its own links, and an empty group is left out", () => {
  assert.deepEqual(labels("ADMIN"), [
    "Guías",
    "Documentos",
    "AWB Status",
    "Clientes: Clientes y tarifas | Directorio",
    "Recursos: AWB stock | Carriers | Custom Labels | Labels DG | Templates",
    "Settings: Company | Usuarios",
  ]);
  assert.deepEqual(labels("OPERATIONS"), ["Guías", "Documentos", "AWB Status", "Clientes: Directorio", "Recursos: AWB stock | Carriers | Custom Labels | Labels DG | Templates"]);
  assert.deepEqual(labels("ACCOUNTING"), ["Guías", "Documentos", "AWB Status", "Recursos: Templates"]);
  assert.deepEqual(labels("VIEWER"), ["Guías", "Documentos", "AWB Status", "Recursos: Templates"]);
});

test("the flat list still has every page of the menu", () => {
  assert.equal(GUIAS_NAV.length, 12);
  assert.ok(GUIAS_NAV.some((link) => link.href === "/guias/users"));
});
