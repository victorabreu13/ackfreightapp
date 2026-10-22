/**
 * Read-only export of ACK TEAM LLC guías from the old database.
 * Run once in Cloud Shell. Set KOPE_SOURCE_DATABASE_URL in the environment.
 * The URL is never printed.
 */
import { writeFileSync } from "node:fs";
import { Client } from "pg";
import { exportCounts, redactDatabaseUrl, shapeAckExport } from "../src/lib/ack-transfer";

const sourceUrl = process.env.KOPE_SOURCE_DATABASE_URL?.trim() ?? "";
const outFlag = process.argv.indexOf("--out");
const outPath = outFlag >= 0 ? process.argv[outFlag + 1] : "";

function fail(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  console.error(redactDatabaseUrl(message, sourceUrl));
  process.exit(1);
}

if (!sourceUrl) fail(new Error("Set KOPE_SOURCE_DATABASE_URL. The value is not printed."));
if (!outPath) fail(new Error("Pass --out path.json"));

const client = new Client({
  connectionString: sourceUrl,
  options: "-c default_transaction_read_only=on",
});

async function main() {
  await client.connect();
  await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
  const guias = await client.query(
    `SELECT d.*
     FROM "AirWaybillDocument" d
     JOIN "IssuingAgent" a ON a.key = d."agentKey"
     WHERE d.product = 'guia'
       AND a.key = 'ack'
       AND a."legalName" = 'ACK TEAM LLC'`,
  );
  const ids = guias.rows.map((row) => String(row.id));
  const clientIds = guias.rows.map((row) => row.guiaClientId).filter((id): id is string => typeof id === "string" && id.length > 0);
  const [lines, clients, rates, stock, documents, driveFiles] = await Promise.all([
    client.query(`SELECT * FROM "AwbGoodsLine" WHERE "documentId" = ANY($1::text[])`, [ids]),
    client.query(`SELECT * FROM "GuiaClient" WHERE id = ANY($1::text[]) AND "agentKey" = 'ack'`, [clientIds]),
    client.query(`SELECT * FROM "ClientAgreedRate" WHERE "guiaClientId" = ANY($1::text[]) AND "agentKey" = 'ack'`, [clientIds]),
    client.query(`SELECT * FROM "AwbStockNumber" WHERE "agentKey" = 'ack' AND prefix IN ('045', '810')`),
    client.query(
      `SELECT * FROM "GuiaDocument" WHERE "guiaId" = ANY($1::text[]) OR (company = 'ack' AND ("guiaId" IS NULL OR "guiaId" = ANY($1::text[])))`,
      [ids],
    ),
    client.query(`SELECT * FROM "GuiaDriveFile" WHERE "documentId" = ANY($1::text[])`, [ids]),
  ]);
  const file = shapeAckExport({
    guias: guias.rows,
    lines: lines.rows,
    clients: clients.rows,
    rates: rates.rows,
    stock: stock.rows,
    documents: documents.rows,
    driveFiles: driveFiles.rows,
  });
  writeFileSync(outPath, JSON.stringify(file));
  console.log(JSON.stringify(exportCounts(file)));
}

main()
  .catch(fail)
  .finally(async () => {
    await client.end().catch(() => undefined);
  });
