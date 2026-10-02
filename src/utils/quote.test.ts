import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatQuote, quoteForRequest } from "./quote";

describe("quoteForRequest", () => {
  it("charges the trip rate once", () => {
    const quote = quoteForRequest({ billType: "perTrip", billRate: 150 }, [{ kilograms: 40 }, { kilograms: 10 }]);
    assert.deepEqual(quote, { quotedAmount: 150, quoteStatus: "quoted", quoteBasis: "perTrip" });
  });

  it("multiplies the kilogram rate by total weight", () => {
    const quote = quoteForRequest({ billType: "perKilogram", billRate: 2.5 }, [{ kilograms: 10 }, { kilograms: 1.5 }]);
    assert.equal(quote.quotedAmount, 28.75);
    assert.equal(quote.quoteBasis, "perKilogram");
  });

  it("is no quote when the customer has no usable rate", () => {
    assert.equal(quoteForRequest({ billType: "perTrip", billRate: 0 }, []).quoteStatus, "no quote");
    assert.equal(quoteForRequest(null, [{ kilograms: 10 }]).quotedAmount, null);
    assert.equal(formatQuote({ quoteStatus: "no quote", quotedAmount: null }), "No quote");
  });
});
