import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fitAirline, pieceWeightText, renderLabelsPdf, zplAirline } from "./label";

test("labels use the average piece weight and keep a long airline on one line", async () => {
  assert.equal(pieceWeightText(340, 12), "28.33 kg");
  assert.equal(pieceWeightText(120, 4), "30 kg");
  assert.equal(pieceWeightText(340, 0), "");
  const measure = (size: number, text: string) => text.length * size * 0.6;
  const fitted = fitAirline(measure, "AEROLINEAS ARGENTINAS DE CARGA INTERNACIONAL OPERATING AS ISSUING CARRIER", 256);
  assert.equal(fitted.size <= 8, true);
  assert.equal(fitted.text.endsWith("..."), true);
  assert.equal(measure(fitted.size, fitted.text) <= 256, true);
  assert.equal(zplAirline("AEROLINEAS ARGENTINAS DE CARGA INTERNACIONAL").endsWith("..."), true);

  const pdf = await renderLabelsPdf({
    airline: "AEROLINEAS ARGENTINAS DE CARGA INTERNACIONAL OPERATING AS ISSUING CARRIER",
    awb: "997-10000001",
    prefix: "997",
    serial: "10000001",
    origin: "BOG",
    destination: "MIA",
    pieces: 2,
    totalWeight: pieceWeightText(340, 12),
    hawb: "H44110",
  });
  const text = pdfText(pdf);
  assert.match(text, /997-10000001/);
  assert.match(text, /HAWB\s+H44110/);
  assert.match(text, /28\.33 kg/);
  assert.doesNotMatch(text, /340 kg/);
  assert.match(text, /AEROLINEAS ARGENTINAS/);
});

function pdfText(pdf: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), "guia-label-"));
  const file = join(dir, "labels.pdf");
  writeFileSync(file, pdf);
  const result = spawnSync("pdftotext", ["-raw", file, "-"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.replace(/\s+/g, " ");
}
