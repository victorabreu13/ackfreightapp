const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  agreementHasRates,
  cleanAgreement,
  offerForDriver,
  publicOffer,
  resolveAgreement,
} = require("../driverPay");
const { estimateRoute, haversineMiles } = require("../routeEstimate");

const airportUld = {
  from: "MIA airport",
  to: "Doral warehouse",
  pickupTime: "23:30",
  type: "AKE",
  qtyPieces: 2,
  hazmat: true,
  quotedAmount: 200,
  miles: 10,
  milesApproximate: false,
};

describe("offerForDriver", () => {
  it("pays a percent of the quote without revealing the quote or the percent", () => {
    const offer = offerForDriver({ percentOfQuote: 40 }, null, airportUld, null);
    assert.equal(offer.amount, 80);
    assert.equal(offer.breakdown[0].label, "Trip pay");
    const encoded = JSON.stringify(publicOffer(offer));
    assert.equal(encoded.includes("200"), false);
    assert.equal(encoded.includes("40"), false);
  });

  it("pays a flat amount for ULD, skid, and airport trips", () => {
    const agreement = { flatByType: { uld: 70, skid: 45, airport: 90 } };
    assert.equal(offerForDriver(agreement, null, { ...airportUld, from: "Warehouse A", to: "Warehouse B" }, null).amount, 70);
    assert.equal(
      offerForDriver(agreement, null, { from: "A", to: "B", type: "Skid", qtyPieces: 1, quotedAmount: null }, null).amount,
      45
    );
    assert.equal(offerForDriver(agreement, null, { from: "MIA", to: "Port", type: "Loose", qtyPieces: 1 }, null).amount, 90);
  });

  it("adds base, per mile, and per ULD or skid", () => {
    const agreement = { base: 20, perMile: 2, perUld: 15, perSkid: 8 };
    const uld = offerForDriver(agreement, null, { from: "A", to: "B", type: "PMC", qtyPieces: 2, miles: 10 }, null);
    assert.equal(uld.amount, 20 + 20 + 30);
    const skid = offerForDriver(agreement, null, { from: "A", to: "B", type: "Skid", qtyPieces: 3, miles: 4 }, null);
    assert.equal(skid.amount, 20 + 8 + 24);
  });

  it("adds hazmat, after-hours, and wait time", () => {
    const agreement = {
      base: 10,
      extras: { hazmat: 25, afterHours: 15, afterHoursStart: "22:00", afterHoursEnd: "06:00", waitFreeMinutes: 30, waitPer15Min: 12 },
    };
    const offer = offerForDriver(
      agreement,
      null,
      { from: "A", to: "B", type: "Loose", pickupTime: "23:00", hazmat: true, minutesWaiting: 50 },
      null
    );
    // 10 base + 25 hazmat + 15 after hours + 2 blocks of wait (50 - 30 = 20 min)
    assert.equal(offer.amount, 10 + 25 + 15 + 24);
  });

  it("uses the company default only when the driver has no rates", () => {
    const company = { flatByType: { uld: 50, skid: 50, airport: 50 } };
    const blank = cleanAgreement({});
    assert.equal(agreementHasRates(blank), false);
    assert.equal(offerForDriver(blank, company, { from: "A", to: "B", type: "AKE", qtyPieces: 1 }, null).amount, 50);
    assert.equal(offerForDriver({ flatByType: { uld: 80 } }, company, { from: "A", to: "B", type: "AKE", qtyPieces: 1 }, null).amount, 80);
  });

  it("is unset when nobody has rates, until dispatch overrides", () => {
    const unset = offerForDriver(null, null, airportUld, null);
    assert.equal(unset.status, "unset");
    assert.equal(unset.amount, null);
    const overridden = offerForDriver(null, null, airportUld, { amount: 65 });
    assert.equal(overridden.amount, 65);
    assert.equal(overridden.source, "override");
    assert.equal(overridden.breakdown[0].label, "Set by dispatch");
  });

  it("shows two drivers different pay for the same job", () => {
    const job = { from: "MIA cargo", to: "Medley", type: "AKE", qtyPieces: 1, quotedAmount: 100, miles: 12 };
    const dee = offerForDriver({ percentOfQuote: 50 }, null, job, null);
    const sam = offerForDriver({ base: 30, perMile: 1 }, null, job, null);
    assert.equal(dee.amount, 50);
    assert.equal(sam.amount, 42);
    assert.notEqual(dee.amount, sam.amount);
    assert.equal(resolveAgreement({ percentOfQuote: 50 }, { base: 1 }).percentOfQuote, 50);
    assert.equal(resolveAgreement(cleanAgreement({}), { base: 30 }).base, 30);
  });
});

describe("estimateRoute", () => {
  it("uses Distance Matrix miles when a key is configured", async () => {
    const fetchImpl = async (url) => {
      if (String(url).includes("distancematrix")) {
        return {
          ok: true,
          json: async () => ({
            status: "OK",
            rows: [{ elements: [{ status: "OK", distance: { value: 16093 }, duration: { value: 1200 } }] }],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ results: [{ geometry: { location: { lat: 25.8, lng: -80.3 } } }] }),
      };
    };
    const route = await estimateRoute("MIA", "Doral", "test-key", fetchImpl);
    assert.equal(route.approximate, false);
    assert.equal(route.miles, 10);
    assert.equal(route.driveMinutes, 20);
    assert.equal(route.destination.lat, 25.8);
  });

  it("falls back to straight-line miles when no key is configured", async () => {
    const fetchImpl = async (url) => {
      const miami = String(url).includes("MIA");
      return {
        ok: true,
        json: async () => [{ lat: miami ? "25.7959" : "25.8195", lon: miami ? "-80.2870" : "-80.3553" }],
      };
    };
    const route = await estimateRoute("MIA airport", "Doral warehouse", "", fetchImpl);
    assert.equal(route.approximate, true);
    assert.ok(route.miles > 0);
    assert.ok(route.miles < 15);
  });

  it("measures a known straight line", () => {
    const miles = haversineMiles({ lat: 25.7617, lng: -80.1918 }, { lat: 26.1224, lng: -80.1373 });
    assert.ok(miles > 20 && miles < 30);
  });
});
