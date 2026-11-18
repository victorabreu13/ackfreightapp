/**
 * Read-only export of ACK TEAM LLC guías from the live Kope database.
 * The deployed schema uses public.Client and ClientAgreedRate.clientId.
 * GuiaClient is optional and is used only when that table is present.
 * Set KOPE_SOURCE_DATABASE_URL in the environment. The URL is never printed.
 */
import { writeFileSync } from "node:fs";
import { Client } from "pg";
import {
  KOPE_CLIENT_COLUMNS,
  KOPE_DOCUMENT_COLUMNS,
  KOPE_DRIVE_COLUMNS,
  KOPE_GUIA_COLUMNS,
  KOPE_LINE_COLUMNS,
  KOPE_PARTY_COLUMNS,
  KOPE_RATE_COLUMNS,
  KOPE_STOCK_COLUMNS,
  adaptKopeSource,
  columnsToSelect,
  exportCounts,
  quotedSelectList,
  redactDatabaseUrl,
  shapeAckExport,
} from "../src/lib/ack-transfer";

const TABLES = [
  "AirWaybillDocument",
  "Client",
  "GuiaClient",
  "ClientAgreedRate",
  "AwbGoodsLine",
  "AwbParty",
  "AwbStockNumber",
  "GuiaDocument",
  "GuiaDriveFile",
] as const;

type TableName = (typeof TABLES)[number];

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

function ids(rows: Array<Record<string, unknown>>, key: string): string[] {
  return [...new Set(rows.map((row) => row[key]).filter((id): id is string => typeof id === "string" && id.length > 0))];
}

async function main() {
  await client.connect();
  await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
  const listed = await client.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [TABLES],
  );
  const columns = new Map<TableName, string[]>();
  for (const table of TABLES) columns.set(table, []);
  for (const row of listed.rows) {
    const table = row.table_name as TableName;
    if (!columns.has(table)) continue;
    columns.get(table)?.push(row.column_name);
  }

  async function selectWhere(table: TableName, wanted: readonly string[], whereSql: string, params: unknown[]) {
    const present = columnsToSelect(columns.get(table) ?? [], wanted);
    if (present.length === 0) return [] as Array<Record<string, unknown>>;
    const sql = `SELECT ${quotedSelectList(present)} FROM "${table}" WHERE ${whereSql}`;
    const result = await client.query<Record<string, unknown>>(sql, params);
    return result.rows;
  }

  const guiaColumns = columns.get("AirWaybillDocument") ?? [];
  if (!guiaColumns.includes("agentKey") || !guiaColumns.includes("product")) {
    throw new Error('AirWaybillDocument is missing "agentKey" or "product".');
  }
  const guias = await selectWhere("AirWaybillDocument", KOPE_GUIA_COLUMNS, `product = 'guia' AND "agentKey" = 'ack'`, []);
  const guiaIds = ids(guias, "id");
  const guiaClientIds = [...new Set([...ids(guias, "clientId"), ...ids(guias, "guiaClientId")])];
  const rateColumns = columns.get("ClientAgreedRate") ?? [];
  const rateQuery = rateColumns.includes("agentKey")
    ? { where: `"agentKey" = 'ack'`, params: [] as unknown[] }
    : rateColumns.includes("clientId")
      ? { where: `"clientId" = ANY($1::text[])`, params: [guiaClientIds] }
      : rateColumns.includes("guiaClientId")
        ? { where: `"guiaClientId" = ANY($1::text[])`, params: [guiaClientIds] }
        : { where: "FALSE", params: [] as unknown[] };
  const rates = await selectWhere("ClientAgreedRate", KOPE_RATE_COLUMNS, rateQuery.where, rateQuery.params);
  const clientIds = [
    ...new Set([...ids(guias, "clientId"), ...ids(guias, "guiaClientId"), ...ids(rates, "clientId"), ...ids(rates, "guiaClientId")]),
  ];
  const bookClientIds = [...new Set([...ids(guias, "clientId"), ...ids(rates, "clientId")])];
  const [bookClients, guiaClients, lines, parties, stock, documents, driveFiles] = await Promise.all([
    selectWhere("Client", KOPE_CLIENT_COLUMNS, "id = ANY($1::text[])", [clientIds]),
    selectWhere(
      "GuiaClient",
      KOPE_CLIENT_COLUMNS,
      (columns.get("GuiaClient") ?? []).includes("agentKey") ? `id = ANY($1::text[]) AND "agentKey" = 'ack'` : "id = ANY($1::text[])",
      [clientIds],
    ),
    selectWhere("AwbGoodsLine", KOPE_LINE_COLUMNS, `"documentId" = ANY($1::text[])`, [guiaIds]),
    selectWhere("AwbParty", KOPE_PARTY_COLUMNS, `"clientId" = ANY($1::text[])`, [bookClientIds]),
    selectWhere(
      "AwbStockNumber",
      KOPE_STOCK_COLUMNS,
      (columns.get("AwbStockNumber") ?? []).includes("agentKey") ? `"agentKey" = 'ack'` : `"documentId" = ANY($1::text[])`,
      (columns.get("AwbStockNumber") ?? []).includes("agentKey") ? [] : [guiaIds],
    ).then((rows) =>
      (columns.get("AwbStockNumber") ?? []).includes("agentKey") ? rows : rows.map((row) => ({ ...row, agentKey: "ack" })),
    ),
    selectWhere(
      "GuiaDocument",
      KOPE_DOCUMENT_COLUMNS,
      (columns.get("GuiaDocument") ?? []).includes("company")
        ? `"guiaId" = ANY($1::text[]) OR company = 'ack'`
        : `"guiaId" = ANY($1::text[])`,
      [guiaIds],
    ),
    selectWhere("GuiaDriveFile", KOPE_DRIVE_COLUMNS, `"documentId" = ANY($1::text[])`, [guiaIds]),
  ]);
  const adapted = adaptKopeSource({
    guias,
    lines,
    clients: [...bookClients, ...guiaClients],
    rates,
    stock,
    documents,
    driveFiles,
    parties,
  });
  const file = shapeAckExport(adapted);
  writeFileSync(outPath, JSON.stringify(file));
  console.log(JSON.stringify(exportCounts(file)));
}

main()
  .catch(fail)
  .finally(async () => {
    await client.end().catch(() => undefined);
  });
