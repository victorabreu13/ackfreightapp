import assert from "node:assert/strict";
import test from "node:test";
import { GUIAS_NAV } from "./guias/nav";
import { isGuiasAllowed, isGuiasApp } from "./app-mode";

test("ACK Guías exposes guías, stock, and auth, and refuses the other product", () => {
  assert.equal(isGuiasApp(), true);
  for (const path of [
    "/",
    "/guias",
    "/guias/new",
    "/guias/documents",
    "/guias/settings",
    "/guias/clients",
    "/guias/abc",
    "/awb",
    "/awb/stock",
    "/api/guias/extract",
    "/api/guias/documents/import",
    "/api/guias/uploads/doc1",
    "/api/guias/qbo/callback",
    "/api/guias/qbo/connect",
    "/api/auth/callback/google",
    "/login",
    "/brand-icon",
    "/manifest.webmanifest",
    "/guias/users",
  ]) {
    assert.equal(isGuiasAllowed(path), true, path);
  }
  for (const path of [
    "/commissions",
    "/holds",
    "/drafts",
    "/airlines",
    "/admin",
    "/accounting",
    "/awb/new",
    "/api/awb/x/pdf",
    "/api/pre-alerts",
    "/api/bot",
    "/api/cron/flight-status",
    "/shipments/1",
  ]) {
    assert.equal(isGuiasAllowed(path), false, path);
  }
  for (const link of GUIAS_NAV) {
    assert.equal(isGuiasAllowed(link.href), true, link.href);
  }
});
