import assert from "node:assert/strict";
import test from "node:test";
import { pickupFiltersFrom, pickupHref, pickupOrderBy, pickupSeqFrom, pickupSortChange, pickupWhere } from "@/lib/guias/pickup-list";

test("the pickup filters are read from the address and bad values fall back to the default list", () => {
  const filters = pickupFiltersFrom({ number: " PU-0061 ", client: "pacifiko", destination: "gua", from: "2026-11-01", to: "x", warehouse: "pending", sort: "client", dir: "asc" });
  assert.deepEqual(filters, { number: "PU-0061", client: "pacifiko", awb: "", destination: "gua", from: "2026-11-01", to: "", warehouse: "pending", sort: "client", dir: "asc" });
  const bad = pickupFiltersFrom({ sort: "drop table", dir: "up", warehouse: "x" });
  assert.equal(bad.sort, "pickup");
  assert.equal(bad.dir, "desc");
  assert.equal(bad.warehouse, "");
});

test("a pickup number is read with or without PU and the zeros", () => {
  assert.equal(pickupSeqFrom("PU-0061"), 61);
  assert.equal(pickupSeqFrom("pu61"), 61);
  assert.equal(pickupSeqFrom("61"), 61);
  assert.equal(pickupSeqFrom("K5554"), null);
  assert.equal(pickupSeqFrom(""), null);
});

test("the database filter has one condition for each filter and nothing when there are none", () => {
  assert.deepEqual(pickupWhere(pickupFiltersFrom({})), {});
  const where = pickupWhere(pickupFiltersFrom({ number: "61", client: "pac", awb: "045-5289", destination: "GUA", warehouse: "received" }));
  assert.equal((where.AND as unknown[]).length, 5);
  assert.deepEqual((where.AND as unknown[])[0], { seq: 61 });
  assert.deepEqual((where.AND as unknown[])[4], { receipts: { some: {} } });
  assert.deepEqual((pickupWhere(pickupFiltersFrom({ number: "abc" })).AND as unknown[])[0], { id: "none" });
  assert.deepEqual((pickupWhere(pickupFiltersFrom({ warehouse: "pending" })).AND as unknown[])[0], { receipts: { none: {} } });
});

test("the pickup order and the column links keep the filters, and a second click flips the order", () => {
  const filters = pickupFiltersFrom({ client: "pacifiko" });
  assert.deepEqual(pickupOrderBy(filters), [{ seq: "desc" }]);
  assert.deepEqual(pickupOrderBy(pickupFiltersFrom({ sort: "created", dir: "asc" })), [{ createdAt: "asc" }, { seq: "asc" }]);
  assert.equal(pickupHref(filters), "/guias/pickups?client=pacifiko");
  assert.equal(pickupHref(filters, pickupSortChange(filters, "destination")), "/guias/pickups?client=pacifiko&sort=destination&dir=asc");
  const sorted = pickupFiltersFrom({ client: "pacifiko", sort: "destination", dir: "asc" });
  assert.equal(pickupHref(sorted, pickupSortChange(sorted, "destination")), "/guias/pickups?client=pacifiko&sort=destination&dir=desc");
  assert.equal(pickupHref(pickupFiltersFrom({})), "/guias/pickups");
});
