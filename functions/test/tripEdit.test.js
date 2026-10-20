const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { diffTripDetails, to12h, validateTripDetails } = require("../tripEdit");

const base = { tripDate: "2026-10-20", pickupTime: "08:00", from: "Atlas", to: "IVI Warehouse" };

describe("trip detail edits", () => {
  it("validates and cleans the new values", () => {
    const ok = validateTripDetails({ ...base, from: "  Atlas   Air ", to: "IVI Warehouse" });
    assert.equal(ok.ok, true);
    assert.equal(ok.values.from, "Atlas Air");
    assert.equal(validateTripDetails({ ...base, tripDate: "2026-02-30" }).ok, false);
    assert.equal(validateTripDetails({ ...base, tripDate: "10/20/2026" }).ok, false);
    assert.equal(validateTripDetails({ ...base, pickupTime: "25:00" }).ok, false);
    assert.equal(validateTripDetails({ ...base, to: "  " }).ok, false);
    assert.equal(validateTripDetails({ ...base, from: "x".repeat(121) }).ok, false);
  });

  it("lists only what changed, with times in 12-hour form", () => {
    const changes = diffTripDetails(base, { ...base, tripDate: "2026-10-21", pickupTime: "13:30" });
    assert.deepEqual(changes, [
      { field: "Date", from: "2026-10-20", to: "2026-10-21" },
      { field: "Pick up time", from: "8:00 AM", to: "1:30 PM" },
    ]);
    assert.deepEqual(diffTripDetails(base, { ...base }), []);
    assert.equal(to12h("00:05"), "12:05 AM");
  });
});
