import assert from "node:assert/strict";
import test from "node:test";
import { planPickupSync, type GuiaPickupView, type PickupFields } from "@/lib/guias/pickup-sync";

const before: PickupFields = {
  shipperName: "PACIFIKO, LLC", shipperAddress: "8504 NW 70th St", consigneeName: "PACIFIKO GT", consigneeAddress: "GUATEMALA", destination: "GUA",
  pieces: 11, weightKg: 400, description: "ELECTRONICS", truckerName: "RL SERVICES", truckerPhone: "305-111", driverName: "YUNIOR", packageType: "Pallet",
};
const guia = (over: Partial<GuiaPickupView> = {}): GuiaPickupView => ({
  shipperName: "PACIFIKO, LLC", shipperAddress: "8504 NW 70th St", consigneeName: "PACIFIKO GT", consigneeAddress: "GUATEMALA", destination: "GUA",
  truckerName: "RL SERVICES", pickupTruckerName: "RL SERVICES", truckerPhone: "305-111", driverName: "YUNIOR", packageType: "Pallet",
  line: { id: "l1", pieces: 11, grossWeight: 400, chargeableWeight: 400, nature: "ELECTRONICS" },
  ...over,
});

test("a corrected pickup request corrects the AWB fields that still hold the old value", () => {
  const after = { ...before, shipperAddress: "9000 NW 12th St", truckerName: "KAY AIR", pieces: 12, weightKg: 420 };
  const plan = planPickupSync(before, after, guia(), false);
  assert.deepEqual(plan.guia, { shipperAddress: "9000 NW 12th St", truckerName: "KAY AIR", pickupTruckerName: "KAY AIR" });
  assert.deepEqual(plan.line, { pieces: 12, grossWeight: 420, chargeableWeight: 420 });
  assert.deepEqual(plan.kept, []);
  assert.ok(plan.changes.some((change) => change.field === "shipperAddress" && change.oldValue === "8504 NW 70th St" && change.newValue === "9000 NW 12th St"));
});

test("an AWB field the team already changed is kept and reported", () => {
  const after = { ...before, shipperName: "PACIFIKO LLC", driverName: "PEDRO" };
  const plan = planPickupSync(before, after, guia({ shipperName: "PACIFIKO USA", driverName: "" }), false);
  // The shipper was changed in the AWB, so it stays. The driver was empty, so it is filled.
  assert.deepEqual(plan.guia, { driverName: "PEDRO" });
  assert.deepEqual(plan.kept, ["Shipper"]);
});

test("an issued AWB only gets its parties and trucker corrected, never its cargo", () => {
  const after = { ...before, shipperAddress: "NEW ADDRESS", destination: "SJO", pieces: 99, weightKg: 1, description: "OTHER" };
  const plan = planPickupSync(before, after, guia(), true);
  assert.deepEqual(plan.guia, { shipperAddress: "NEW ADDRESS" });
  assert.deepEqual(plan.line, {});
});

test("nothing changes when the pickup request did not change, and an AWB with no goods line is fine", () => {
  const plan = planPickupSync(before, { ...before }, guia(), false);
  assert.deepEqual(plan.changes, []);
  const noLine = planPickupSync(before, { ...before, pieces: 3 }, guia({ line: null }), false);
  assert.deepEqual(noLine.line, {});
  const cleared = planPickupSync(before, { ...before, driverName: null }, guia(), false);
  assert.deepEqual(cleared.guia, { driverName: null });
});
