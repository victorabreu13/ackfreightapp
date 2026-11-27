import assert from "node:assert/strict";
import test from "node:test";
import { commissionStatus, isoDay, monthRange, shortDate, usd } from "@/lib/guias/acct-format";

test("money and dates show the way the Sheet showed them", () => {
  assert.equal(usd(1234.5), "$1,234.50");
  assert.equal(usd(-20), "-$20.00");
  assert.equal(shortDate(new Date("2026-11-04T00:00:00Z")), "11/04/26");
  assert.equal(shortDate(null), "—");
  assert.equal(isoDay(new Date("2026-11-04T00:00:00Z")), "2026-11-04");
});

test("a month filter covers the whole month and refuses anything else", () => {
  const october = monthRange("2026-10");
  assert.equal(isoDay(october?.from), "2026-10-01");
  assert.equal(isoDay(october?.to), "2026-11-01");
  assert.equal(isoDay(monthRange("2026-12")?.to), "2027-01-01");
  assert.equal(monthRange("2026-13"), null);
  assert.equal(monthRange("nope"), null);
});

test("a commission is owed while anyone but the house is still unpaid", () => {
  const houses = new Set(["ACK"]);
  assert.equal(commissionStatus([{ payee: "ACK", paid: false }, { payee: "Victor", paid: false }], houses), "Owed");
  assert.equal(commissionStatus([{ payee: "ACK", paid: false }, { payee: "Victor", paid: true }], houses), "Paid");
  assert.equal(commissionStatus([{ payee: "ACK", paid: false }], houses), "—");
  assert.equal(commissionStatus([], houses), "—");
});
