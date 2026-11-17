/** Airline rates: what an airline charges ACK (buy) and what ACK charges (sell), in dollars per kilo, to a destination. */

/** An airport code: three letters, upper case. Anything else is not a destination. */
export function normalizeDestination(value: string): string | null {
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

/** The name of an airline, trimmed and with single spaces. */
export function normalizeAirline(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export type RateParse = { ok: true; value: number | null } | { ok: false };

/**
 * A rate typed in a form. Empty clears it. A dollar sign and thousands commas are accepted. A negative number or
 * something that is not a number is refused.
 */
export function parseRate(value: string): RateParse {
  let raw = value.replace(/[$\s]/g, "");
  // 1,55 is a decimal comma, as it is written in Spanish. 1,234.50 has thousands commas.
  raw = /^\d+,\d{1,2}$/.test(raw) ? raw.replace(",", ".") : raw.replace(/,/g, "");
  if (!raw) return { ok: true, value: null };
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return { ok: false };
  return { ok: true, value: Math.round(parsed * 10000) / 10000 };
}

/** What ACK keeps per kilo: the sell rate less the buy rate. Unknown until both are set. */
export function rateMargin(sell: number | null, buy: number | null): number | null {
  if (sell == null || buy == null) return null;
  return Math.round((sell - buy) * 10000) / 10000;
}

/** A rate as dollars, with the cents the airlines quote. */
export function formatRate(value: number | null): string {
  return value == null ? "" : value.toFixed(2);
}
