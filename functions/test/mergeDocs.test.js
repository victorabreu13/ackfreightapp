const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { PDFDocument } = require("pdf-lib");
const { mergeToPdf, sniff } = require("../mergeDocs");

// A 1x1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function pdfWithPages(n) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage([300, 300]);
  return Buffer.from(await doc.save());
}

describe("merge documents into one PDF", () => {
  it("recognizes PDF, PNG and JPG by their first bytes", () => {
    assert.equal(sniff(Buffer.from("%PDF-1.7")), "pdf");
    assert.equal(sniff(PNG), "png");
    assert.equal(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "jpg");
    assert.equal(sniff(Buffer.from("hello world")), null);
  });

  it("puts PDF pages and images into one document, in order", async () => {
    const result = await mergeToPdf([await pdfWithPages(2), PNG, await pdfWithPages(1)]);
    assert.equal(result.pages, 4);
    assert.equal(result.skipped, 0);
    const reread = await PDFDocument.load(result.bytes);
    assert.equal(reread.getPageCount(), 4);
  });

  it("skips files it can't print and counts them", async () => {
    const result = await mergeToPdf([await pdfWithPages(1), Buffer.from("not a document"), Buffer.from("%PDF-broken")]);
    assert.equal(result.pages, 1);
    assert.equal(result.skipped, 2);
  });
});
