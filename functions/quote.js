// Snapshot of the customer's existing billing rate at submit time.
// No lane prices: per trip uses billRate once, per kilogram uses billRate × total kg.
// Missing or unusable rate is "no quote".

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function quoteForRequest(profile, awbLines) {
  const rate = profile && typeof profile.billRate === "number" ? profile.billRate : null;
  const basis = profile && profile.billType;
  const usable =
    rate != null && rate > 0 && (basis === "perTrip" || basis === "perKilogram");
  if (!usable) {
    return { quotedAmount: null, quoteStatus: "no quote", quoteBasis: null };
  }
  if (basis === "perTrip") {
    return { quotedAmount: roundMoney(rate), quoteStatus: "quoted", quoteBasis: "perTrip" };
  }
  const kilograms = (awbLines || []).reduce(
    (sum, line) => sum + (Number(line && line.kilograms) || 0),
    0
  );
  return {
    quotedAmount: roundMoney(rate * kilograms),
    quoteStatus: "quoted",
    quoteBasis: "perKilogram",
  };
}

module.exports = { quoteForRequest, roundMoney };
