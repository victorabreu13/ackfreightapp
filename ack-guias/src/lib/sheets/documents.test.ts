import assert from "node:assert/strict";
import test from "node:test";
import { doFileNumber, KOPE, kopeDate, magayaPieceCode, magayaTracking } from "./documents";

test("document fields match Kope's real documents", () => {
  assert.equal(kopeDate(new Date("2026-09-18T00:00:00Z"), { wall: true }), "Sep/18/2026");
  assert.equal(kopeDate(new Date("2026-09-22T00:00:00Z"), { wall: true, shortYear: true }), "Sep/22/26");
  assert.equal(doFileNumber({ awb: "369-11349015", legAwb: "369-10298433" }), "369-11349015 - 369-10298433");
  assert.equal(doFileNumber({ awb: "045-55219415", dest: "GRU", etd: new Date("2026-09-16T00:00:00Z") }), "045-55219415 - MIA-GRU - 09-16-2026");
  assert.equal(magayaTracking("006-14513321", "9690"), "9690-006-14513321-1Z");
  assert.equal(magayaPieceCode("369-11441102", 1), "369114411020001");
  assert.equal(KOPE.legalName, "KOPE LOGISTICS INC.");
  assert.equal(KOPE.tsaIac, "SE1701005");
  assert.equal(KOPE.ccsfId, "MIA.C.05.20.2025.582");
});

test("DO and Pickup Order refuse to render without a trucker (no default)", async () => {
  const { renderSheetDocument } = await import("./documents");
  for (const kind of ["deliveryOrder", "pickupOrder"] as const) {
    await assert.rejects(renderSheetDocument("any", kind, { trucker: "   " }), /Trucker company is required/);
  }
});

test("labels never leave CONSIGNEE blank (1012b)", async () => {
  const { labelConsigneeFor } = await import("./documents");
  const ship = (docs: { awb: string; status: string; consigneeName: string | null }[], consignee: string | null = null) => ({
    awb: "999-96759972", consignee, legs: [{ awb: "369-11444440" }],
    airWaybills: docs.map((d) => ({ ...d, createdAt: new Date() })),
    client: { name: "IVI Logistics", awbParties: [] as { role: string; name: string }[] },
  }) as never;
  assert.equal(labelConsigneeFor(ship([{ awb: "", status: "draft", consigneeName: "COLOCAR CARGO LOGISTICS S.A.S." }]), "leg", "369-11444440").name, "COLOCAR CARGO LOGISTICS S.A.S.");
  assert.equal(labelConsigneeFor(ship([], "GROUNDFLEX SAS"), "leg", "369-11444440").name, "GROUNDFLEX SAS");
  const missing = labelConsigneeFor(ship([]), "leg", "369-11444440");
  assert.equal(missing.name, "CONSIGNEE MISSING"); assert.equal(missing.missing, true);
});
