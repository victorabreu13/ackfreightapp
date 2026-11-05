import assert from "node:assert/strict";
import test from "node:test";
import { ackEmail, brandIconPath, brandTitle, documentsCompanyFromRequest, guiaBrand, guiaIdFromPath, userBrand } from "./brand";

test("ACK Guías wears only the ACK mark", () => {
  assert.equal(ackEmail("Victor.Abreu@ackfreight.com"), true);
  assert.equal(ackEmail("andres.alvarado@ackfreight.com"), true);
  assert.equal(ackEmail("person@gmail.com"), false);
  assert.equal(ackEmail("ops@mail.ackfreight.com"), false);
  assert.equal(userBrand(), "ack");
  assert.equal(guiaBrand(), "ack");
  assert.equal(brandTitle(), "ACK Freight App");
  assert.equal(brandIconPath(), "/brand-icon");
  assert.equal(guiaIdFromPath("/guias/abc"), "abc");
  assert.equal(guiaIdFromPath("/guias/new"), null);
  assert.equal(guiaIdFromPath("/guias/users"), null);
  assert.equal(documentsCompanyFromRequest("/guias/documents"), "ack");
  assert.equal(documentsCompanyFromRequest("/guias"), null);
});
