import assert from "node:assert/strict";
import test from "node:test";
import { exportCounts, planAckImport, redactDatabaseUrl, shapeAckExport, type AckExportFile } from "./ack-transfer";

const sample: AckExportFile = {
  version: 1,
  issuer: "ACK TEAM LLC",
  guias: [
    {
      id: "guia-ack",
      agentKey: "ack",
      product: "guia",
      awb: "045-53981966",
      prefix: "045",
      serial: "53981966",
      aesItn: "X20261021165293",
      guiaClientId: "client-ack",
      shipmentId: "ship-1",
      clientId: "kope-client",
    },
    { id: "guia-kope", agentKey: "kope", product: "guia", awb: "369-11441102", prefix: "369", serial: "11441102", guiaClientId: "client-kope" },
  ],
  lines: [
    { id: "line-ack", documentId: "guia-ack", pieces: 2, chargeableWeight: 10, sortOrder: 0 },
    { id: "line-kope", documentId: "guia-kope", pieces: 1, sortOrder: 0 },
  ],
  clients: [
    { id: "client-ack", agentKey: "ack", name: "PINTO", normalizedName: "PINTO" },
    { id: "client-kope", agentKey: "kope", name: "PINTO", normalizedName: "PINTO" },
  ],
  rates: [
    { id: "rate-ack", agentKey: "ack", guiaClientId: "client-ack", ratePerKg: 1.75 },
    { id: "rate-kope", agentKey: "kope", guiaClientId: "client-kope", ratePerKg: 9 },
  ],
  stock: [
    { id: "stock-045", prefix: "045", serial: "53981966", awb: "045-53981966", agentKey: "ack", status: "used", documentId: "guia-ack" },
    { id: "stock-810", prefix: "810", serial: "51043801", awb: "810-51043801", agentKey: "ack", status: "available", documentId: null },
    { id: "stock-369", prefix: "369", serial: "11441102", awb: "369-11441102", agentKey: "ack", status: "available", documentId: null },
    { id: "stock-kope", prefix: "045", serial: "11111115", awb: "045-11111115", agentKey: "kope", status: "available", documentId: null },
  ],
  documents: [
    { id: "doc-1", guiaId: "guia-ack", client: "PINTO", awb: "045-53981966", company: "ack", kind: "UPLOAD", fileName: "packing.pdf", source: "upload" },
    { id: "doc-kope", guiaId: "guia-kope", client: "PINTO", awb: "369-11441102", company: "kope", kind: "awb", fileName: "kope.pdf", source: "generated" },
  ],
  driveFiles: [
    { id: "drive-1", documentId: "guia-ack", kind: "awb", fileName: "045-53981966 - GUIA MADRE.pdf", driveFileId: "file-1" },
    { id: "drive-kope", documentId: "guia-kope", kind: "awb", fileName: "kope.pdf" },
  ],
};

test("export keeps ACK guías, their clients, AES ITN, 045/810 stock, and upload metadata", () => {
  const file = shapeAckExport(sample);
  assert.deepEqual(exportCounts(file), {
    guias: 1,
    lines: 1,
    clients: 1,
    rates: 1,
    stock: 2,
    documents: 1,
    driveFiles: 1,
    withAesItn: 1,
  });
  assert.equal(file.guias[0]?.awb, "045-53981966");
  assert.equal(file.guias[0]?.aesItn, "X20261021165293");
  assert.equal("shipmentId" in (file.guias[0] ?? {}), false);
  assert.equal("clientId" in (file.guias[0] ?? {}), false);
  assert.equal(file.clients[0]?.agentKey, "ack");
  assert.deepEqual(
    file.stock.map((row) => row.awb),
    ["045-53981966", "810-51043801"],
  );
});

test("import is idempotent on ids and preserves AWB numbers", () => {
  const once = planAckImport(sample);
  const twice = planAckImport({ ...sample, guias: once.guias, lines: once.lines, clients: once.clients, rates: once.rates, stock: once.stock, documents: once.documents, driveFiles: once.driveFiles });
  assert.equal(once.refusedGuias, 1);
  assert.equal(once.skippedStock, 2);
  assert.equal(once.guias[0]?.id, "guia-ack");
  assert.equal(once.guias[0]?.awb, "045-53981966");
  assert.equal(once.stock.find((row) => row.id === "stock-045")?.documentId, "guia-ack");
  assert.deepEqual(
    twice.guias.map((row) => row.awb),
    once.guias.map((row) => row.awb),
  );
  assert.deepEqual(
    twice.stock.map((row) => row.id),
    once.stock.map((row) => row.id),
  );
});

test("database URLs are redacted from errors", () => {
  const url = "postgresql://ack_guias:secret-token@127.0.0.1:5432/ack_guias";
  assert.equal(redactDatabaseUrl(`connect ${url} failed`, url).includes("secret-token"), false);
  assert.match(redactDatabaseUrl(`connect ${url} failed`, url), /\[redacted\]/);
});
