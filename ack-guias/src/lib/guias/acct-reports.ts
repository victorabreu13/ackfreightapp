import { cents } from "@/lib/guias/acct-engine";

/** The reports of the accounting: weights, sales and costs, from the shipments of a period. */

export type ReportShipment = {
  date: Date;
  client: string;
  dest: string;
  airline: string;
  pcs: number;
  gross: number;
  chw: number;
  airSold: number;
  airCost: number;
  pickupSold: number;
  pickupCost: number;
  handlingSold: number;
  handlingCost: number;
  transferSold: number;
  transferCost: number;
  insuranceSold: number;
  insuranceCost: number;
  aes: number;
  awbFee: number;
  kopeHandling: number;
  kopeInCost: boolean;
  invoiced: number;
  costTotal: number;
  profit: number;
};

export type GroupBy = "destination" | "client" | "airline" | "month";

export const GROUP_OPTIONS: Array<{ value: GroupBy; label: string }> = [
  { value: "destination", label: "Destination" },
  { value: "client", label: "Client" },
  { value: "airline", label: "Airline" },
  { value: "month", label: "Month" },
];

export function groupByFrom(value: unknown): GroupBy {
  return value === "client" || value === "airline" || value === "month" ? value : "destination";
}

function keyOf(shipment: ReportShipment, groupBy: GroupBy): string {
  if (groupBy === "client") return shipment.client || "—";
  if (groupBy === "airline") return shipment.airline || "—";
  if (groupBy === "month") return shipment.date.toISOString().slice(0, 7);
  return shipment.dest || "—";
}

const sum = (values: number[]) => cents(values.reduce((total, value) => total + value, 0));
const kg = (value: number) => Math.round(value * 100) / 100;

export type WeightRow = { key: string; shipments: number; pcs: number; gross: number; chw: number };

/** Gross and chargeable kilos of each group, the heaviest first (months in order). The last row is the total. */
export function weightReport(shipments: ReportShipment[], groupBy: GroupBy): { rows: WeightRow[]; total: WeightRow } {
  const groups = new Map<string, WeightRow>();
  for (const shipment of shipments) {
    const key = keyOf(shipment, groupBy);
    const row = groups.get(key) ?? { key, shipments: 0, pcs: 0, gross: 0, chw: 0 };
    row.shipments += 1;
    row.pcs += shipment.pcs;
    row.gross += shipment.gross;
    row.chw += shipment.chw;
    groups.set(key, row);
  }
  const rows = [...groups.values()].map((row) => ({ ...row, gross: kg(row.gross), chw: kg(row.chw) }));
  rows.sort((a, b) => (groupBy === "month" ? a.key.localeCompare(b.key) : b.chw - a.chw || a.key.localeCompare(b.key)));
  const total: WeightRow = { key: "Total", shipments: shipments.length, pcs: rows.reduce((t, r) => t + r.pcs, 0), gross: kg(rows.reduce((t, r) => t + r.gross, 0)), chw: kg(rows.reduce((t, r) => t + r.chw, 0)) };
  return { rows, total };
}

export type MoneyRow = { key: string; shipments: number; sales: number; cost: number; profit: number; margin: number };

const marginOf = (sales: number, profit: number) => (sales ? Math.round((profit / sales) * 10000) / 100 : 0);

/** Sales, cost and profit of each group, the biggest sales first (months in order). The last row is the total. */
export function salesReport(shipments: ReportShipment[], groupBy: GroupBy): { rows: MoneyRow[]; total: MoneyRow } {
  const groups = new Map<string, { key: string; shipments: number; sales: number; cost: number; profit: number }>();
  for (const shipment of shipments) {
    const key = keyOf(shipment, groupBy);
    const row = groups.get(key) ?? { key, shipments: 0, sales: 0, cost: 0, profit: 0 };
    row.shipments += 1;
    row.sales += shipment.invoiced;
    row.cost += shipment.costTotal;
    row.profit += shipment.profit;
    groups.set(key, row);
  }
  const rows: MoneyRow[] = [...groups.values()].map((row) => ({ ...row, sales: cents(row.sales), cost: cents(row.cost), profit: cents(row.profit), margin: marginOf(row.sales, row.profit) }));
  rows.sort((a, b) => (groupBy === "month" ? a.key.localeCompare(b.key) : b.sales - a.sales || a.key.localeCompare(b.key)));
  const sales = sum(rows.map((row) => row.sales));
  const profit = sum(rows.map((row) => row.profit));
  return { rows, total: { key: "Total", shipments: shipments.length, sales, cost: sum(rows.map((row) => row.cost)), profit, margin: marginOf(sales, profit) } };
}

export type RubroRow = { label: string; sold: number; cost: number; profit: number };

