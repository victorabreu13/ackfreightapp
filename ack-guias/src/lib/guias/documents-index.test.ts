import assert from "node:assert/strict";
import test from "node:test";
import { filterLoggedDocuments, formatNyDate, groupDocumentsByClient, nyDay, type LoggedDocument } from "./documents-index";

const generated = new Date("2026-10-15T18:30:00.000Z");

function row(overrides: Partial<LoggedDocument> & Pick<LoggedDocument, "id" | "awb" | "kind" | "generatedAt">): LoggedDocument {
  return {
    guiaId: "guia-1",
    client: "PINTO INTERNATIONAL LOGISTICS",
    company: "ack",
    fileName: `${overrides.kind}.pdf`,
    driveUrl: "https://drive.google.com/file/d/abc/view",
    status: "UPLOADED",
    error: null,
    generatedBy: "andres.alvarado@ackfreight.com",
    source: "generated",
    ...overrides,
  };
}

test("document log filters by client, AWB, type, company, and a New York date", () => {
  const rows = [
    row({ id: "awb", awb: "729-95048310", kind: "awb", generatedAt: generated }),
    row({
      id: "do",
      awb: "729-95048310",
      kind: "delivery",
      client: "LAMAR",
      company: "legacy",
      generatedAt: new Date("2026-10-16T15:00:00.000Z"),
      status: "FAILED",
      driveUrl: null,
      error: "Drive is not configured",
    }),
    row({ id: "lithium", awb: "045-54055886", kind: "lithium", generatedAt: generated, source: "import" }),
  ];
  assert.equal(filterLoggedDocuments(rows, { kind: "tsa" }).length, 0);
  assert.equal(filterLoggedDocuments(rows, { kind: "delivery" })[0]?.status, "FAILED");
  assert.equal(filterLoggedDocuments(rows, { client: "PINTO INTERNATIONAL LOGISTICS", awb: "95048310" }).length, 1);
  assert.equal(filterLoggedDocuments(rows, { company: "legacy" }).length, 1);
  assert.equal(filterLoggedDocuments(rows, { from: "2026-10-16", to: "2026-10-16" }).length, 1);
  assert.equal(filterLoggedDocuments(rows, { from: nyDay(generated), to: nyDay(generated) }).length, 2);
  assert.equal(nyDay(generated).length, 10);
  assert.equal(filterLoggedDocuments(rows, { kind: "not-a-kind" }).length, 0);
});

test("uploaded files stay searchable by type Archivo and by file name", () => {
  const rows = [
    row({
      id: "sheet",
      awb: "draft-abc12345",
      kind: "UPLOAD",
      fileName: "packing-list.xlsx",
      source: "upload",
      generatedAt: generated,
    }),
    row({ id: "awb", awb: "729-95048310", kind: "awb", generatedAt: generated }),
  ];
  assert.equal(filterLoggedDocuments(rows, { kind: "UPLOAD" }).length, 1);
  assert.equal(filterLoggedDocuments(rows, { kind: "UPLOAD" })[0]?.fileName, "packing-list.xlsx");
  assert.equal(filterLoggedDocuments(rows, { awb: "packing-list" }).length, 1);
  assert.equal(filterLoggedDocuments(rows, {}).length, 2);
});

test("documents group by client A to Z, then one subfolder per guía", () => {
  const doc = (overrides: Partial<LoggedDocument>): LoggedDocument => ({
    id: "x",
    guiaId: null,
    client: "PACIFIKO, LLC",
    awb: "045-56631341",
    company: "ack",
    kind: "awb",
    fileName: "f.pdf",
    driveUrl: null,
    status: "FAILED",
    error: null,
    generatedAt: new Date("2026-10-21T20:44:00.000Z"),
    generatedBy: "a@ackfreight.com",
    source: "generated",
    ...overrides,
  });
  const folders = groupDocumentsByClient([
    doc({ id: "1", guiaId: "g1", kind: "labels" }),
    doc({ id: "2", guiaId: "g1", kind: "awb" }),
    doc({ id: "3", guiaId: "g2", awb: "045-11111111", kind: "tsa", generatedAt: new Date("2026-10-22T10:00:00.000Z") }),
    doc({ id: "4", guiaId: "g3", client: "acme  cargo", awb: "810-22222222" }),
    doc({ id: "5", guiaId: "g3", client: "ACME CARGO", awb: "810-22222222", kind: "delivery" }),
  ]);
  assert.deepEqual(folders.map((folder) => folder.client), ["acme cargo", "PACIFIKO, LLC"]);
  assert.equal(folders[0].count, 2);
  assert.equal(folders[0].guias.length, 1);
  const pacifiko = folders[1];
  assert.equal(pacifiko.count, 3);
  assert.deepEqual(pacifiko.guias.map((guia) => guia.awb), ["045-11111111", "045-56631341"]);
  assert.deepEqual(pacifiko.guias[1].documents.map((row) => row.kind), ["awb", "labels"]);
});

test("the guía list shows the creation day in New York time", () => {
  assert.equal(formatNyDate(new Date("2026-10-23T02:55:00.000Z")), "Oct 22, 2026");
  assert.equal(formatNyDate(new Date("2026-10-23T14:00:00.000Z")), "Oct 23, 2026");
});
