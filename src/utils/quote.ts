import { AwbLine, DriverPayType } from "../types";

export interface QuoteSnapshot {
  quotedAmount: number | null;
  quoteStatus: "quoted" | "no quote";
  quoteBasis: DriverPayType | null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

// Same formula as functions/quote.js. Preview only — the server stamps the
// stored quote when the request is created.
export function quoteForRequest(
  profile: { billRate?: number | null; billType?: string | null } | null | undefined,
  awbLines: Pick<AwbLine, "kilograms">[]
): QuoteSnapshot {
  const rate = profile && typeof profile.billRate === "number" ? profile.billRate : null;
  const basis = profile?.billType;
  const usable = rate != null && rate > 0 && (basis === "perTrip" || basis === "perKilogram");
  if (!usable) {
    return { quotedAmount: null, quoteStatus: "no quote", quoteBasis: null };
  }
  if (basis === "perTrip") {
    return { quotedAmount: roundMoney(rate), quoteStatus: "quoted", quoteBasis: "perTrip" };
  }
  const kilograms = (awbLines || []).reduce((sum, line) => sum + (Number(line?.kilograms) || 0), 0);
  return {
    quotedAmount: roundMoney(rate * kilograms),
    quoteStatus: "quoted",
    quoteBasis: "perKilogram",
  };
}

export function formatQuote(quote: {
  quotedAmount?: number | null;
  quoteStatus?: string | null;
  quoteBasis?: string | null;
}): string {
  if (quote.quoteStatus === "no quote" || quote.quotedAmount == null) return "No quote";
  const amount = `$${Number(quote.quotedAmount).toFixed(2)}`;
  if (quote.quoteBasis === "perKilogram") return `${amount} (per kg)`;
  if (quote.quoteBasis === "perTrip") return `${amount} (per trip)`;
  return amount;
}
