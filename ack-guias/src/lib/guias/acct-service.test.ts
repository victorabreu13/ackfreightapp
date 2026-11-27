import assert from "node:assert/strict";
import test from "node:test";

type Row = Record<string, unknown>;

/**
 * A stand-in for the database with what the accounting service reads and writes. The client is created once, the first
 * time the service is imported, so it is installed once and each test swaps what is in it.
 */
const state: {
  guias: Row[];
  shipments: Row[];
  splits: Row[];
  clients: Row[];
} = { guias: [], shipments: [], splits: [], clients: [] };

const providers = [
  { name: "ACK Team LLC", aliases: "ACK TEAM, ACK LOGISTICS", pickupMode: "per_trip", pickupTripCost: 40, pickupBaseCost: null, pickupBasePallets: null, pickupStepCost: null, pickupStepPallets: null, transferMode: "per_trip", transferTripCost: 40, transferBaseCost: null, transferBasePallets: null, transferStepCost: null, transferStepPallets: null },
  { name: "RL Services", aliases: "RL SERVICES", pickupMode: "tiered", pickupTripCost: null, pickupBaseCost: 50, pickupBasePallets: 4, pickupStepCost: 10, pickupStepPallets: 2, transferMode: "manual", transferTripCost: null, transferBaseCost: null, transferBasePallets: null, transferStepCost: null, transferStepPallets: null },
];

const pacifiko = { name: "PACIFIKO", kopeHandlingPct: 10, kopeInCost: true, pickupPerKg: 0.15, handlingPerKg: 0.2, transferPerKg: 0.15, chargeBasis: "gross", insuranceCostPct: 0.35, insuranceSoldPct: 0.5, awbFee: 50, flatSellPerKg: null, splits: [{ payee: "ACK", pct: 55 }, { payee: "Victor", pct: 35 }, { payee: "Pamela", pct: 10 }] };

const match = (row: Row, where: Row) => Object.entries(where).every(([key, value]) => (value instanceof Date ? (row[key] as Date)?.getTime() === value.getTime() : row[key] === value));

(globalThis as { prisma?: unknown }).prisma = {
  acctShipment: {
    findUnique: async ({ where }: { where: Row }) => state.shipments.find((row) => match(row, where)) ?? null,
    findMany: async ({ where }: { where: Row }) => state.shipments.filter((row) => match(row, where)),
    create: async ({ data }: { data: Row }) => {
      const row = { id: `s${state.shipments.length + 1}`, createdAt: new Date(), ...data };
      state.shipments.push(row);
      return row;
    },
    update: async ({ where, data }: { where: Row; data: Row }) => Object.assign(state.shipments.find((row) => row.id === where.id) as Row, data),
  },
  acctSplit: { createMany: async ({ data }: { data: Row[] }) => void state.splits.push(...data) },
  acctClient: {
    findMany: async () => [pacifiko, ...state.clients],
    findUnique: async ({ where }: { where: Row }) => state.clients.find((row) => row.id === where.id) ?? null,
    create: async ({ data }: { data: Row }) => {
      const row = { id: `c${state.clients.length + 1}`, kopeHandlingPct: 10, kopeInCost: true, pickupPerKg: 0, handlingPerKg: 0, transferPerKg: 0, chargeBasis: "chw", insuranceCostPct: 0.35, insuranceSoldPct: 0.5, awbFee: 0, flatSellPerKg: null, splits: [], ...data };
      state.clients.push(row);
      return row;
    },
  },
  acctPerson: { findFirst: async () => null },
  acctProvider: { findMany: async () => providers, findUnique: async ({ where }: { where: Row }) => providers.find((row) => row.name === where.name) ?? null },
  acctUldCost: { findMany: async () => [{ uld: "DQF", handlingCost: 50 }, { uld: "LOOSE", handlingCost: 0 }] },
  acctSetting: { findMany: async () => [{ key: "minPickupSold", value: 75 }, { key: "minHandlingSold", value: 75 }, { key: "minTransferSold", value: 75 }] },
  airlineRate: {
    findMany: async () => [{ effectiveFrom: new Date("2026-10-01T00:00:00Z") }, { effectiveFrom: new Date("2026-11-01T00:00:00Z") }],
    findFirst: async ({ where }: { where: Row }) => (where.airline === "LATAM" && where.destination === "GUA" ? { buyRate: 1.16, sellRate: 1.55 } : null),
  },
  airWaybillDocument: { findFirst: async ({ where }: { where: Row }) => state.guias.find((row) => row.id === where.id && row.status === "issued") ?? null },
};

const guia = (over: Row): Row => ({
  id: "g1", status: "issued", product: "guia", awb: "045-56632074", clientLabel: "PACIFIKO, LLC", guiaClient: { name: "PACIFIKO, LLC" }, destination: "GUATEMALA (GUA)", carrierName: "LATAM CARGO",
  bup: false, bupItems: null, truckerName: "ACK TEAM LLC", pickupTruckerName: "ACK TEAM LLC",
  lines: [{ pieces: 6, grossWeight: 1018, chargeableWeight: 1550.36 }], ...over,
});

