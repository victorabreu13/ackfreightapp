/** How the accounting shows money and dates. */

export function usd(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

/** A date as MM/DD/YY, the way the Sheet showed it. */
export function shortDate(date: Date | null | undefined): string {
  if (!date) return "—";
  const parts = date.toISOString().slice(0, 10).split("-");
  return `${parts[1]}/${parts[2]}/${parts[0].slice(2)}`;
}

export function isoDay(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

/** The first and the last day after a month, as dates, for "2026-10". Null when it is not a month. */
export function monthRange(value: string): { from: Date; to: Date } | null {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { from: new Date(Date.UTC(year, month - 1, 1)), to: new Date(Date.UTC(year, month, 1)) };
}

/** The commission status of a shipment: owed while any person of the team still has to be paid. */
export function commissionStatus(splits: Array<{ payee: string; paid: boolean }>, houses: ReadonlySet<string>): "Owed" | "Paid" | "—" {
  const people = splits.filter((split) => !houses.has(split.payee));
  if (people.length === 0) return "—";
  return people.some((split) => !split.paid) ? "Owed" : "Paid";
}
