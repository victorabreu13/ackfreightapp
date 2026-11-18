import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deliveryTripPayload, parsePickupDay, parseReadyTime, pickupTripPayload, sendTripRequest, type TripPayload } from "./ack-freight";

const payload: TripPayload = {
  externalId: "PU-0007",
  kind: "pickup",
  clientName: "Ivi Logistics",
  from: "Shipper",
  to: "ACK Warehouse",
  awbLines: [{ awbNumber: "PU-0007", qtyPieces: 1, kilograms: 1 }],
};

describe("ACK Freight link: reading dates and times as typed", () => {
  it("reads the day in the usual spellings", () => {
    const now = new Date("2026-10-29T12:00:00Z");
    assert.equal(parsePickupDay("2026-10-30"), "2026-10-30");
    assert.equal(parsePickupDay("10/30/2026"), "2026-10-30");
    assert.equal(parsePickupDay("10-30-26"), "2026-10-30");
    assert.equal(parsePickupDay("10/30", now), "2026-10-30");
    assert.equal(parsePickupDay("02/30/2026"), "");
    assert.equal(parsePickupDay("mañana"), "");
    assert.equal(parsePickupDay(null), "");
  });

  it("reads the ready time in the usual spellings", () => {
    assert.equal(parseReadyTime("14:30"), "14:30");
    assert.equal(parseReadyTime("2:30 PM"), "14:30");
    assert.equal(parseReadyTime("2pm"), "14:00");
    assert.equal(parseReadyTime("12 am"), "00:00");
    assert.equal(parseReadyTime("12:15 pm"), "12:15");
    assert.equal(parseReadyTime("8:05"), "08:05");
    assert.equal(parseReadyTime("25:00"), "");
    assert.equal(parseReadyTime("13 pm"), "");
    assert.equal(parseReadyTime("cuando termine"), "");
  });
});

describe("ACK Freight link: what is sent", () => {
  it("a pickup order goes from the shipper to the warehouse, with the pickup number as its line", () => {
    const p = pickupTripPayload({
      number: "PU-0007",
      clientLabel: "Ivi Logistics",
      shipperName: "Shipper Inc",
      shipperAddress: "100 NW 1st St\nMiami FL",
      contactName: "Ana",
      contactPhone: "305-555-0100",
      pieces: 3,
      weightKg: 120.5,
      pickupDate: "10/30/2026",
      readyTime: "2:30 PM",
      truckerName: "Trucker LLC",
      awb: "045-54066773",
    });
    assert.equal(p.kind, "pickup");
    assert.equal(p.externalId, "PU-0007");
    assert.equal(p.from, "Shipper Inc, 100 NW 1st St, Miami FL");
    assert.equal(p.to, "ACK Warehouse");
    assert.equal(p.tripDate, "2026-10-30");
    assert.equal(p.pickupTime, "14:30");
    assert.equal(p.personRequesting, "Ana");
    assert.equal(p.awbLines[0].awbNumber, "PU-0007"); // the AWB itself stays on the delivery trip
    assert.equal(p.awbLines[0].qtyPieces, 3);
    assert.match(p.notes ?? "", /AWB reservado: 045-54066773/);
  });

  it("a cargo-ready guía goes from the warehouse to the airline with its documents", () => {
    const p = deliveryTripPayload({
      id: "guia1",
      awb: "045-54066773",
      clientLabel: "Ivi Logistics",
      carrierName: "AVIANCA",
      destination: "BOG",
      flightNumber: "AV 11",
      flightDate: "2026-10-31",
      bup: false,
      dgDeclarable: true,
      unNumbers: "UN3481, UN1950",
      lines: [
        { pieces: 2, grossWeight: 100, kgLb: "K" },
        { pieces: 1, grossWeight: 220.462, kgLb: "L" },
      ],
      documents: [{ slot: "awb", name: "a.pdf", contentBase64: "AAAA" }],
    });
    assert.equal(p.kind, "delivery");
    assert.equal(p.externalId, "guia1");
    assert.equal(p.from, "ACK Warehouse");
    assert.equal(p.to, "AVIANCA");
    assert.equal(p.awbLines[0].qtyPieces, 3);
    assert.equal(p.awbLines[0].kilograms, 200); // 100 kg + 220.462 lb
    assert.equal(p.awbLines[0].hazmat, true);
    assert.equal(p.awbLines[0].unNumber, "UN3481");
    assert.equal(p.awbLines[0].documents?.length, 1);
  });
});

describe("ACK Freight link: sending", () => {
  const reply = (status: number, body: object) => async () => ({ status, json: async () => body });
  const env = { ACK_FREIGHT_INTAKE_SECRET: "s3cret" };

  it("does nothing, quietly, when the link is not configured", async () => {
    const r = await sendTripRequest(payload, { env: {}, fetchImpl: reply(201, {}) });
    assert.equal(r.state, "skipped");
  });

  it("reports created, already there, and refused", async () => {
    assert.equal((await sendTripRequest(payload, { env, fetchImpl: reply(201, { id: "x", created: true }) })).state, "sent");
    assert.equal((await sendTripRequest(payload, { env, fetchImpl: reply(200, { id: "x", created: false }) })).state, "exists");
    const refused = await sendTripRequest(payload, { env, fetchImpl: reply(422, { error: "customer_not_found", message: "Sin cliente" }) });
    assert.equal(refused.state, "failed");
    assert.equal(refused.message, "Sin cliente");
    assert.equal((await sendTripRequest(payload, { env, fetchImpl: reply(401, { error: "Unauthorized" }) })).state, "failed");
  });

  it("sends the secret as a header and the payload as JSON, and never throws", async () => {
    let seen: { headers: Record<string, string>; body: string } | null = null;
    await sendTripRequest(payload, {
      env,
      fetchImpl: async (_url, init) => {
        seen = { headers: init.headers, body: init.body };
        return { status: 201, json: async () => ({ id: "x" }) };
      },
    });
    assert.equal(seen!.headers["x-guias-secret"], "s3cret");
    assert.equal(JSON.parse(seen!.body).externalId, "PU-0007");
    const down = await sendTripRequest(payload, {
      env,
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });
    assert.equal(down.state, "failed");
  });
});
