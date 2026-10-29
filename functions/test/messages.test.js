const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { cleanMessageText, messageTargets, previewText } = require("../messages");

describe("internal messages", () => {
  it("cleans the text and rejects empty or oversized messages", () => {
    assert.deepEqual(cleanMessageText("  hola  "), { ok: true, text: "hola" });
    assert.equal(cleanMessageText("   ").ok, false);
    assert.equal(cleanMessageText(null).ok, false);
    assert.equal(cleanMessageText("x".repeat(1001)).ok, false);
    assert.equal(cleanMessageText("x".repeat(1000)).ok, true);
  });

  it("shortens a preview to one line", () => {
    assert.equal(previewText("line one\n\nline   two"), "line one line two");
    const long = previewText("a".repeat(200));
    assert.equal(long.length, 120);
    assert.ok(long.endsWith("…"));
  });

  it("lets a driver write only to their own thread", () => {
    assert.deepEqual(messageTargets("driver", "d1", {}), { ok: true, driverIds: ["d1"] });
    assert.deepEqual(messageTargets("driver", "d1", { driverId: "d1" }), { ok: true, driverIds: ["d1"] });
    assert.equal(messageTargets("driver", "d1", { driverId: "d2" }).ok, false);
    assert.equal(messageTargets("driver", "d1", { driverIds: ["d2", "d3"] }).driverIds[0], "d1");
  });

  it("lets an admin write to one driver or many, once each", () => {
    assert.deepEqual(messageTargets("admin", "a1", { driverId: "d1" }), { ok: true, driverIds: ["d1"] });
    assert.deepEqual(messageTargets("admin", "a1", { driverIds: ["d1", "d2", "d1"] }), { ok: true, driverIds: ["d1", "d2"] });
    assert.equal(messageTargets("admin", "a1", {}).ok, false);
    assert.equal(messageTargets("customer", "c1", { driverId: "d1" }).ok, false);
  });
});
