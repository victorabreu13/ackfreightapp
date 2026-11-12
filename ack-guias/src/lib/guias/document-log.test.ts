import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "@/lib/db";
import {
  companyKey,
  kindFromFileName,
  logLookup,
  parseImport,
  resolveKind,
  saveDocumentLog,
  uploadOutcome,
} from "./document-log";

test("handmade 729 file names map to AWB, delivery order, and the lithium letter", () => {
  assert.equal(kindFromFileName("AWB_729-95048310_full.pdf"), "awb");
  assert.equal(kindFromFileName("DO_729-95048310.pdf"), "delivery");
  assert.equal(kindFromFileName("FORM_LithiumBatteryLetter_729-95048310.pdf"), "lithium");
  assert.equal(kindFromFileName("045-55174943_CCSF.pdf"), "ccsp");
  assert.equal(kindFromFileName("045-54054792_CCSP.pdf"), "ccsf-alternate");
  assert.equal(companyKey("ACK"), "ack");
  assert.equal(companyKey("Kope"), null);
  assert.equal(companyKey("ACK TEAM LLC"), "ack");
});

test("import accepts the Pinto ACK backfill and rejects a missing client", () => {
  const pdf = Buffer.from("%PDF-1.4 handmade");
  const parsed = parseImport({
    client: "PINTO INTERNATIONAL LOGISTICS",
    awb: "729-95048310",
    kind: "awb",
    company: "ACK",
    fileName: "AWB_729-95048310_full.pdf",
    bytes: pdf,
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.client, "PINTO INTERNATIONAL LOGISTICS");
  assert.equal(parsed.value.company, "ack");
  assert.equal(parsed.value.kind, "awb");
  assert.equal(parsed.value.fileName, "AWB_729-95048310_full.pdf");

  const missing = parseImport({
    client: "  ",
    awb: "729-95048310",
    kind: "delivery",
    company: "ACK",
    fileName: "DO_729-95048310.pdf",
    bytes: pdf,
  });
  assert.equal(missing.ok, false);
  assert.equal(resolveKind("lithium battery", "FORM_LithiumBatteryLetter_729-95048310.pdf"), "lithium");
});

test("a Drive failure still produces a FAILED record and a later upload can match the same row", () => {
  const failed = uploadOutcome(null, "Drive is not configured");
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.error, "Drive is not configured");
  assert.equal(failed.driveFileId, null);

  const uploaded = uploadOutcome({ id: "file-1", url: "https://drive.google.com/file/d/file-1/view" }, null);
  assert.equal(uploaded.status, "UPLOADED");
  assert.equal(uploaded.driveUrl?.includes("file-1"), true);

  const generated = logLookup({
    source: "generated",
    guiaId: "guia-1",
    awb: "729-95048310",
    company: "ack",
    kind: "awb",
    fileName: "729-95048310 - GUIA MADRE.pdf",
  });
  assert.deepEqual(generated, {
    source: "generated",
    guiaId: "guia-1",
    kind: "awb",
    fileName: "729-95048310 - GUIA MADRE.pdf",
  });
  const imported = logLookup({
    source: "import",
    guiaId: "guia-1",
    awb: "729-95048310",
    company: "ack",
    kind: "lithium",
    fileName: "FORM_LithiumBatteryLetter_729-95048310.pdf",
  });
  assert.equal(imported.source, "import");
  assert.equal("guiaId" in imported, false);
  assert.equal(imported.fileName, "FORM_LithiumBatteryLetter_729-95048310.pdf");
});

test("a FAILED import is stored and the next save of that file updates the same row", { skip: !process.env.DATABASE_URL }, async () => {
  const fileName = `test-log-${Date.now()}.pdf`;
  const base = {
    source: "import" as const,
    client: "PINTO INTERNATIONAL LOGISTICS",
    awb: "729-95048310",
    company: "ack",
    kind: "awb",
    fileName,
    generatedBy: "andres.alvarado@ackfreight.com",
  };
  const first = await saveDocumentLog({ ...base, status: "FAILED", error: "Drive is not configured" });
  try {
    assert.equal(first.status, "FAILED");
    assert.equal(first.driveFileId, null);
    const second = await saveDocumentLog({
      ...base,
      status: "UPLOADED",
      error: null,
      driveFileId: "file-1",
      driveUrl: "https://drive.google.com/file/d/file-1/view",
    });
    assert.equal(second.id, first.id);
    assert.equal(second.status, "UPLOADED");
    assert.equal(second.client, "PINTO INTERNATIONAL LOGISTICS");
    assert.equal(second.generatedBy, "andres.alvarado@ackfreight.com");
    assert.equal(await prisma.guiaDocument.count({ where: { fileName } }), 1);
  } finally {
    await prisma.guiaDocument.deleteMany({ where: { fileName } });
    await prisma.$disconnect();
  }
});
