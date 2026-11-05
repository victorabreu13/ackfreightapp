/**
 * Builds src/lib/guias/dg/un-table.json from the Hazardous Materials Table in 49 CFR 172.101,
 * a public US government document published on eCFR. The table gives, for each UN number, the proper
 * shipping name, hazard class or division, packing group, label codes, and the passenger and cargo
 * aircraft quantity limits.
 *
 *   node scripts/build-un-table.mjs [path-to-172.101.xml]
 *
 * Without a path it downloads the current section from eCFR. Run it again when the table is amended.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "../src/lib/guias/dg/un-table.json");

async function load() {
  const path = process.argv[2];
  if (path) return readFileSync(path, "utf8");
  const versions = await (await fetch("https://www.ecfr.gov/api/versioner/v1/versions/title-49.json?part=172&section=172.101")).json();
  const latest = versions.content_versions.map((row) => row.date).sort().at(-1);
  const response = await fetch(`https://www.ecfr.gov/api/versioner/v1/full/${latest}/title-49.xml?part=172&section=172.101`, {
    headers: { "accept-encoding": "gzip" },
  });
  if (!response.ok) throw new Error(`eCFR answered ${response.status}`);
  return response.text();
}

const clean = (value) =>
  value
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x?[0-9a-f]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const xml = await load();
const entries = new Map();
for (const row of xml.match(/<TR>[\s\S]*?<\/TR>/g) ?? []) {
  const cells = [...row.matchAll(/<TD[^>]*>([\s\S]*?)<\/TD>/g)].map((match) => clean(match[1]));
  if (cells.length < 12) continue;
  const [symbols, name, cls, id, pg, labels, , , , , pax, cargo] = cells;
  if (!/^UN\d{4}$/.test(id) || !cls) continue;
  // Two rows in the published table run their label codes together: "8.6.1" is 8 and 6.1, "6.1. 4.1" is 6.1 and 4.1.
  const labelCodes = labels
    .replace("8.6.1", "8, 6.1")
    .replace("6.1. 4.1", "6.1, 4.1")
    .split(/[,;]/)
    .map((code) => code.trim())
    .filter((code) => code && !/^(none|empty)$/i.test(code));
  const key = `${id}|${pg}`;
  if (entries.has(key)) continue;
  entries.set(key, { un: id.slice(2), name, cls, pg, labels: labelCodes, pax, cargo, symbols });
}

const list = [...entries.values()].sort((a, b) => a.un.localeCompare(b.un) || a.pg.localeCompare(b.pg));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(list)}\n`);
console.log(`${list.length} entries, ${new Set(list.map((row) => row.un)).size} UN numbers -> ${out}`);