test("an issued AWB makes its accounting row with the costs, the sell and the split of its client", async () => {
  state.guias = [guia({})];
  state.shipments = [];
  state.splits = [];
  const { createAcctForGuia } = await import("@/lib/guias/acct-service");
  const result = await createAcctForGuia("g1");
  assert.equal(result.created, true);
  const [shipment] = state.shipments;
  assert.equal(shipment.client, "PACIFIKO");
  assert.equal(shipment.airline, "LATAM");
  assert.equal(shipment.dest, "GUA");
  assert.equal(shipment.chw, 1550.36);
  // The air freight at 1.16 cost and 1.55 sell on the chargeable weight.
  assert.equal(shipment.airCost, 1798.42);
  assert.equal(shipment.airSold, 2403.06);
  // Pickup, handling and transfer on the gross weight: 0.15, 0.20 and 0.15 of 1018.
  assert.equal(shipment.pickupSold, 152.7);
  assert.equal(shipment.handlingSold, 203.6);
  assert.equal(shipment.transferSold, 152.7);
  // ACK TEAM LLC charges 40 per trip for the pickup and 40 for the transfer, and this is the only AWB of the day.
  assert.equal(shipment.pickupCost, 40);
  assert.equal(shipment.transferCost, 40);
  assert.equal(shipment.pickupProvider, "ACK Team LLC");
  assert.equal(shipment.source, "guia");
  assert.deepEqual(state.splits.map((split) => [split.payee, split.pct]), [["ACK", 55], ["Victor", 35], ["Pamela", 10]]);
  // The profit is the invoiced less the cost, and it was worked out from the lines.
  assert.equal(Math.round(((shipment.invoiced as number) - (shipment.costTotal as number)) * 100) / 100, shipment.profit);
});

test("an AWB that is already in the accounting is not made twice", async () => {
  state.guias = [guia({})];
  const before = state.shipments.length;
  const { createAcctForGuia } = await import("@/lib/guias/acct-service");
  // The first test left its AWB in the accounting: its row has its guiaId.
  state.shipments[0].guiaId = "g1";
  const result = await createAcctForGuia("g1");
  assert.equal(result.created, false);
  assert.equal(state.shipments.length, before);
});

test("the cost of the trip of the day goes to the biggest AWB, and RL Services is charged by the pallets of the pickup order", async () => {
  state.shipments = [];
  state.splits = [];
  state.guias = [
    guia({ id: "small", awb: "045-56631875", lines: [{ pieces: 2, grossWeight: 300, chargeableWeight: 400 }] }),
    guia({ id: "big", awb: "045-56632251", lines: [{ pieces: 4, grossWeight: 900, chargeableWeight: 1200 }] }),
    guia({ id: "rl", awb: "045-56631960", truckerName: "ACK TEAM LLC", pickupTruckerName: "RL SERVICES INC", lines: [{ pieces: 7, grossWeight: 500, chargeableWeight: 600 }] }),
  ];
  const { createAcctForGuia } = await import("@/lib/guias/acct-service");
  for (const id of ["small", "big", "rl"]) await createAcctForGuia(id);
  const byGuia = (id: string) => state.shipments.find((row) => row.guiaId === id) as Row;
  // Pickup by ACK Team: one trip for the two AWBs, charged to the bigger one.
  assert.equal(byGuia("small").pickupCost, 0);
  assert.equal(byGuia("big").pickupCost, 40);
  // Transfer by ACK Team: one trip for the three AWBs of the day, to the biggest of them.
  assert.equal(byGuia("big").transferCost, 40);
  assert.equal(byGuia("small").transferCost, 0);
  assert.equal(byGuia("rl").transferCost, 0);
  // RL Services: $50 for 4 pallets and $10 for each 2 more, so 7 pieces cost $70.
  assert.equal(byGuia("rl").pickupProvider, "RL Services");
  assert.equal(byGuia("rl").pickupCost, 70);
  // Totals follow the trip price once it is placed.
  assert.equal(Math.round(((byGuia("big").invoiced as number) - (byGuia("big").costTotal as number)) * 100) / 100, byGuia("big").profit);
});

test("what could not be worked out is written in the note of the row", async () => {
  state.shipments = [];
  state.splits = [];
  state.clients = [];
  state.guias = [guia({ id: "odd", awb: "045-56639999", destination: "MIAMI (MIA)", clientLabel: "UNKNOWN CO", guiaClient: { name: "UNKNOWN CO" }, truckerName: "KAY AIR DELIVERY", pickupTruckerName: null })];
  const { createAcctForGuia } = await import("@/lib/guias/acct-service");
  await createAcctForGuia("odd");
  const note = String(state.shipments[0].note);
  // A client that is not in Clients & team is added there, marked to configure, and the note says so.
  assert.match(note, /The client UNKNOWN CO was made automatically and is not configured yet/);
  assert.equal(state.clients.length, 1);
  assert.equal(state.clients[0].name, "UNKNOWN CO");
  assert.equal(state.clients[0].needsSetup, true);
  assert.match(note, /No rate for LATAM to MIA/);
  assert.match(note, /"KAY AIR DELIVERY" is not a provider/);
  assert.equal(state.splits.length, 0);
});
