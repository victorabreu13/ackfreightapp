import { cents } from "@/lib/guias/acct-engine";

/** The lines of the invoice to a client, made from the numbers of its accounting row. */

export type InvoiceLineDraft = {
  /** YYYY-MM-DD, or null when the line has no date of its own. */
  serviceDate: string | null;
  product: string;
  description: string;
  qty: number;
  rate: number;
  amount: number;
};

export type ShipmentForInvoice = {
  awb: string;
  dest: string;
  /** The weight the air freight is charged on. */
  chw: number;
  sellRate: number | null;
  airSold: number;
  pickupSold: number;
  handlingSold: number;
  transferSold: number;
  insuranceSold: number;
  aes: number;
  awbFee: number;
  invoicedOverride: number | null;
  uldText: string | null;
};

export type InvoiceContext = {
  /** The airport code of the origin, like MIA. */
  origin: string;
  /** The day of the shipment, which dates every line but the pickup. */
  date: string;
  /** The day the pickup was made, when it is known. */
  pickupDate?: string | null;
  /** Who was picked up and where, printed under PICKUP. */
  pickupDescription?: string;
};

/** An AWB as it is printed: 045-56631411. Anything that is not 11 digits is left as it was typed. */
export function awbPrinted(awb: string): string {
  const digits = awb.replace(/\D/g, "");
  return digits.length === 11 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : awb.trim();
}

/** The lines that are charged, in the order of the example invoice. A charge of $0 is not a line. */
export function invoiceLinesFor(shipment: ShipmentForInvoice, context: InvoiceContext): InvoiceLineDraft[] {
  const lines: InvoiceLineDraft[] = [];
  const flat = (product: string, amount: number, description = "", serviceDate: string | null = context.date) => {
    if (amount > 0) lines.push({ serviceDate, product, description, qty: 1, rate: cents(amount), amount: cents(amount) });
  };
  flat("PICKUP", shipment.pickupSold, context.pickupDescription ?? "", context.pickupDate || context.date);
  flat("HANDLING", shipment.handlingSold, shipment.uldText ?? "");
  flat("AIRPORT TRANSFER", shipment.transferSold);
  if (shipment.airSold > 0) {
    const qty = shipment.chw > 0 ? shipment.chw : 1;
    const rate = shipment.sellRate ?? (shipment.chw > 0 ? shipment.airSold / shipment.chw : shipment.airSold);
    lines.push({
      serviceDate: context.date,
      product: "AIRFREIGHT",
      description: `${context.origin}-${shipment.dest} AWB ${awbPrinted(shipment.awb)}`,
      qty,
      rate: Math.round(rate * 10000) / 10000,
      amount: cents(shipment.airSold),
    });
  }
  flat("AES", shipment.aes);
  flat("INSURANCE", shipment.insuranceSold, "Cargo insurance");
  flat("AWB", shipment.awbFee);
  // A total typed by hand in the accounting row is what the client owes, so the difference shows as its own line.
  if (shipment.invoicedOverride != null) {
    const difference = cents(shipment.invoicedOverride - totalOf(lines));
    if (difference !== 0) lines.push({ serviceDate: context.date, product: "ADJUSTMENT", description: "", qty: 1, rate: difference, amount: difference });
  }
  return lines;
}

export function totalOf(lines: Array<{ amount: number }>): number {
  return cents(lines.reduce((sum, line) => sum + line.amount, 0));
}

/** The amount of a line from what is typed: quantity times rate, to the cent. */
export function amountOf(qty: number, rate: number): number {
  return cents(qty * rate);
}

/** The due date: the invoice date and the days of the terms (10 for ACK). */
export function dueDateFor(invoiceDate: string, days = 10): string {
  const date = new Date(`${invoiceDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** A day typed as YYYY-MM-DD, M/D/YYYY or M/D/YY, as YYYY-MM-DD; null when it is not a day. */
export function dayFrom(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  let parts: [number, number, number] | null = null;
  if (iso) parts = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (us) parts = [Number(us[3].length === 2 ? `20${us[3]}` : us[3]), Number(us[1]), Number(us[2])];
  if (!parts) return null;
  const [year, month, dayOfMonth] = parts;
  const check = new Date(Date.UTC(year, month - 1, dayOfMonth));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== dayOfMonth) return null;
  return check.toISOString().slice(0, 10);
}

/** The emails of a box where they are typed one per line or separated by commas or semicolons, without repeats. */
export function emailsFrom(value: string | null | undefined): string[] {
  const seen = new Set<string>();
  const found: string[] = [];
  for (const piece of (value ?? "").split(/[\s,;]+/)) {
    const email = piece.trim().toLowerCase();
    if (!email || seen.has(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    seen.add(email);
    found.push(email);
  }
  return found;
}
