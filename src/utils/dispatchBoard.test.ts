import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AwbLine, AwbLineStatus, newAwbLine, TripRequest, UserProfile } from "../types";
import {
  computeAlerts,
  dayCounters,
  driverStates,
  latestDriverLocations,
  pickupDate,
  tripsForDay,
} from "./dispatchBoard";

const NOW = new Date(2026, 9, 8, 10, 0).getTime(); // Oct 8 2026 10:00 local
const TODAY = "2026-10-08";

function line(status: AwbLineStatus, driverId: string | null = status === "submitted" ? null : "d1"): AwbLine {
  return { ...newAwbLine(), status, assignedDriverId: driverId, assignedDriverName: driverId ? `Driver ${driverId}` : null, startedAt: 1 };
}

function request(id: string, over: Partial<TripRequest>): TripRequest {
  return {
    id,
    customerId: "c",
    customerName: "Acme",
    customerEmail: "a@x.com",
    submittedAt: 0,
    tripDate: TODAY,
    from: "MIA 716",
    pickupTime: "10:30",
    to: "Doral",
    personRequesting: "",
    awbLines: [line("submitted")],
    importFeeFiles: [],
    assignedDriverIds: [],
    assignedDriverNames: [],
    status: "submitted",
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

function driver(uid: string, onDuty = true): UserProfile {
  return { uid, email: `${uid}@x.com`, name: `Driver ${uid}`, role: "driver", createdAt: 0, onDuty };
}

describe("pickupDate", () => {
  it("parses local date + time", () => {
    const d = pickupDate({ tripDate: "2026-10-08", pickupTime: "13:05" })!;
    assert.equal(d.getHours(), 13);
    assert.equal(d.getMinutes(), 5);
    assert.equal(pickupDate({ tripDate: "bad", pickupTime: "10:00" }), null);
  });
});

describe("tripsForDay", () => {
  const reqs = [
    request("a", {}),
    request("b", { tripDate: "2026-10-07", status: "in_progress", awbLines: [line("picked_up")] }),
    request("c", { tripDate: "2026-10-07", status: "completed", awbLines: [line("completed")] }),
    request("d", { status: "cancelled" }),
    request("e", { tripDate: "2026-10-09" }),
  ];
  it("includes today's trips plus open trips carried over from earlier days", () => {
    const ids = tripsForDay(reqs, TODAY, TODAY).map((t) => t.request.id).sort();
    assert.deepEqual(ids, ["a", "b"]);
    assert.equal(tripsForDay(reqs, TODAY, TODAY).find((t) => t.request.id === "b")!.carriedOver, true);
  });
  it("shows only that day's trips for other days", () => {
    assert.deepEqual(tripsForDay(reqs, "2026-10-07", TODAY).map((t) => t.request.id).sort(), ["b", "c"]);
  });
});

describe("driver state + alerts", () => {
  const moving = request("m", {
    status: "in_progress",
    awbLines: [line("picked_up", "d1")],
    driverLocations: { d1: { lat: 25.8, lng: -80.3, updatedAt: NOW - 10 * 60 * 1000 } },
  });
  const noDriverSoon = request("n", { pickupTime: "10:40" });
  const noDriverLater = request("l", { pickupTime: "15:00" });
  const lateStart = request("s", { pickupTime: "09:30", status: "assigned", awbLines: [line("assigned", "d2")] });
  const unconfirmed = request("u", { pickupTime: "10:20", status: "assigned", awbLines: [line("assigned", "d3")] });
  const reqs = [moving, noDriverSoon, noDriverLater, lateStart, unconfirmed];
  const states = driverStates([driver("d1"), driver("d2"), driver("d3", false)], reqs, NOW);

  it("finds the latest location per driver", () => {
    const older = request("o", { driverLocations: { d1: { lat: 1, lng: 1, updatedAt: 5 } } });
    assert.equal(latestDriverLocations([older, moving]).d1.lat, 25.8);
  });

  it("marks a busy driver with an old point as stale", () => {
    const d1 = states.find((s) => s.driver.uid === "d1")!;
    assert.equal(d1.busy, true);
    assert.equal(d1.locationStale, true);
    assert.equal(d1.current?.stage, "in_transit");
  });

  it("raises the expected alerts, red first", () => {
    const alerts = computeAlerts(reqs, states, NOW, 2);
    const kinds = alerts.map((a) => `${a.kind}:${a.requestId ?? a.driverId ?? ""}`);
    assert.equal(alerts[0].kind, "no_driver_soon");
    assert.ok(kinds.includes("no_driver_soon:n"));
    assert.ok(!kinds.some((k) => k.endsWith(":l")), "pickup in 5h is not urgent yet");
    assert.ok(kinds.includes("pickup_late:s"));
    assert.ok(kinds.includes("not_confirmed:u"));
    assert.ok(kinds.includes("gps_lost:m"));
    assert.equal(alerts[alerts.length - 1].kind, "new_leads");
  });

  it("counts the day", () => {
    const c = dayCounters(tripsForDay(reqs, TODAY, TODAY), states);
    assert.equal(c.total, 5);
    assert.equal(c.requested, 2);
    assert.equal(c.assigned, 2);
    assert.equal(c.onTheRoad, 1);
    assert.equal(c.driversOnDuty, 2);
    assert.equal(c.driversFree, 1);
  });
});
