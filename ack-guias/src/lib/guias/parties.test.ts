import assert from "node:assert/strict";
import test from "node:test";
import { normalizePartyName, partiesFromGuias } from "@/lib/guias/parties";

function guia(overrides: Partial<Parameters<typeof partiesFromGuias>[0][number]> = {}) {
  return {
    agentKey: "ack",
    guiaClientId: "client-1",
    createdAt: new Date("2026-10-01T12:00:00.000Z"),
    shipperName: null,
    shipperAddress: null,
    consigneeName: null,
    consigneeAddress: null,
    notifyName: null,
    notifyAddress: null,
    ...overrides,
  };
}

test("party names match without case, accents or punctuation", () => {
  assert.equal(normalizePartyName("Colocar Cargo Logística, S.A.S."), normalizePartyName("COLOCAR CARGO LOGISTICA SAS"));
  assert.equal(normalizePartyName("   "), "");
});

test("past guías become one directory row per client, role and name", () => {
  const rows = partiesFromGuias([
    guia({ shipperName: "Gwen Trading Corp", shipperAddress: "OLD ADDRESS", consigneeName: "Colocar Cargo", consigneeAddress: "Calle 26" }),
    guia({
      createdAt: new Date("2026-10-10T12:00:00.000Z"),
      shipperName: "GWEN TRADING CORP.",
      shipperAddress: "NEW ADDRESS",
      notifyName: "Notify Co",
    }),
    guia({ guiaClientId: "client-2", shipperName: "Gwen Trading Corp", shipperAddress: "OTHER CLIENT" }),
    guia({ shipperName: "  ", consigneeName: null }),
  ]);
  const shippers = rows.filter((row) => row.role === "SHIPPER");
  assert.equal(shippers.length, 2);
  const forClient1 = shippers.find((row) => row.guiaClientId === "client-1");
  assert.equal(forClient1?.address, "NEW ADDRESS");
  assert.equal(forClient1?.name, "GWEN TRADING CORP.");
  assert.equal(shippers.find((row) => row.guiaClientId === "client-2")?.address, "OTHER CLIENT");
  assert.equal(rows.filter((row) => row.role === "CONSIGNEE").length, 1);
  assert.equal(rows.filter((row) => row.role === "NOTIFY").length, 1);
  assert.equal(rows.length, 4);
});

test("an older address fills in when the newest guía has none", () => {
  const rows = partiesFromGuias([
    guia({ shipperName: "Acme", shipperAddress: "1 MAIN ST" }),
    guia({ createdAt: new Date("2026-10-20T12:00:00.000Z"), shipperName: "ACME", shipperAddress: "" }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].address, "1 MAIN ST");
});
