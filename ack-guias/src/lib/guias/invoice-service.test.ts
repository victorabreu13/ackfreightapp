import assert from "node:assert/strict";
import test from "node:test";

type Row = Record<string, unknown>;

/** A stand-in for the database with what the invoice service reads and writes. It is installed once, before the service is imported. */
const state: { shipments: Row[]; invoices: Row[]; counter: Row | null; client: Row | null; pickup: Row | null } = { shipments: [], invoices: [], counter: null, client: null, pickup: null };

(globalThis as { prisma?: unknown }).prisma = {
  invoiceCounter: {
    upsert: async ({ create, update }: { create: Row; update: { lastNumber: { increment: number } } }) => {
      if (!state.counter) state.counter = { ...create };
      else (state.counter as { lastNumber: number }).lastNumber += update.lastNumber.increment;
      return state.counter;
    },
  },
  acctShipment: { findUnique: async ({ where }: { where: Row }) => state.shipments.find((row) => row.guiaId === where.guiaId) ?? null },
  invoice: {
    findUnique: async ({ where }: { where: Row }) => state.invoices.find((row) => row.shipmentId === where.shipmentId) ?? null,
    create: async ({ data }: { data: Row }) => {
      state.invoices.push(data);
      return data;
    },
  },
  airWaybillDocument: { findUnique: async () => ({ departure: "MIAMI (MIA)", guiaClientId: "c1" }) },
  acctClient: { findUnique: async () => state.client },
  pickupRequest: { findFirst: async () => state.pickup },
};

const shipment: Row = {
  id: "s1", guiaId: "g1", date: new Date("2026-11-04T00:00:00Z"), client: "PACIFIKO", awb: "045-56631411", dest: "GUA", chw: 278.4, sellRate: 1.58, airSold: 439.87,
  pickupSold: 75, handlingSold: 75, transferSold: 75, insuranceSold: 0, aes: 0, awbFee: 50, invoicedOverride: null, uldText: null,
};

test("the first invoice is number 3000 and each one after takes the next number", async () => {
  state.counter = null;
  const { nextInvoiceNumber } = await import("@/lib/guias/invoice-service");
  assert.equal(await nextInvoiceNumber(), 3000);
  assert.equal(await nextInvoiceNumber(), 3001);
});

test("the draft invoice of a guía holds the charges of its accounting row and the data of its client", async () => {
  state.counter = { id: "invoice", lastNumber: 2999 };
  state.invoices = [];
  state.shipments = [shipment];
  state.client = { billToName: "PACIFIKO LLC", billToAddress: "8504 NW 70 ST\nDoral FL 33166", billingEmails: "ap@pacifiko.com" };
  state.pickup = { pickupDate: "10/31/2026", shipperName: "PACIFIKO LLC", shipperAddress: "8504 NW 70 ST" };
  const { createInvoiceForGuia } = await import("@/lib/guias/invoice-service");
  const result = await createInvoiceForGuia("g1");
  assert.deepEqual(result, { created: true, number: 3000 });
  const invoice = state.invoices[0] as Row & { lines: { create: Array<Row> } };
  assert.equal(invoice.status, undefined);
  assert.equal(invoice.total, 714.87);
  assert.equal(invoice.billToName, "PACIFIKO LLC");
  assert.equal(invoice.emails, "ap@pacifiko.com");
  assert.equal(invoice.guiaClientId, "c1");
  assert.equal(invoice.note, null);
  assert.equal((invoice.dueDate as Date).getTime() - (invoice.invoiceDate as Date).getTime(), 10 * 86_400_000);
  assert.deepEqual(invoice.lines.create.map((line) => line.product), ["PICKUP", "HANDLING", "AIRPORT TRANSFER", "AIRFREIGHT", "AWB"]);
  assert.equal(invoice.lines.create[0].description, "PACIFIKO LLC, 8504 NW 70 ST");
  assert.equal((invoice.lines.create[0].serviceDate as Date).toISOString().slice(0, 10), "2026-10-31");
  assert.equal(invoice.lines.create[3].description, "MIA-GUA AWB 045-56631411");
});

test("a client without address or emails still gets its draft, with a note for accounting", async () => {
  state.counter = { id: "invoice", lastNumber: 3000 };
  state.invoices = [];
  state.client = null;
  state.pickup = null;
  const { createInvoiceForGuia } = await import("@/lib/guias/invoice-service");
  const result = await createInvoiceForGuia("g1");
  assert.equal(result.created, true);
  const invoice = state.invoices[0] as Row;
  assert.equal(invoice.billToName, "PACIFIKO");
  assert.match(String(invoice.note), /address/);
  assert.match(String(invoice.note), /email/);
});

test("a guía that already has its invoice does not get a second one", async () => {
  state.invoices = [{ shipmentId: "s1", number: 3001 }];
  const { createInvoiceForGuia } = await import("@/lib/guias/invoice-service");
  assert.deepEqual(await createInvoiceForGuia("g1"), { created: false, number: 3001 });
  assert.equal(state.invoices.length, 1);
});

test("a shipment with nothing to charge makes no invoice", async () => {
  state.invoices = [];
  state.shipments = [{ ...shipment, pickupSold: 0, handlingSold: 0, transferSold: 0, airSold: 0, awbFee: 0 }];
  const { createInvoiceForGuia } = await import("@/lib/guias/invoice-service");
  const result = await createInvoiceForGuia("g1");
  assert.equal(result.created, false);
  assert.equal(state.invoices.length, 0);
});
