import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { prisma } from "@/lib/db";
import { logLookup } from "./document-log";
import type { DriveFetch } from "./drive";
import {
  MAX_UPLOAD_BYTES,
  UPLOAD_KIND,
  acceptUpload,
  canDeleteGuiaUpload,
  contentDisposition,
  safeGuiaReturn,
  safeUploadFileName,
} from "./upload-rules";
import { deleteUploadedFile, storeGuiaUpload } from "./uploads";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const serviceAccountJson = JSON.stringify({
  client_email: "drive-test@example.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function mockDrive(trashStatus = 200) {
  const contentTypes: string[] = [];
  const folders = new Map<string, string>();
  let n = 0;
  const fetchImpl: DriveFetch = async (url, init) => {
    const method = init?.method ?? "GET";
    if (url.includes("oauth2.googleapis.com/token")) return json({ access_token: "tok" });
    if (method === "GET" && url.includes("/drive/v3/files/") && !url.includes("/files?")) return json({ id: "root", name: "Shared drives" });
    if (method === "GET" && url.includes("/drive/v3/files?")) {
      const query = decodeURIComponent(new URL(url).searchParams.get("q") ?? "");
      const name = query.match(/name = '([^']+)'/)?.[1] ?? "";
      const id = folders.get(name);
      return json({ files: id ? [{ id }] : [] });
    }
    const raw = typeof init?.body === "string" ? init.body : "";
    if (method === "POST" && !url.includes("uploadType")) {
      const parsed = JSON.parse(raw) as { name?: string };
      n += 1;
      const id = `folder-${n}`;
      folders.set(parsed.name ?? "", id);
      return json({ id });
    }
    if (url.includes("uploadType=media")) {
      contentTypes.push(new Headers(init?.headers).get("content-type") ?? "");
      n += 1;
      return json({ id: `drive-${n}` });
    }
    if (method === "PATCH" && raw.includes("trashed")) return json({ id: "gone" }, trashStatus);
    if (method === "PATCH") return json({ id: "named" });
    return json({}, 500);
  };
  return { fetchImpl, contentTypes };
}

