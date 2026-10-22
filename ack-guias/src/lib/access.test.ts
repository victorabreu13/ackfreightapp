import assert from "node:assert/strict";
import test from "node:test";
import { canInvoiceGuia, canManageGuias, canReadGuias, guiaVisible, guiaWhere, type SessionUser } from "./access";

const admin: SessionUser = {
  id: "admin",
  email: "victor.abreu@ackfreight.com",
  role: "ADMIN",
  clientId: null,
  clientName: null,
};

const team: SessionUser = {
  id: "team",
  email: "ops@ackfreight.com",
  role: "OPERATIONS",
  clientId: null,
  clientName: null,
};

const viewer: SessionUser = {
  id: "viewer",
  email: "view@ackfreight.com",
  role: "VIEWER",
  clientId: null,
  clientName: null,
};

const accounting: SessionUser = {
  id: "acct",
  email: "books@ackfreight.com",
  role: "ACCOUNTING",
  clientId: null,
  clientName: null,
  agentKey: "ack",
};

test("admins and operations manage ACK guías, accounting invoices them, and viewers only read", () => {
  assert.equal(canManageGuias(admin), true);
  assert.equal(canManageGuias(team), true);
  assert.equal(canManageGuias(accounting), false);
  assert.equal(canManageGuias(viewer), false);
  assert.equal(canReadGuias(accounting), true);
  assert.equal(canReadGuias(viewer), true);
  assert.equal(canInvoiceGuia(admin, "ack"), true);
  assert.equal(canInvoiceGuia(accounting, "ack"), true);
  assert.equal(canInvoiceGuia(team, "ack"), false);
  assert.equal(canInvoiceGuia(viewer, "ack"), false);
  assert.equal(canInvoiceGuia(admin, "kope"), false);
  assert.equal(guiaVisible(accounting, { agentKey: "ack" }), true);
  assert.equal(guiaVisible(viewer, { agentKey: "ack" }), true);
  assert.equal(guiaVisible(admin, { agentKey: "kope" }), false);
  assert.deepEqual(guiaWhere(admin), { product: "guia", agentKey: "ack" });
  assert.deepEqual(guiaWhere(accounting), { product: "guia", agentKey: "ack" });
  assert.deepEqual(guiaWhere(viewer), { product: "guia", agentKey: "ack" });
});
