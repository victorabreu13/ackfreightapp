import assert from "node:assert/strict";
import test from "node:test";
import { settleCharges, settleLine, volumeWeight } from "./calc";
import { prefillFromShipment, secondLegFlightDate, type AgentRecord } from "./document";
import { checkDigit, expandCount, isValidSerial, parseAwb, parseStockText, serialFromBase } from "./number";

const agent: AgentRecord = {
  key: "kope",
  legalName: "KOPE LOGISTICS INC.",
  address: "6550 NW 97TH AVE",
  phone: null,
  city: "Miami",
  iataCode: "01108240000",
  accountNo: null,
  signatureLine: "KOPE LOGISTICS INC. Authorized Agent: {name}",
  conditions: "en",
  copyLabel: null,
};

test("mod-7 check digit is the first 7 digits modulo 7", () => {
  assert.equal(checkDigit("1144110"), 2);
  assert.equal(isValidSerial("11441102"), true);
  assert.equal(isValidSerial("11441103"), false);
  assert.equal(serialFromBase(1144110), "11441102");
  assert.deepEqual(parseAwb("369-11441102"), { prefix: "369", serial: "11441102" });
});

test("a count expands from 7 digits by adding the check digit", () => {
  const batch = expandCount("45", "2241628", 2);
  assert.deepEqual(
    batch.ok.map((row) => row.awb),
    ["045-22416284", "045-22416295"],
  );
  assert.equal(isValidSerial("22416284"), true);
  assert.equal(isValidSerial("22416295"), true);
});

test("an 8-digit start is rejected when the check digit is wrong", () => {
  const batch = expandCount("369", "11441103", 1);
  assert.equal(batch.ok.length, 0);
  assert.match(batch.rejected[0] ?? "", /mod-7/);
});

test("pasted stock accepts a full AWB, a pair, and a range", () => {
  const parsed = parseStockText("awb\n369-11441102\n045,22416284\n272,7602719,2\nnot-an-awb\n", "369");
  assert.deepEqual(
    parsed.ok.map((row) => row.awb),
    ["369-11441102", "045-22416284", "272-76027195", "272-76027206"],
  );
  assert.deepEqual(parsed.rejected, ["not-an-awb"]);
});

test("the second-leg flight box is the requested date, never the inbound flight", () => {
  assert.equal(secondLegFlightDate(new Date("2026-10-04T15:00:00.000Z")), "Oct/04/2026");
  assert.equal(secondLegFlightDate(null), "");
  const filled = prefillFromShipment({
    awb: "369-11441124",
    prefix: "369",
    airline: "ATLAS AIR",
    origin: "PVG",
    dest: "BOG",
    pcs: 124,
    kgs: 2862,
    chw: 3060,
    requestedFlightDate: new Date("2026-10-04T00:00:00.000Z"),
    clientName: "IVI Logistics",
    ulds: [],
    agent,
    signer: "Grecia",
  });
  assert.equal(filled.flightDate, "Oct/04/2026");
  assert.equal(filled.flightDate.includes("5Y"), false);
  const blank = prefillFromShipment({
    ...{
      awb: "369-11441124",
      prefix: "369",
      airline: "ATLAS AIR",
      origin: "PVG",
      dest: "BOG",
      pcs: 124,
      kgs: 2862,
      chw: 3060,
      clientName: "IVI Logistics",
      ulds: [],
      agent,
      signer: "Grecia",
    },
    requestedFlightDate: null,
  });
  assert.equal(blank.flightDate, "");
});

test("chargeable weight is the greater of gross and volume", () => {
  const line = settleLine({
    pieces: 2,
    grossWeight: 10,
    length: 100,
    width: 80,
    height: 60,
    dimUnit: "cm",
    rate: 1.5,
  });
  assert.equal(volumeWeight({ pieces: 2, length: 100, width: 80, height: 60, dimUnit: "cm" }), 160);
  assert.equal(line.chargeableWeight, 160);
  assert.equal(line.total, 240);
  const entered = settleLine({ pieces: 4, grossWeight: 899, chargeableWeight: 1650, rate: 1.3 });
  assert.equal(entered.chargeableWeight, 1650);
  assert.equal(entered.total, 2145);
});

test("prepaid weight charge follows WT/VAL and other charges follow Other", () => {
  const prepaid = settleCharges({
    lines: [{ total: 3060 }],
    wtVal: "PPD",
    otherPpc: "PPD",
    taxCharge: 10,
    otherDueAgent: 5,
  });
  assert.equal(prepaid.weightPrepaid, 3060);
  assert.equal(prepaid.totalPrepaid, 3075);
  assert.equal(prepaid.totalCollect, 0);
  const collect = settleCharges({
    lines: [{ total: 100 }],
    wtVal: "COLL",
    otherPpc: "COLL",
    valuationCharge: 4,
    otherDueCarrier: 6,
    weightCharge: 80,
  });
  assert.equal(collect.weightCollect, 80);
  assert.equal(collect.valuationCollect, 4);
  assert.equal(collect.totalCollect, 90);
});
