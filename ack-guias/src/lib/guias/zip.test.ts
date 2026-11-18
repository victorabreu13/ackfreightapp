import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { zipStored } from "./zip";

test("a stored zip keeps every file name and the bytes", () => {
  const zip = zipStored([
    { name: "045-55219415 - GUIA MADRE.pdf", data: Buffer.from("%PDF awb") },
    { name: "DO-045-55219415.pdf", data: Buffer.from("%PDF do") },
    { name: "ERRORS.txt", data: Buffer.from("labels: Issue the guía first") },
  ]);
  const dir = mkdtempSync(join(tmpdir(), "guia-zip-"));
  const file = join(dir, "docs.zip");
  writeFileSync(file, zip);
  const listed = spawnSync("unzip", ["-l", file], { encoding: "utf8" });
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /GUIA MADRE.pdf/);
  assert.match(listed.stdout, /DO-045-55219415.pdf/);
  assert.match(listed.stdout, /ERRORS.txt/);
  const extracted = spawnSync("unzip", ["-o", file, "-d", dir], { encoding: "utf8" });
  assert.equal(extracted.status, 0, extracted.stderr);
  assert.equal(readFileSync(join(dir, "ERRORS.txt"), "utf8"), "labels: Issue the guía first");
  assert.equal(readFileSync(join(dir, "DO-045-55219415.pdf"), "utf8"), "%PDF do");
});
