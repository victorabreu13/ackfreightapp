/**
 * Idempotent import of an ACK export. AWB numbers and original ids are kept.
 * Refuses rows whose issuer is not ACK TEAM LLC.
 */
import { readFileSync } from "node:fs";
import type { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { planAckImport, stockToInsert, type AckExportFile } from "../src/lib/ack-transfer";

const DATE_FIELDS = new Set([
  "createdAt",
  "updatedAt",
  "invoiceDate",
  "invoicedAt",
  "qboClaimedAt",
  "generatedAt",
]);

function dated(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === "id") continue;
    out[key] = DATE_FIELDS.has(key) && typeof value === "string" && value ? new Date(value) : value;
  }
  return out;
}

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Pass the export JSON path.");
    process.exit(1);
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as AckExportFile;
  if (parsed.version !== 1 || parsed.issuer !== "ACK TEAM LLC") {
    console.error("Refusing a file that is not an ACK TEAM LLC export.");
    process.exit(1);
  }
  const plan = planAckImport(parsed);
  const clientIds = new Set(plan.clients.map((row) => String(row.id)));
  for (const row of plan.clients) {
    const id = String(row.id);
    const data = dated(row) as Prisma.GuiaClientUncheckedUpdateInput;
    await prisma.guiaClient.upsert({
      where: { id },
      create: { id, ...data } as Prisma.GuiaClientUncheckedCreateInput,
      update: data,
    });
  }
  for (const row of plan.guias) {
    const id = String(row.id);
    const data = dated(row);
    if (typeof data.guiaClientId === "string" && !clientIds.has(data.guiaClientId)) data.guiaClientId = null;
    data.agentKey = "ack";
    data.product = "guia";
    await prisma.airWaybillDocument.upsert({
      where: { id },
      create: { id, ...data } as Prisma.AirWaybillDocumentUncheckedCreateInput,
      update: data as Prisma.AirWaybillDocumentUncheckedUpdateInput,
    });
  }
  for (const row of plan.lines) {
    const id = String(row.id);
    const data = dated(row) as Prisma.AwbGoodsLineUncheckedUpdateInput;
    await prisma.awbGoodsLine.upsert({
      where: { id },
      create: { id, ...data } as Prisma.AwbGoodsLineUncheckedCreateInput,
      update: data,
    });
  }
  for (const row of plan.rates) {
    const id = String(row.id);
    const data = dated(row) as Prisma.ClientAgreedRateUncheckedUpdateInput;
    await prisma.clientAgreedRate.upsert({
      where: { id },
      create: { id, ...data } as Prisma.ClientAgreedRateUncheckedCreateInput,
      update: data,
    });
  }
  const guiaIds = new Set(plan.guias.map((row) => String(row.id)));
  const stockIds = plan.stock.map((row) => String(row.id ?? "")).filter((id) => id.length > 0);
  const stockAwbs = plan.stock.map((row) => String(row.awb ?? "")).filter((awb) => awb.length > 0);
  const stockDocs = plan.stock.map((row) => (row.documentId ? String(row.documentId) : "")).filter((id) => id.length > 0);
  const stockWhere: Prisma.AwbStockNumberWhereInput[] = [];
  if (stockIds.length) stockWhere.push({ id: { in: stockIds } });
  if (stockAwbs.length) stockWhere.push({ awb: { in: stockAwbs } });
  if (stockDocs.length) stockWhere.push({ documentId: { in: stockDocs } });
  const existingStock = stockWhere.length
    ? await prisma.awbStockNumber.findMany({
        where: { OR: stockWhere },
        select: { id: true, awb: true, documentId: true },
      })
    : [];
  const prepared = stockToInsert(plan.stock, {
    ids: existingStock.map((row) => row.id),
    awbs: existingStock.map((row) => row.awb),
    documentIds: existingStock.flatMap((row) => (row.documentId ? [row.documentId] : [])),
  });
  let insertedStock = 0;
  if (prepared.insert.length) {
    const created = await prisma.awbStockNumber.createMany({
      data: prepared.insert.map((row) => {
        const id = String(row.id);
        const data = dated(row);
        if (data.documentId && !guiaIds.has(String(data.documentId))) data.documentId = null;
        data.agentKey = "ack";
        return { id, ...data } as Prisma.AwbStockNumberCreateManyInput;
      }),
      skipDuplicates: true,
    });
    insertedStock = created.count;
  }
  const skippedExistingStock = plan.stock.length - insertedStock;
  for (const row of plan.documents) {
    const id = String(row.id);
    const data = dated(row);
    if (data.guiaId && !guiaIds.has(String(data.guiaId))) data.guiaId = null;
    data.company = "ack";
    await prisma.guiaDocument.upsert({
      where: { id },
      create: { id, ...data } as Prisma.GuiaDocumentUncheckedCreateInput,
      update: data as Prisma.GuiaDocumentUncheckedUpdateInput,
    });
  }
  for (const row of plan.driveFiles) {
    if (!guiaIds.has(String(row.documentId))) continue;
    const id = String(row.id);
    const data = dated(row) as Prisma.GuiaDriveFileUncheckedUpdateInput;
    await prisma.guiaDriveFile.upsert({
      where: { id },
      create: { id, ...data } as Prisma.GuiaDriveFileUncheckedCreateInput,
      update: data,
    });
  }
  console.log(
    JSON.stringify({
      guias: plan.guias.length,
      lines: plan.lines.length,
      clients: plan.clients.length,
      rates: plan.rates.length,
      stock: insertedStock,
      documents: plan.documents.length,
      driveFiles: plan.driveFiles.length,
      parties: parsed.parties?.length ?? 0,
      refusedGuias: plan.refusedGuias,
      skippedStock: plan.skippedStock,
      skippedExistingStock,
    }),
  );
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]"));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
