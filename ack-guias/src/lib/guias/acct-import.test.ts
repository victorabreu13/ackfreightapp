import assert from "node:assert/strict";
import test from "node:test";
import { clientName, commissionOf, parseCsv, payeeName, shipmentsFromCsv, uldLabel } from "@/lib/guias/acct-import";

const HEAD = "id,date,client,awb,awb2,airline,dest,uld,ulds,pcs,gross,chw,value,invoiceNo,clientPaid,cost,sold,pickupCost,pickupSold,kopeHandling,kopeInCost,bupHandling,handlingSold,transferCost,transferSold,insuranceCost,insuranceSold,aes,awbFee,qbFee,invoicedOverride,splits,note,source,costTotal,invoiced,profit,commissions,updatedAt,updatedBy,manualFields,costRate,sellRate";

const row = (over: Record<string, string>) => {
  const base: Record<string, string> = {
    id: "imp-1", date: "2026-03-18", client: "pacifiko", awb: "045-13069781", awb2: "045-13069781", airline: "latam", dest: "gua", uld: "FQA",
    ulds: '[{"type": "FQA", "qty": 1}]', pcs: "2", gross: "472", chw: "645.31", value: "0", invoiceNo: "1252", clientPaid: "TRUE", cost: "580.779", sold: "838.903",
    pickupCost: "65", pickupSold: "96.7965", kopeHandling: "64.531", kopeInCost: "FALSE", bupHandling: "30", handlingSold: "129.062", transferCost: "35",
    transferSold: "96.7965", insuranceCost: "0", insuranceSold: "0", aes: "0", awbFee: "50", qbFee: "0", invoicedOverride: "",
    splits: '[{"paid": false, "paidDate": "", "payee": "ack", "pct": 50}, {"paid": true, "paidDate": "2026-04-02", "payee": "victor", "pct": 25}, {"paid": true, "paidDate": "", "payee": "pamela", "pct": 25}]',
    note: "", source: "COMISIONES sheet", costTotal: "710.78", invoiced: "1211.56", profit: "500.78", commissions: "", updatedAt: "2026-03-20T10:00:00.000Z", updatedBy: "i", manualFields: "", costRate: "", sellRate: "",
    ...over,
  };
  return HEAD.split(",").map((name) => {
    const value = base[name] ?? "";
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }).join(",");
};

test("a CSV keeps commas, quotes and line breaks inside quoted fields", () => {
  assert.deepEqual(parseCsv('a,b,c\n1,"x, ""y""",3\n"line\nbreak",5,6\n'), [["a", "b", "c"], ["1", 'x, "y"', "3"], ["line\nbreak", "5", "6"]]);
  assert.deepEqual(parseCsv("﻿a,b\r\n1,2\r\n"), [["a", "b"], ["1", "2"]]);
});

test("names and ULDs are written the way the accounting shows them", () => {
  assert.equal(clientName("ccs-rso"), "CCS RSO");
  assert.equal(clientName(" pacifiko "), "PACIFIKO");
  assert.equal(payeeName("ack"), "ACK");
  assert.equal(payeeName("victor"), "Victor");
  assert.equal(uldLabel("1×PMC, 1×DQF", "[]"), "1×PMC, 1×DQF");
  assert.equal(uldLabel("FQA", '[{"type": "FQA", "qty": 1}]'), "1×FQA");
  assert.equal(uldLabel("PMC", "[]"), "1×PMC");
  assert.equal(uldLabel("Loose", "[]"), "Loose");
  assert.equal(uldLabel("", ""), "Loose");
  assert.equal(uldLabel("LOOSE", "not json"), "Loose");
});

test("a shipment of the Sheet keeps its numbers, its ULD handling and its splits", () => {
  const result = shipmentsFromCsv(`${HEAD}\n${row({})}\n`);
  assert.equal(result.skipped.length, 0);
  const [shipment] = result.shipments;
  assert.equal(shipment.client, "PACIFIKO");
  assert.equal(shipment.airline, "LATAM");
  assert.equal(shipment.dest, "GUA");
  assert.equal(shipment.awb2, null);
  assert.equal(shipment.uldText, "1×FQA");
  assert.equal(shipment.chw, 645.31);
  // The Sheet called the handling of the ULD its transfer.
  assert.equal(shipment.handlingCost, 35);
  assert.equal(shipment.bupHandlingCost, 30);
  assert.equal(shipment.transferCost, 0);
  assert.equal(shipment.costTotal, 710.78);
  assert.equal(shipment.invoiced, 1211.56);
  assert.equal(shipment.profit, 500.78);
  assert.equal(shipment.clientPaid, true);
  assert.deepEqual(shipment.splits, [
    { payee: "ACK", pct: 50, paid: false, paidDate: null },
    { payee: "Victor", pct: 25, paid: true, paidDate: "2026-04-02" },
    { payee: "Pamela", pct: 25, paid: true, paidDate: null },
  ]);
});

test("a row with the empty date of the Sheet is left out", () => {
  const result = shipmentsFromCsv(`${HEAD}\n${row({ id: "x", date: "1899-12-30", awb: "001-18559984" })}\n${row({})}\n`);
  assert.equal(result.shipments.length, 1);
  assert.deepEqual(result.skipped, [{ awb: "001-18559984", reason: "no valid date" }]);
});

test("an AWB on the list twice keeps the one edited last", () => {
  const first = row({ id: "a", awb: "045-53982036", date: "2026-10-31", profit: "1399.28", updatedAt: "2026-11-04T15:26:02.927Z" });
  const second = row({ id: "b", awb: "045-53982036", date: "2026-11-04", profit: "1299.28", updatedAt: "2026-11-10T00:36:55.498Z" });
  for (const order of [[first, second], [second, first]]) {
    const result = shipmentsFromCsv(`${HEAD}\n${order.join("\n")}\n`);
    assert.equal(result.shipments.length, 1);
    assert.equal(result.shipments[0].legacyId, "b");
    assert.equal(result.shipments[0].profit, 1299.28);
    assert.equal(result.skipped.length, 1);
  }
});

test("a commission is the share of the profit, to the cent", () => {
  assert.equal(commissionOf(500.78, 25), 125.2);
  assert.equal(commissionOf(1299.28, 10), 129.93);
  assert.equal(commissionOf(0, 50), 0);
});
