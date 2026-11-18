import assert from "node:assert/strict";
import test from "node:test";
import { amountOf, awbPrinted, dayFrom, dueDateFor, emailsFrom, invoiceLinesFor, totalOf, type ShipmentForInvoice } from "@/lib/guias/invoice-lines";

const example: ShipmentForInvoice = {
  awb: "04556631411", dest: "GUA", chw: 278.4, sellRate: 1.58, airSold: 439.87, pickupSold: 75, handlingSold: 75, transferSold: 75,
  insuranceSold: 0, aes: 0, awbFee: 50, invoicedOverride: null, uldText: null,
};
const context = { origin: "MIA", date: "2026-11-04", pickupDate: "2026-10-31", pickupDescription: "PACIFIKO LLC, 8504 NW 70 ST" };

test("the example invoice is rebuilt line by line", () => {
  const lines = invoiceLinesFor(example, context);
  assert.deepEqual(lines.map((line) => line.product), ["PICKUP", "HANDLING", "AIRPORT TRANSFER", "AIRFREIGHT", "AWB"]);
  assert.equal(lines[0].serviceDate, "2026-10-31");
  assert.equal(lines[0].description, "PACIFIKO LLC, 8504 NW 70 ST");
  assert.equal(lines[3].description, "MIA-GUA AWB 045-56631411");
  assert.equal(lines[3].qty, 278.4);
  assert.equal(lines[3].rate, 1.58);
  assert.equal(lines[3].amount, 439.87);
  assert.equal(totalOf(lines), 714.87);
});

test("a charge of zero is not a line, and AES, insurance and the ULDs appear when there are some", () => {
  const lines = invoiceLinesFor({ ...example, pickupSold: 0, transferSold: 0, awbFee: 0, aes: 25, insuranceSold: 12.5, uldText: "2 AKE" }, context);
  assert.deepEqual(lines.map((line) => line.product), ["HANDLING", "AIRFREIGHT", "AES", "INSURANCE"]);
  assert.equal(lines[0].description, "2 AKE");
  assert.equal(totalOf(lines), 75 + 439.87 + 25 + 12.5);
});

test("a pickup without its own day takes the day of the shipment", () => {
  assert.equal(invoiceLinesFor(example, { origin: "MIA", date: "2026-11-04" })[0].serviceDate, "2026-11-04");
});

test("a total typed by hand shows its difference as an adjustment, so the invoice adds up to it", () => {
  const lines = invoiceLinesFor({ ...example, invoicedOverride: 700 }, context);
  assert.equal(lines.at(-1)?.product, "ADJUSTMENT");
  assert.equal(totalOf(lines), 700);
  assert.equal(invoiceLinesFor({ ...example, invoicedOverride: 714.87 }, context).some((line) => line.product === "ADJUSTMENT"), false);
});

test("without a sell rate the rate is worked back from the amount", () => {
  const line = invoiceLinesFor({ ...example, sellRate: null, airSold: 500, chw: 250 }, context).find((item) => item.product === "AIRFREIGHT");
  assert.equal(line?.rate, 2);
});

test("AWB numbers print with the dash after the airline prefix", () => {
  assert.equal(awbPrinted("04556631411"), "045-56631411");
  assert.equal(awbPrinted("045-5663 1411"), "045-56631411");
  assert.equal(awbPrinted("ABC"), "ABC");
});

test("the due date is ten days after the invoice date", () => {
  assert.equal(dueDateFor("2026-11-04"), "2026-11-14");
  assert.equal(dueDateFor("2026-11-25"), "2026-12-05");
  assert.equal(dueDateFor("2026-12-28", 10), "2027-01-07");
});

test("days are read as typed and bad ones are refused", () => {
  assert.equal(dayFrom("2026-10-31"), "2026-10-31");
  assert.equal(dayFrom("10/31/2026"), "2026-10-31");
  assert.equal(dayFrom("1/5/26"), "2026-01-05");
  assert.equal(dayFrom("2/30/2026"), null);
  assert.equal(dayFrom("tomorrow"), null);
  assert.equal(dayFrom(null), null);
});

test("emails are split, lowercased and deduplicated, and what is not an email is dropped", () => {
  assert.deepEqual(emailsFrom("A@x.com, b@y.com;\nA@X.com  nonsense"), ["a@x.com", "b@y.com"]);
  assert.deepEqual(emailsFrom(null), []);
});

test("a line amount is quantity times rate to the cent", () => {
  assert.equal(amountOf(278.4, 1.58), 439.87);
  assert.equal(amountOf(3, 0.1), 0.3);
});
