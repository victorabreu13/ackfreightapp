import assert from "node:assert/strict";
import test from "node:test";
import { awbVariants, matchesDays, receiptSeqFrom, wrFiltersFrom, wrHref, wrOrderBy, wrSortChange, wrWhere } from "@/lib/guias/wr-list";

test("the filters are read from the address and bad values fall back to the default list", () => {
  const filters = wrFiltersFrom({ number: " K5554 ", client: "pacifiko", from: "2026-11-01", to: "not a day", link: "unlinked", sort: "client", dir: "asc" });
  assert.deepEqual(filters, { number: "K5554", client: "pacifiko", awb: "", from: "2026-11-01", to: "", link: "unlinked", sort: "client", dir: "asc" });
  const bad = wrFiltersFrom({ sort: "drop table", dir: "up", link: "x" });
  assert.equal(bad.sort, "receipt");
  assert.equal(bad.dir, "desc");
  assert.equal(bad.link, "");
});

test("a receipt number is read with or without the K", () => {
  assert.equal(receiptSeqFrom("K5554"), 5554);
  assert.equal(receiptSeqFrom(" k 5554 "), 5554);
  assert.equal(receiptSeqFrom("5554"), 5554);
  assert.equal(receiptSeqFrom("PU-0001"), null);
  assert.equal(receiptSeqFrom(""), null);
});

test("an AWB is searched as typed and with the dash after the airline prefix", () => {
  assert.deepEqual(awbVariants("04552890364"), ["04552890364", "045-52890364"]);
  assert.deepEqual(awbVariants("045-5289"), ["045-5289"]);
  assert.deepEqual(awbVariants("5289"), ["5289", "528-9"]);
  assert.deepEqual(awbVariants("  "), []);
});

test("the database filter has one condition for each filter and nothing when there are none", () => {
  assert.deepEqual(wrWhere(wrFiltersFrom({})), {});
  const where = wrWhere(wrFiltersFrom({ number: "5554", client: "pac", awb: "045-5289", link: "linked" }));
  assert.equal((where.AND as unknown[]).length, 4);
  assert.deepEqual((where.AND as unknown[])[0], { seq: 5554 });
  // A number that is not one matches nothing.
  assert.deepEqual((wrWhere(wrFiltersFrom({ number: "abc" })).AND as unknown[])[0], { id: "none" });
});

test("the exact day is the one in New York, whatever the hour in UTC", () => {
  // 02:30 UTC of Nov 25 is still the evening of Nov 24 in New York.
  const late = new Date("2026-11-25T02:30:00Z");
  assert.equal(matchesDays(late, { from: "2026-11-24", to: "2026-11-24" }), true);
  assert.equal(matchesDays(late, { from: "2026-11-25", to: "" }), false);
  assert.equal(matchesDays(late, { from: "", to: "2026-11-23" }), false);
  assert.equal(matchesDays(late, { from: "", to: "" }), true);
});

test("the order and the column links keep the filters, and a second click flips the order", () => {
  const filters = wrFiltersFrom({ client: "pacifiko" });
  assert.deepEqual(wrOrderBy(filters), [{ seq: "desc" }]);
  assert.deepEqual(wrOrderBy(wrFiltersFrom({ sort: "received", dir: "asc" })), [{ receivedAt: "asc" }, { seq: "asc" }]);
  assert.equal(wrHref(filters), "/guias/warehouse?client=pacifiko");
  assert.equal(wrHref(filters, wrSortChange(filters, "client")), "/guias/warehouse?client=pacifiko&sort=client&dir=asc");
  const sorted = wrFiltersFrom({ client: "pacifiko", sort: "client", dir: "asc" });
  assert.equal(wrHref(sorted, wrSortChange(sorted, "client")), "/guias/warehouse?client=pacifiko&sort=client&dir=desc");
  assert.equal(wrHref(wrFiltersFrom({}), {}), "/guias/warehouse");
});