test("upload names, types, and delete rights", () => {
  assert.equal(safeUploadFileName("C:\\inbox\\packing list.xlsx"), "packing list.xlsx");
  assert.equal(safeUploadFileName("../../AWB_729-95048310.pdf"), "AWB_729-95048310.pdf");
  assert.equal(safeUploadFileName("   "), "archivo");

  const sheet = acceptUpload({ name: "reports/packing-list.xlsx", type: "", byteLength: 42 });
  assert.equal(sheet.ok, true);
  if (!sheet.ok) return;
  assert.equal(sheet.fileName, "packing-list.xlsx");
  assert.equal(sheet.mime, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(sheet.size, 42);

  const photo = acceptUpload({ name: "foto.png", type: "image/png", byteLength: 8 });
  assert.equal(photo.ok, true);
  if (photo.ok) assert.equal(photo.mime, "image/png");

  const empty = acceptUpload({ name: "vacio.pdf", type: "application/pdf", byteLength: 0 });
  assert.equal(empty.ok, false);
  const huge = acceptUpload({ name: "grande.xlsx", type: "", byteLength: MAX_UPLOAD_BYTES + 1 });
  assert.equal(huge.ok, false);

  assert.equal(canDeleteGuiaUpload({ role: "OPERATIONS", email: "ops@kopelogistics.com" }, "other@kopelogistics.com"), true);
  assert.equal(canDeleteGuiaUpload({ role: "ADMIN", email: "andres.alvarado@kopelogistics.com" }, "ops@kopelogistics.com"), true);
  assert.equal(canDeleteGuiaUpload({ role: "REP", email: "rep@kopelogistics.com" }, "rep@kopelogistics.com"), true);
  assert.equal(canDeleteGuiaUpload({ role: "REP", email: "rep@kopelogistics.com" }, "ops@kopelogistics.com"), false);
  assert.equal(canDeleteGuiaUpload({ role: "CLIENT", email: "client@example.com" }, "ops@kopelogistics.com"), false);
  assert.equal(canDeleteGuiaUpload({ role: "ACCOUNTING", email: "acct@kopelogistics.com" }, "ops@kopelogistics.com"), false);

  assert.equal(safeGuiaReturn("/guias/abc?kind=UPLOAD", "/guias"), "/guias/abc?kind=UPLOAD");
  assert.equal(safeGuiaReturn("https://evil.example/guias", "/guias"), "/guias");
  assert.equal(safeGuiaReturn("//evil.example", "/guias"), "/guias");
  assert.match(contentDisposition("lista.xlsx"), /filename="lista.xlsx"/);
  assert.match(contentDisposition("lista.xlsx"), /filename\*=UTF-8''lista.xlsx/);

  const lookup = logLookup({
    source: "upload",
    guiaId: "guia-1",
    awb: "draft-abcd1234",
    company: "ack",
    kind: UPLOAD_KIND,
    fileName: "AWB_729-95048310.pdf",
  });
  assert.deepEqual(lookup, {
    source: "upload",
    guiaId: "guia-1",
    kind: "UPLOAD",
    fileName: "AWB_729-95048310.pdf",
  });

  const page = readFileSync(new URL("../../app/(portal)/guias/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<GuiaUploads/);
  assert.equal(page.includes('status === "issued"') && page.indexOf("<GuiaUploads") > page.indexOf('status === "issued"'), true);
});

test("a guía keeps each uploaded file, even when the name looks like an AWB", { skip: !process.env.DATABASE_URL }, async () => {
  const stamp = Date.now();
  const drive = mockDrive();
  await prisma.issuingAgent.upsert({
    where: { key: "upload-test" },
    update: {},
    create: {
      key: "upload-test",
      legalName: "Upload Test",
      address: "1 Test",
      city: "MIA",
      iataCode: "0000000",
      signatureLine: "Test",
    },
  });
  const guia = await prisma.airWaybillDocument.create({
    data: {
      agentKey: "upload-test",
      awb: "",
      prefix: "",
      serial: "",
      product: "guia",
      status: "draft",
      clientLabel: `Upload Client ${stamp}`,
    },
  });
  const common = {
    guiaId: guia.id,
    client: `Upload Client ${stamp}`,
    awb: `draft-${guia.id.slice(0, 8)}`,
    company: "upload-test",
    uploadedBy: "ops@kopelogistics.com",
    rootId: "root-id",
    libraryName: "ACK Guías",
    fetchImpl: drive.fetchImpl,
    serviceAccountJson,
  };
  try {
    const sheet = await storeGuiaUpload({
      ...common,
      fileName: `packing-${stamp}.xlsx`,
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: 18,
      bytes: Buffer.from("pk-spreadsheet"),
    });
    const photo = await storeGuiaUpload({
      ...common,
      fileName: `foto-${stamp}.png`,
      mime: "image/png",
      size: 4,
      bytes: Buffer.from("png"),
    });
    const namedLikeAwb = await storeGuiaUpload({
      ...common,
      fileName: `AWB_${stamp}.pdf`,
      mime: "application/pdf",
      size: 9,
      bytes: Buffer.from("%PDF-test"),
    });
    assert.equal(sheet.kind, UPLOAD_KIND);
    assert.equal(photo.kind, UPLOAD_KIND);
    assert.equal(namedLikeAwb.kind, UPLOAD_KIND);
    assert.equal(sheet.source, "upload");
    assert.equal(sheet.generatedBy, "ops@kopelogistics.com");
    assert.equal(sheet.mime, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    assert.equal(sheet.size, 18);
    assert.equal(sheet.driveFileId?.startsWith("drive-"), true);
    assert.notEqual(sheet.id, photo.id);
    assert.equal(await prisma.guiaDriveFile.count({ where: { documentId: guia.id } }), 0);
    assert.deepEqual(drive.contentTypes, [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "image/png",
      "application/pdf",
    ]);

    const again = await storeGuiaUpload({
      ...common,
      fileName: `packing-${stamp}.xlsx`,
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: 30,
      bytes: Buffer.from("pk-spreadsheet-2"),
    });
    assert.equal(again.id, sheet.id);
    assert.equal(again.size, 30);
    assert.equal(await prisma.guiaDocument.count({ where: { guiaId: guia.id, kind: UPLOAD_KIND } }), 3);

    const denied = await deleteUploadedFile({
      id: photo.id,
      actor: { role: "REP", email: "rep@kopelogistics.com" },
      fetchImpl: drive.fetchImpl,
      serviceAccountJson,
    });
    assert.equal(denied.ok, false);
    assert.equal(await prisma.guiaDocument.count({ where: { id: photo.id } }), 1);

    const removed = await deleteUploadedFile({
      id: photo.id,
      actor: { role: "OPERATIONS", email: "ops@kopelogistics.com" },
      fetchImpl: drive.fetchImpl,
      serviceAccountJson,
    });
    assert.equal(removed.ok, true);
    assert.equal(await prisma.guiaDocument.count({ where: { id: photo.id } }), 0);

    const owned = await storeGuiaUpload({
      ...common,
      fileName: `nota-${stamp}.txt`,
      mime: "text/plain",
      size: 3,
      bytes: Buffer.from("hey"),
      uploadedBy: "rep@kopelogistics.com",
    });
    const byOwner = await deleteUploadedFile({
      id: owned.id,
      actor: { role: "REP", email: "rep@kopelogistics.com" },
      fetchImpl: drive.fetchImpl,
      serviceAccountJson,
    });
    assert.equal(byOwner.ok, true);

    const stuck = mockDrive(500);
    const blocked = await storeGuiaUpload({
      ...common,
      fileName: `stuck-${stamp}.csv`,
      mime: "text/csv",
      size: 3,
      bytes: Buffer.from("a,b"),
      fetchImpl: stuck.fetchImpl,
    });
    const failedTrash = await deleteUploadedFile({
      id: blocked.id,
      actor: { role: "ADMIN", email: "andres.alvarado@kopelogistics.com" },
      fetchImpl: stuck.fetchImpl,
      serviceAccountJson,
    });
    assert.equal(failedTrash.ok, false);
    assert.equal(await prisma.guiaDocument.count({ where: { id: blocked.id } }), 1);
  } finally {
    await prisma.guiaDocument.deleteMany({ where: { guiaId: guia.id } });
    await prisma.guiaDriveFile.deleteMany({ where: { documentId: guia.id } });
    await prisma.airWaybillDocument.delete({ where: { id: guia.id } });
    await prisma.issuingAgent.delete({ where: { key: "upload-test" } }).catch(() => undefined);
    await prisma.$disconnect();
  }
});