/**
 * Sales and cost by rubro: air freight, pickup, handling, transfer, insurance, AES, AWB fee and the Kope handling that is
 * counted as cost. A shipment whose invoice total was typed by hand differs from its lines; that difference is its own
 * row, so the totals are those of the shipments.
 */
export function rubroReport(shipments: ReportShipment[]): { rows: RubroRow[]; total: RubroRow } {
  const take = (pick: (shipment: ReportShipment) => number) => sum(shipments.map(pick));
  const rows: RubroRow[] = [
    { label: "Air freight", sold: take((s) => s.airSold), cost: take((s) => s.airCost) },
    { label: "Pickup", sold: take((s) => s.pickupSold), cost: take((s) => s.pickupCost) },
    { label: "Handling", sold: take((s) => s.handlingSold), cost: take((s) => s.handlingCost) },
    { label: "Transfer", sold: take((s) => s.transferSold), cost: take((s) => s.transferCost) },
    { label: "Insurance", sold: take((s) => s.insuranceSold), cost: take((s) => s.insuranceCost) },
    { label: "AES", sold: take((s) => s.aes), cost: 0 },
    { label: "AWB fee", sold: take((s) => s.awbFee), cost: 0 },
    { label: "Kope handling", sold: 0, cost: take((s) => (s.kopeInCost ? s.kopeHandling : 0)) },
  ].map((row) => ({ ...row, profit: cents(row.sold - row.cost) }));
  const sales = take((s) => s.invoiced);
  const cost = take((s) => s.costTotal);
  const adjustment: RubroRow = { label: "Adjustments (typed totals)", sold: cents(sales - sum(rows.map((row) => row.sold))), cost: cents(cost - sum(rows.map((row) => row.cost))), profit: 0 };
  adjustment.profit = cents(adjustment.sold - adjustment.cost);
  const shown = [...rows.filter((row) => row.sold !== 0 || row.cost !== 0), ...(adjustment.sold !== 0 || adjustment.cost !== 0 ? [adjustment] : [])];
  return { rows: shown, total: { label: "Total", sold: sales, cost, profit: cents(sales - cost) } };
}

/** The filters of a report, read from the address: dates as YYYY-MM-DD, and the client, destination and airline to keep. */
export type ReportFilters = { from: string; to: string; client: string; dest: string; airline: string; groupBy: GroupBy };

const isDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());

export function filtersFrom(params: Record<string, string | undefined>, today: string): ReportFilters {
  const first = `${today.slice(0, 8)}01`;
  const from = isDay(params.from ?? "") ? (params.from as string) : params.from === "" ? "" : first;
  const to = isDay(params.to ?? "") ? (params.to as string) : params.to === "" ? "" : today;
  return { from, to, client: (params.client ?? "").trim(), dest: (params.dest ?? "").trim().toUpperCase(), airline: (params.airline ?? "").trim(), groupBy: groupByFrom(params.groupBy) };
}

/** Ready-made periods, as the dates they set. */
export function presets(today: string): Array<{ label: string; from: string; to: string }> {
  const [year, month] = today.split("-").map(Number);
  const pad = (value: number) => String(value).padStart(2, "0");
  const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  return [
    { label: "This month", from: `${year}-${pad(month)}-01`, to: today },
    { label: "Last month", from: `${prev.y}-${pad(prev.m)}-01`, to: `${prev.y}-${pad(prev.m)}-${pad(lastDay(prev.y, prev.m))}` },
    { label: "This year", from: `${year}-01-01`, to: today },
    { label: "All time", from: "", to: "" },
  ];
}

/** One cell of a CSV: quoted when it holds a comma, a quote or a line break. */
export function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: Array<Array<string | number>>): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export type ReportKind = "weight" | "sales" | "rubro";

/** The CSV of a report, with the same numbers the screen shows. */
export function reportCsv(kind: ReportKind, shipments: ReportShipment[], groupBy: GroupBy): string {
  const label = GROUP_OPTIONS.find((option) => option.value === groupBy)?.label ?? "Group";
  if (kind === "weight") {
    const { rows, total } = weightReport(shipments, groupBy);
    return toCsv([label, "Shipments", "Pieces", "Gross kg", "Chargeable kg"], [...rows, total].map((row) => [row.key, row.shipments, row.pcs, row.gross, row.chw]));
  }
  if (kind === "sales") {
    const { rows, total } = salesReport(shipments, groupBy);
    return toCsv([label, "Shipments", "Sales", "Cost", "Profit", "Margin %"], [...rows, total].map((row) => [row.key, row.shipments, row.sales, row.cost, row.profit, row.margin]));
  }
  const { rows, total } = rubroReport(shipments);
  return toCsv(["Rubro", "Sales", "Cost", "Profit"], [...rows, total].map((row) => [row.label, row.sold, row.cost, row.profit]));
}
