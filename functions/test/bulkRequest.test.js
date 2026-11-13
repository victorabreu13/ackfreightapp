const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanBulkRequest, bulkRequestDoc } = require("../bulkRequest");

const ctx = { customerId: "cust1", bucket: "ack-freight.appspot.com" };
const REQ = "AbCdEfGhIjKlMnOpQrSt";
const fileUrl = (customer, req, name) =>
  "https://firebasestorage.googleapis.com/v0/b/" +
  ctx.bucket +
  "/o/" +
  encodeURIComponent("tripRequestDocs/" + customer + "/" + req + "/" + name) +
  "?alt=media&token=t";

const body = (over) => ({
  requestId: REQ,
  tripDate: "2026-11-20",
  from: "Atlas",
  to: "Kope",
  personRequesting: "Ana",
  pickupTime: "09:30",
  awbLines: [
    {
      awbNumber: "045-54066773",
      qtyPieces: 2,
      kilograms: 10,
      type: "PMC",
      awbFile: { url: fileUrl("cust1", REQ, "awb-0.pdf"), name: "awb.pdf" },
    },
  ],
  ...over,
});

test("accepts a request with files uploaded for this request", () => {
  const r = cleanBulkRequest(body(), ctx);
  assert.equal(r.ok, true);
  assert.equal(r.value.awbLines[0].awbFile.name, "awb.pdf");
  assert.equal(r.value.awbLines[0].loaFile, null);
  assert.equal(r.value.pickupTime, "09:30");
});

test("refuses files that belong to another customer or another request", () => {
  const line = (extra) => ({ awbNumber: "1", qtyPieces: 1, kilograms: 1, ...extra });
  const other = body({ awbLines: [line({ awbFile: { url: fileUrl("someoneElse", REQ, "a.pdf"), name: "a.pdf" } })] });
  assert.equal(cleanBulkRequest(other, ctx).ok, false);
  const otherReq = body({ awbLines: [line({ doFile: { url: fileUrl("cust1", "ZzZzZzZzZzZzZzZzZzZz", "a.pdf"), name: "a.pdf" } })] });
  assert.equal(cleanBulkRequest(otherReq, ctx).ok, false);
  const elsewhere = body({ awbLines: [line({ awbFile: { url: "https://evil.example/x.pdf", name: "x.pdf" } })] });
  assert.equal(cleanBulkRequest(elsewhere, ctx).ok, false);
});

test("refuses missing header fields and duplicates inside the list", () => {
  assert.equal(cleanBulkRequest(body({ from: "" }), ctx).ok, false);
  assert.equal(cleanBulkRequest(body({ to: "" }), ctx).ok, false);
  assert.equal(cleanBulkRequest(body({ personRequesting: " " }), ctx).ok, false);
  assert.equal(cleanBulkRequest(body({ tripDate: "20/11/2026" }), ctx).ok, false);
  assert.equal(cleanBulkRequest(body({ requestId: "x" }), ctx).ok, false);
  const dup = body({
    awbLines: [
      { awbNumber: "045-5", qtyPieces: 1, kilograms: 1 },
      { awbNumber: "0455", qtyPieces: 1, kilograms: 1 },
    ],
  });
  assert.equal(cleanBulkRequest(dup, ctx).ok, false);
});

test("import fee files are kept, and must be this request's own uploads", () => {
  const fee = { url: fileUrl("cust1", REQ, "fee-0.pdf"), name: "Import Fee.pdf" };
  const ok = cleanBulkRequest(body({ importFeeFiles: [fee] }), ctx);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value.importFeeFiles, [fee]);
  const doc = bulkRequestDoc(ok.value, { id: "cust1", name: "Cust", email: "c@x.com" }, 1);
  assert.deepEqual(doc.importFeeFiles, [fee]);
  assert.equal(cleanBulkRequest(body({ importFeeFiles: [{ url: fileUrl("other", REQ, "f.pdf"), name: "f.pdf" }] }), ctx).ok, false);
  assert.deepEqual(cleanBulkRequest(body(), ctx).value.importFeeFiles, []);
});

test("takes up to 100 AWBs", () => {
  const many = Array.from({ length: 100 }, (_, i) => ({ awbNumber: "176-" + String(10000000 + i), qtyPieces: 1, kilograms: 1 }));
  assert.equal(cleanBulkRequest(body({ awbLines: many }), ctx).ok, true);
  const tooMany = [...many, { awbNumber: "999-99999999", qtyPieces: 1, kilograms: 1 }];
  assert.equal(cleanBulkRequest(body({ awbLines: tooMany }), ctx).ok, false);
});

test("the stored request looks like one the app writes", () => {
  const v = cleanBulkRequest(body(), ctx).value;
  const doc = bulkRequestDoc(v, { id: "cust1", name: "Cust", email: "c@x.com" }, 123);
  assert.equal(doc.status, "submitted");
  assert.deepEqual(doc.assignedDriverIds, []);
  assert.equal(doc.awbLines[0].status, "submitted");
  assert.equal(doc.awbLines[0].priority, "Normal");
  assert.deepEqual(doc.importFeeFiles, []);
  assert.equal(doc.customerEmail, "c@x.com");
});
