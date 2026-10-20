const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { distanceMeters, shouldRecordPoint, stampPoint, stampTransitions, validPoint } = require("../trail");

const A = { lat: 25.807, lng: -80.3, t: 1000 };

describe("location trail", () => {
  it("measures distance in meters", () => {
    const d = distanceMeters({ lat: 25.807, lng: -80.3 }, { lat: 25.808, lng: -80.3 });
    assert.ok(d > 100 && d < 125, `got ${d}`);
    assert.equal(Math.round(distanceMeters(A, A)), 0);
  });

  it("records a ping only when the driver moved, or after a quiet stretch", () => {
    assert.equal(shouldRecordPoint(null, A), true);
    assert.equal(shouldRecordPoint(A, { ...A, t: 26000 }), false); // standing still, 25 s later
    assert.equal(shouldRecordPoint(A, { lat: 25.8075, lng: -80.3, t: 26000 }), true); // ~55 m
    assert.equal(shouldRecordPoint(A, { ...A, t: 1000 + 125000 }), true); // quiet for over 2 minutes
  });

  it("validates points", () => {
    assert.equal(validPoint({ lat: 25.8, lng: -80.3 }), true);
    assert.equal(validPoint({ lat: 95, lng: 0 }), false);
    assert.equal(validPoint({ lat: "1", lng: 2 }), false);
    assert.equal(validPoint(null), false);
  });

  it("stamps with the phone's fix, else the server's last ping, else nothing", () => {
    const data = { driverLocations: { d1: { lat: 25.8, lng: -80.2, updatedAt: 500 } } };
    assert.deepEqual(stampPoint(data, "d1", { lat: 1, lng: 2, accuracy: 7.6 }, 900), {
      lat: 1,
      lng: 2,
      at: 900,
      source: "device",
      accuracy: 8,
    });
    assert.deepEqual(stampPoint(data, "d1", undefined, 900), {
      lat: 25.8,
      lng: -80.2,
      at: 900,
      source: "last ping",
      pingAt: 500,
    });
    assert.equal(stampPoint(data, "other", { lat: 999, lng: 0 }, 900), null);
  });

  it("stamps only the lines whose status just changed", () => {
    const before = [{ status: "assigned" }, { status: "in_progress" }, { status: "completed" }];
    const after = [{ status: "in_progress" }, { status: "picked_up" }, { status: "completed" }];
    const stamp = { lat: 1, lng: 2, at: 3, source: "device" };
    const out = stampTransitions(before, after, stamp);
    assert.deepEqual(out[0].startedLocation, stamp);
    assert.deepEqual(out[1].pickedUpLocation, stamp);
    assert.equal(out[2].completedLocation, undefined); // was already completed
    assert.equal(stampTransitions(before, after, null), after);
  });
});
