import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { downloadDriveFile, resolveDriveLibrary, trashDriveFile, uploadDrivePdf, type DriveFetch } from "./drive";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const serviceAccountJson = JSON.stringify({
  client_email: "drive-test@example.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function mockDrive(rootName: string) {
  const folders = new Map<string, string>();
  const created: string[] = [];
  const fetchImpl: DriveFetch = async (url, init) => {
    const method = init?.method ?? "GET";
    if (url.includes("oauth2.googleapis.com/token")) return json({ access_token: "tok" });
    if (method === "GET" && url.includes("/drive/v3/files/") && !url.includes("/files?")) {
      return json({ id: "root", name: rootName });
    }
    if (method === "GET" && url.includes("/drive/v3/files?")) {
      const query = decodeURIComponent(new URL(url).searchParams.get("q") ?? "");
      const name = query.match(/name = '([^']+)'/)?.[1] ?? "";
      const id = folders.get(name);
      return json({ files: id ? [{ id }] : [] });
    }
    const raw = typeof init?.body === "string" ? init.body : "";
    if (method === "POST" && url.includes("/drive/v3/files?") && !url.includes("uploadType")) {
      const parsed = JSON.parse(raw) as { name?: string };
      const name = parsed.name ?? "";
      created.push(name);
      const id = `folder-${created.length}`;
      folders.set(name, id);
      return json({ id, name });
    }
    if (url.includes("uploadType=media")) return json({ id: "pdf-1" });
    if (method === "PATCH") return json({ id: "pdf-1" });
    return json({}, 500);
  };
  return { fetchImpl, created };
}

const upload = {
  rootId: "root-id",
  clientName: "PINTO INTERNATIONAL LOGISTICS",
  awbFolder: "729-95048310",
  fileName: "DO_729-95048310.pdf",
  bytes: Buffer.from("%PDF-1.4"),
  serviceAccountJson,
};

test("the library folder defaults to ACK Guías and a blank override removes it", () => {
  assert.equal(resolveDriveLibrary(undefined), "ACK Guías");
  assert.equal(resolveDriveLibrary(""), "");
  assert.equal(resolveDriveLibrary("  Archive  "), "Archive");
});

test("uploads land in ACK Guías / client / AWB and reuse folders that already exist", async () => {
  const first = mockDrive("Shared drives");
  const created = await uploadDrivePdf({ ...upload, libraryName: "ACK Guías", fetchImpl: first.fetchImpl });
  assert.deepEqual(first.created, ["ACK Guías", "PINTO INTERNATIONAL LOGISTICS", "729-95048310"]);
  assert.equal(created.id, "pdf-1");
  assert.equal(created.url, "https://drive.google.com/file/d/pdf-1/view");

  const again = await uploadDrivePdf({ ...upload, libraryName: "ACK Guías", fetchImpl: first.fetchImpl });
  assert.equal(again.id, "pdf-1");
  assert.deepEqual(first.created, ["ACK Guías", "PINTO INTERNATIONAL LOGISTICS", "729-95048310"]);
});

test("a root folder already named ACK Guías is reused instead of nested", async () => {
  const drive = mockDrive("ACK Guías");
  await uploadDrivePdf({ ...upload, libraryName: "ACK Guías", fetchImpl: drive.fetchImpl });
  assert.deepEqual(drive.created, ["PINTO INTERNATIONAL LOGISTICS", "729-95048310"]);
});

test("an empty library name keeps client and AWB directly under the root", async () => {
  const drive = mockDrive("ACK Guías");
  await uploadDrivePdf({ ...upload, libraryName: "", fetchImpl: drive.fetchImpl });
  assert.deepEqual(drive.created, ["PINTO INTERNATIONAL LOGISTICS", "729-95048310"]);
});

test("a team upload sends its own mime and can be downloaded or trashed", async () => {
  const seen: string[] = [];
  let media = "";
  const fetchImpl: DriveFetch = async (url, init) => {
    const method = init?.method ?? "GET";
    if (url.includes("oauth2.googleapis.com/token")) return json({ access_token: "tok" });
    if (url.includes("alt=media")) return new Response(Buffer.from("sheet-bytes"), { status: 200 });
    if (method === "GET" && url.includes("/drive/v3/files/") && !url.includes("/files?")) return json({ id: "root", name: "Shared" });
    if (method === "GET" && url.includes("/drive/v3/files?")) return json({ files: [] });
    if (method === "POST" && !url.includes("uploadType")) return json({ id: "folder-1" });
    if (url.includes("uploadType=media")) {
      seen.push(new Headers(init?.headers).get("content-type") ?? "");
      media = url;
      return json({ id: "sheet-1" });
    }
    if (method === "PATCH" && String(init?.body).includes("trashed")) return json({ id: "sheet-1" });
    if (method === "PATCH") return json({ id: "sheet-1" });
    return json({}, 500);
  };
  const saved = await uploadDrivePdf({
    ...upload,
    fileName: "packing-list.xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    bytes: Buffer.from("PK"),
    fetchImpl,
  });
  assert.equal(saved.id, "sheet-1");
  assert.deepEqual(seen, ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);
  assert.equal(media.includes("uploadType=media"), true);
  const bytes = await downloadDriveFile({ fileId: "sheet-1", serviceAccountJson, fetchImpl });
  assert.equal(bytes.toString(), "sheet-bytes");
  await trashDriveFile({ fileId: "sheet-1", serviceAccountJson, fetchImpl });

  const pdfTypes: string[] = [];
  const pdfFetch: DriveFetch = async (url, init) => {
    if (url.includes("uploadType=media")) pdfTypes.push(new Headers(init?.headers).get("content-type") ?? "");
    return fetchImpl(url, init);
  };
  await uploadDrivePdf({ ...upload, fetchImpl: pdfFetch });
  assert.deepEqual(pdfTypes, ["application/pdf"]);
});
