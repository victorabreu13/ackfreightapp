import assert from "node:assert/strict";
import test from "node:test";
import { csvCell, filtersFrom, presets, reportCsv, rubroReport, salesReport, weightReport, type ReportShipment } from "@/lib/guias/acct-reports";

const base: ReportShipment = {
  date: new Date("2026-11-04T00:00:00Z"), client: "PACIFIKO", dest: "GUA", airline: "LATAM", pcs: 6, gross: 1018, chw: 1550.36,
  airSold: 2402.86, airCost: 1798.42, pickupSold: 152.7, pickupCost: 40, handlingSold: 203.6, handlingCost: 100, transferSold: 152.7, transferCost: 0,
  insuranceSold: 0, insuranceCost: 0, aes: 0, awbFee: 50, kopeHandling: 155.04, kopeInCost: true, invoiced: 0, costTotal: 0, profit: 0,
};
const sale = (over: Partial<ReportShipment>): ReportShipment => {
  const row = { ...base, ...over };
  const invoiced = Math.round((row.airSold + row.pickupSold + row.handlingSold + row.transferSold + row.insuranceSold + row.aes + row.awbFee) * 100) / 100;
  const costTotal = Math.round((row.airCost + row.pickupCost + row.handlingCost + row.transferCost + row.insuranceCost + (row.kopeInCost ? row.kopeHandling : 0)) * 100) / 100;
  return { ...row, invoiced, costTotal, profit: Math.round((invoiced - costTotal) * 100) / 100, ...over };
};

const rows = [
  sale({}),
  sale({ client: "DIAGOMEX", dest: "SJO", gross: 200, chw: 300, pcs: 2, date: new Date("2026-12-02T00:00:00Z") }),
  sale({ dest: "GUA", gross: 100.255, chw: 120.5, pcs: 1 }),
];

test("kilos are added by destination, the heaviest first, with a total", () => {
  const { rows: byDest, total } = weightReport(rows, "destination");
  assert.deepEqual(byDest.map((row) => row.key), ["GUA", "SJO"]);
  assert.equal(byDest[0].shipments, 2);
  assert.equal(byDest[0].gross, 1118.26);
  assert.equal(byDest[0].chw, 1670.86);
  assert.equal(total.gross, 1318.26);
  assert.equal(total.chw, 1970.86);
  assert.equal(total.pcs, 9);
  assert.equal(total.shipments, 3);
});

test("kilos by client and by month", () => {
  assert.deepEqual(weightReport(rows, "client").rows.map((row) => row.key), ["PACIFIKO", "DIAGOMEX"]);
  assert.deepEqual(weightReport(rows, "month").rows.map((row) => row.key), ["2026-11", "2026-12"]);
});

test("sales, cost and profit by group add up to the total, and the margin is the profit over the sales", () => {
  const { rows: byClient, total } = salesReport(rows, "client");
  assert.equal(byClient.length, 2);
  assert.equal(Math.round(byClient.reduce((sum, row) => sum + row.profit, 0) * 100) / 100, total.profit);
  assert.equal(total.sales, Math.round(rows.reduce((sum, row) => sum + row.invoiced, 0) * 100) / 100);
  assert.equal(total.margin, Math.round((total.profit / total.sales) * 10000) / 100);
});

test("the rubros give sales and cost of each charge and match the totals of the shipments", () => {
  const { rows: rubros, total } = rubroReport(rows);
  const labels = rubros.map((row) => row.label);
  assert.deepEqual(labels, ["Air freight", "Pickup", "Handling", "Transfer", "AWB fee", "Kope handling"]);
  assert.equal(rubros[0].sold, Math.round(base.airSold * 3 * 100) / 100);
  assert.equal(rubros.at(-1)?.cost, Math.round(base.kopeHandling * 3 * 100) / 100);
  assert.equal(Math.round(rubros.reduce((sum, row) => sum + row.sold, 0) * 100) / 100, total.sold);
  assert.equal(Math.round(rubros.reduce((sum, row) => sum + row.cost, 0) * 100) / 100, total.cost);
});

test("an invoice total typed by hand shows as its own adjustment row", () => {
  const typed = sale({ invoiced: 5000, profit: 0 });
  const { rows: rubros, total } = rubroReport([typed]);
  assert.equal(rubros.at(-1)?.label, "Adjustments (typed totals)");
  assert.equal(total.sold, 5000);
  assert.equal(Math.round(rubros.reduce((sum, row) => sum + row.sold, 0) * 100) / 100, 5000);
});

test("Kope handling is not a cost when the client does not count it", () => {
  const { rows: rubros } = rubroReport([sale({ kopeInCost: false })]);
  assert.equal(rubros.some((row) => row.label === "Kope handling"), false);
});

test("the filters default to this month, and empty dates mean all time", () => {
  assert.deepEqual(filtersFrom({}, "2026-11-18"), { from: "2026-11-01", to: "2026-11-18", client: "", dest: "", airline: "", groupBy: "destination" });
  const all = filtersFrom({ from: "", to: "", dest: " gua ", groupBy: "client" }, "2026-11-18");
  assert.equal(all.from, "");
  assert.equal(all.to, "");
  assert.equal(all.dest, "GUA");
  assert.equal(all.groupBy, "client");
  assert.equal(filtersFrom({ from: "nonsense" }, "2026-11-18").from, "2026-11-01");
});

test("the ready-made periods", () => {
  const list = presets("2026-01-15");
  assert.deepEqual(list[0], { label: "This month", from: "2026-01-01", to: "2026-01-15" });
  assert.deepEqual(list[1], { label: "Last month", from: "2025-12-01", to: "2025-12-31" });
  assert.deepEqual(list[3], { label: "All time", from: "", to: "" });
  assert.equal(presets("2026-03-10")[1].to, "2026-02-28");
});

test("CSV cells are quoted when they need it, and each report has a header and a total row", () => {
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell("plain"), "plain");
  const lines = reportCsv("weight", rows, "destination").trim().split("\r\n");
  assert.equal(lines[0], "Destination,Shipments,Pieces,Gross kg,Chargeable kg");
  assert.equal(lines.at(-1), "Total,3,9,1318.26,1970.86");
  assert.equal(reportCsv("rubro", rows, "client").split("\r\n")[0], "Rubro,Sales,Cost,Profit");
  assert.equal(reportCsv("sales", rows, "month").split("\r\n")[0], "Month,Shipments,Sales,Cost,Profit,Margin %");
});
