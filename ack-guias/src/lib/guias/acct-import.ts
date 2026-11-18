/** Reads the Shipments tab of the Google Sheet of the accounting, saved as CSV, into shipments for the accounting. */

/** A CSV as rows of text. Quotes can hold commas, line breaks and doubled quotes. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

export type ImportedSplit = { payee: string; pct: number; paid: boolean; paidDate: string | null };

export type ImportedShipment = {
  legacyId: string;
  date: string;
  client: string;
  awb: string;
  awb2: string | null;
  airline: string;
  dest: string;
  uldText: string | null;
  pcs: number;
  gross: number;
  chw: number;
  cargoValue: number;
  invoiceNo: string | null;
  clientPaid: boolean;
  costRate: number | null;
  sellRate: number | null;
  airCost: number;
  airSold: number;
  pickupCost: number;
  pickupSold: number;
  /** What handling costs: the ULDs, and the BUP. The Sheet called the handling of a ULD its transfer. */
  handlingCost: number;
  handlingSold: number;
  transferCost: number;
  transferSold: number;
  kopeHandling: number;
  kopeInCost: boolean;
  insuranceCost: number;
  insuranceSold: number;
  aes: number;
  awbFee: number;
  invoicedOverride: number | null;
  costTotal: number;
  invoiced: number;
  profit: number;
  note: string | null;
  manualFields: string | null;
  updatedAt: string;
  splits: ImportedSplit[];
};

export type ImportResult = {
  shipments: ImportedShipment[];
  skipped: Array<{ awb: string; reason: string }>;
};

const number = (value: string | undefined): number => {
  const parsed = Number(String(value ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const optionalNumber = (value: string | undefined): number | null => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text.replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const flag = (value: string | undefined) => String(value ?? "").trim().toUpperCase() === "TRUE";
const text = (value: string | undefined) => String(value ?? "").trim();

/** PACIFIKO for pacifiko, CCS RSO for ccs-rso. */
export function clientName(value: string): string {
  return text(value).replace(/[-_]+/g, " ").replace(/\s+/g, " ").toUpperCase();
}

/** The name of a person of the team: victor is Victor, and ack is ACK, the house. */
export function payeeName(value: string): string {
  const name = text(value);
  if (name.toLowerCase() === "ack") return "ACK";
  return name ? name[0].toUpperCase() + name.slice(1).toLowerCase() : "";
}

/** The ULDs of a shipment as "1×FQA, 1×PMC", and "Loose" when there are none. */
export function uldLabel(uld: string, ulds: string): string | null {
  try {
    const list = JSON.parse(ulds || "[]") as Array<{ type?: string; qty?: number }>;
    const parts = list.filter((item) => item.type).map((item) => `${item.qty ?? 1}×${String(item.type).toUpperCase()}`);
    if (parts.length) return parts.join(", ");
  } catch {
    // Not a list: the text of the column is used.
  }
  const label = text(uld);
  if (!label || label.toUpperCase() === "LOOSE") return "Loose";
  if (/^\d+×/.test(label)) return label;
  return `1×${label.toUpperCase()}`;
}

function splitsFrom(value: string): ImportedSplit[] {
  try {
    const list = JSON.parse(value || "[]") as Array<{ payee?: string; pct?: number; paid?: boolean; paidDate?: string }>;
    return list
      .filter((item) => item.payee && Number(item.pct) > 0)
      .map((item) => ({ payee: payeeName(item.payee ?? ""), pct: Number(item.pct), paid: Boolean(item.paid), paidDate: item.paidDate && /^\d{4}-\d{2}-\d{2}/.test(item.paidDate) ? item.paidDate.slice(0, 10) : null }));
  } catch {
    return [];
  }
}

/**
 * Every shipment of the CSV. A row with no real date (the Sheet shows an empty date as 1899-12-30) is left out, and
 * when an AWB is on the list twice the one edited last is kept, since it is the corrected one.
 */
export function shipmentsFromCsv(input: string): ImportResult {
  const rows = parseCsv(input);
  const head = rows[0] ?? [];
  const records = rows
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row) => Object.fromEntries(head.map((name, index) => [name.trim(), row[index] ?? ""])) as Record<string, string>);
  const skipped: ImportResult["skipped"] = [];
  const valid: ImportedShipment[] = [];
  for (const record of records) {
    const awb = text(record.awb);
    const date = text(record.date).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number(date.slice(0, 4)) < 2000) {
      skipped.push({ awb, reason: "no valid date" });
      continue;
    }
    if (!awb) {
      skipped.push({ awb, reason: "no AWB" });
      continue;
    }
    const awb2 = text(record.awb2);
    valid.push({
      legacyId: text(record.id) || `${clientName(record.client)}-${awb}-${date}`,
      date,
      client: clientName(record.client),
      awb,
      awb2: awb2 && awb2 !== awb ? awb2 : null,
      airline: text(record.airline).toUpperCase(),
      dest: text(record.dest).toUpperCase(),
      uldText: uldLabel(record.uld, record.ulds),
      pcs: Math.round(number(record.pcs)),
      gross: number(record.gross),
      chw: number(record.chw),
      cargoValue: number(record.value),
      invoiceNo: text(record.invoiceNo) || null,
      clientPaid: flag(record.clientPaid),
      costRate: optionalNumber(record.costRate),
      sellRate: optionalNumber(record.sellRate),
      airCost: number(record.cost),
      airSold: number(record.sold),
      pickupCost: number(record.pickupCost),
      pickupSold: number(record.pickupSold),
      // The Sheet called the handling of a ULD its transfer, and kept the BUP handling apart: both are handling.
      handlingCost: number(record.transferCost) + number(record.bupHandling),
      handlingSold: number(record.handlingSold),
      transferCost: 0,
      transferSold: number(record.transferSold),
      kopeHandling: number(record.kopeHandling),
      kopeInCost: flag(record.kopeInCost),
      insuranceCost: number(record.insuranceCost),
      insuranceSold: number(record.insuranceSold),
      aes: number(record.aes),
      awbFee: number(record.awbFee),
      invoicedOverride: optionalNumber(record.invoicedOverride),
      costTotal: number(record.costTotal),
      invoiced: number(record.invoiced),
      profit: number(record.profit),
      note: text(record.note) || null,
      manualFields: text(record.manualFields) || null,
      updatedAt: text(record.updatedAt),
      splits: splitsFrom(record.splits),
    });
  }
  // The same AWB twice is a duplicate: the one edited last stays.
  const latest = new Map<string, ImportedShipment>();
  for (const shipment of valid) {
    const known = latest.get(shipment.awb);
    if (!known) latest.set(shipment.awb, shipment);
    else if (shipment.updatedAt > known.updatedAt) {
      skipped.push({ awb: known.awb, reason: "duplicate AWB, the one edited last was kept" });
      latest.set(shipment.awb, shipment);
    } else skipped.push({ awb: shipment.awb, reason: "duplicate AWB, the one edited last was kept" });
  }
  return { shipments: valid.filter((shipment) => latest.get(shipment.awb) === shipment), skipped };
}

/** What a person earns from a shipment: their share of its profit. */
export function commissionOf(profit: number, pct: number): number {
  return Math.round(profit * pct) / 100;
}
