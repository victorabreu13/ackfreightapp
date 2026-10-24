import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { guiaBillToName, normalizeBillToName } from "./guia-client";

test("bill-to names fold punctuation and keep LLC", () => {
  assert.equal(normalizeBillToName("PACIFIKO, LLC"), "PACIFIKO LLC");
  assert.equal(normalizeBillToName("  pacifiko   llc "), "PACIFIKO LLC");
  assert.equal(normalizeBillToName("José & Hijos"), "JOSE HIJOS");
  assert.equal(normalizeBillToName("Niño, S.A."), "NINO S A");
  assert.equal(normalizeBillToName("---"), "");
  assert.equal(normalizeBillToName("   "), "");
  assert.equal(guiaBillToName({ guiaClient: { name: "PACIFIKO, LLC" }, clientLabel: "someone else" }), "PACIFIKO, LLC");
  assert.equal(guiaBillToName({ guiaClient: null, clientLabel: "PACIFIKO, LLC" }), "PACIFIKO, LLC");
  assert.equal(guiaBillToName({ guiaClient: null, clientLabel: "  " }), "");
});

test("clients and rates are ACK only", () => {
  const form = readFileSync(new URL("../../components/guia-client-rate-form.tsx", import.meta.url), "utf8");
  assert.match(form, /Tarifa acordada \(USD\/kg cobrable\)/);
  const page = readFileSync(new URL("../../app/(portal)/guias/clients/page.tsx", import.meta.url), "utf8");
  assert.match(page, /Clientes y tarifas/);
  assert.match(page, /isAdmin/);
  assert.match(page, /agentKey: "ack"/);
  assert.equal(page.includes('title="Kope"'), false);
  assert.equal(page.includes('agentKey="kope"'), false);
  const nav = readFileSync(new URL("./nav.ts", import.meta.url), "utf8");
  assert.match(nav, /href: "\/guias\/clients"/);
  const actions = readFileSync(new URL("../../server/guia-actions.ts", import.meta.url), "utf8");
  assert.equal(actions.includes("matchClient"), false);
  assert.match(actions, /ensureGuiaClient/);
  const clientActions = readFileSync(new URL("../../server/guia-client-actions.ts", import.meta.url), "utf8");
  assert.equal(clientActions.includes('"kope"'), false);
});
