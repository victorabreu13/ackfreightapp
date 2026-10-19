const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { documentsForRequest, parseStorageUrl, safeName, zipEntryNames } = require("../zipDocs");

const url = (path) =>
  `https://firebasestorage.googleapis.com/v0/b/ack.appspot.com/o/${encodeURIComponent(path)}?alt=media&token=t`;
const mine = (f) => url(`tripRequestDocs/cust1/req1/${f}`);

const request = {
  customerId: "cust1",
  awbLines: [
    {
      awbNumber: "999-1",
      awbFile: { url: mine("awb-0-1-a.pdf"), name: "a.pdf" },
      loaFile: { url: mine("loa-0-1-l.pdf"), name: "l.pdf" },
    },
    { awbNumber: "999-2", doFile: { url: mine("do-1-1-d.pdf"), name: "d.pdf" } },
    { awbNumber: "999-3" },
  ],
};

describe("zip documents", () => {
  it("reads the bucket and path from a Storage download url", () => {
    assert.deepEqual(parseStorageUrl(mine("awb-0-1-a.pdf")), {
      bucket: "ack.appspot.com",
      path: "tripRequestDocs/cust1/req1/awb-0-1-a.pdf",
    });
    assert.equal(parseStorageUrl("https://evil.example/x.pdf"), null);
    assert.equal(parseStorageUrl("not a url"), null);
  });

  it("returns every document when nothing is selected", () => {
    const docs = documentsForRequest(request, "req1", []);
    assert.deepEqual(docs.map((d) => `${d.awbIndex}:${d.slot}`), ["0:awb", "0:loa", "1:do"]);
  });

  it("returns only the selected documents", () => {
    const docs = documentsForRequest(request, "req1", [{ awbIndex: 1, slot: "do" }, { awbIndex: 0, slot: "loa" }]);
    assert.deepEqual(docs.map((d) => `${d.awbIndex}:${d.slot}`), ["0:loa", "1:do"]);
  });

  it("skips files outside this request's folder", () => {
    const stray = {
      customerId: "cust1",
      awbLines: [{ awbNumber: "1", awbFile: { url: url("tripRequestDocs/cust2/req9/x.pdf"), name: "x.pdf" } }],
    };
    assert.deepEqual(documentsForRequest(stray, "req1", []), []);
  });

  it("builds tidy, unique names inside the zip", () => {
    const docs = documentsForRequest(request, "req1", []);
    docs.push({ ...docs[0] });
    const names = zipEntryNames(docs);
    assert.equal(names[0], "999-1/AWB document - a.pdf");
    assert.equal(new Set(names).size, names.length);
    assert.equal(safeName("a/b:c*.pdf"), "a_b_c_.pdf");
  });
});
