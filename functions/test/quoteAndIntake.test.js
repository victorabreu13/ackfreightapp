const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { quoteForRequest } = require("../quote");
const { intakeAuthorized, rateLimitDecision, validateIntakePayload } = require("../intake");

describe("quoteForRequest", () => {
  it("uses the per-trip rate once", () => {
    const quote = quoteForRequest({ billType: "perTrip", billRate: 150 }, [
      { kilograms: 10 },
      { kilograms: 5 },
    ]);
    assert.equal(quote.quoteStatus, "quoted");
    assert.equal(quote.quoteBasis, "perTrip");
    assert.equal(quote.quotedAmount, 150);
  });

  it("multiplies the per-kilogram rate by total weight", () => {
    const quote = quoteForRequest({ billType: "perKilogram", billRate: 2.5 }, [
      { kilograms: 10 },
      { kilograms: 1.5 },
    ]);
    assert.equal(quote.quotedAmount, 28.75);
    assert.equal(quote.quoteBasis, "perKilogram");
  });

  it("stores no quote when the customer has no usable rate", () => {
    assert.equal(quoteForRequest(null, []).quoteStatus, "no quote");
    assert.equal(quoteForRequest({ billType: "perTrip" }, []).quotedAmount, null);
    assert.equal(quoteForRequest({ billType: "perTrip", billRate: 0 }, []).quoteStatus, "no quote");
  });
});

describe("website intake", () => {
  it("accepts a shared secret or a verified reCAPTCHA token", () => {
    assert.equal(
      intakeAuthorized({
        providedSecret: "sekret",
        expectedSecret: "sekret",
        recaptchaConfigured: false,
        recaptchaPassed: false,
      }),
      true
    );
    assert.equal(
      intakeAuthorized({
        providedSecret: "nope",
        expectedSecret: "sekret",
        recaptchaConfigured: true,
        recaptchaPassed: true,
      }),
      true
    );
    assert.equal(
      intakeAuthorized({
        providedSecret: "",
        expectedSecret: "",
        recaptchaConfigured: false,
        recaptchaPassed: false,
      }),
      false
    );
  });

  it("rate limits bursts from the same caller", () => {
    const now = 1_000_000;
    let stamps = [];
    for (let i = 0; i < 8; i++) {
      const decision = rateLimitDecision(stamps, now + i);
      assert.equal(decision.allowed, true);
      stamps = decision.timestamps;
    }
    const blocked = rateLimitDecision(stamps, now + 9);
    assert.equal(blocked.allowed, false);
    const later = rateLimitDecision(stamps, now + 60 * 60 * 1000 + 1);
    assert.equal(later.allowed, true);
  });

  it("requires contact and route fields", () => {
    const bad = validateIntakePayload({ email: "not-an-email", from: "MIA" });
    assert.equal(bad.ok, false);
    const good = validateIntakePayload({
      contactName: "Pat",
      email: "Pat@Example.com",
      from: "MIA",
      to: "Warehouse",
      hazmat: true,
      unNumber: "UN1993",
      hazmatClass: "3",
      kilograms: "12",
    });
    assert.equal(good.ok, true);
    assert.equal(good.lead.email, "pat@example.com");
    assert.equal(good.lead.hazmat, true);
    assert.equal(good.lead.unNumber, "UN1993");
    assert.equal(good.lead.status, "pending");
  });
});