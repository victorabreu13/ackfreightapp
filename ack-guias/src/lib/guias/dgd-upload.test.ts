import assert from "node:assert/strict";
import test from "node:test";
import { dgdUploadName, isDgdUpload } from "@/lib/guias/upload-rules";

test("the signed DGD is an upload named DGD with the AWB number", () => {
  assert.equal(dgdUploadName("045-53981966", "scan 001.pdf"), "DGD 045-53981966 - scan 001.pdf");
  assert.equal(dgdUploadName("", "scan.pdf"), "DGD DRAFT - scan.pdf");
  assert.equal(dgdUploadName("045-53981966", "DGD signed.pdf"), "DGD signed.pdf");
  assert.equal(isDgdUpload("DGD 045-53981966 - scan.pdf"), true);
  assert.equal(isDgdUpload("dgd.pdf"), true);
  assert.equal(isDgdUpload("Packing list.pdf"), false);
  assert.equal(isDgdUpload("DGDX.pdf"), false);
});

test("the invoices and manifests of a guía are told apart by their name", async () => {
  const { categoryUploadName, isCategoryUpload, isUploadCategory } = await import("@/lib/guias/upload-rules");
  assert.equal(categoryUploadName("invoice", "045-53981966", "scan 001.pdf"), "FACTURA-MANIFIESTO 045-53981966 - scan 001.pdf");
  assert.equal(categoryUploadName("invoice", "", "scan.pdf"), "FACTURA-MANIFIESTO DRAFT - scan.pdf");
  assert.equal(categoryUploadName("invoice", "045-1", "Factura 55.pdf"), "Factura 55.pdf");
  assert.equal(categoryUploadName("dgd", "045-1", "scan.pdf"), "DGD 045-1 - scan.pdf");
  assert.equal(isCategoryUpload("invoice", "manifest.xlsx"), true);
  assert.equal(isCategoryUpload("invoice", "DGD 045-1 - scan.pdf"), false);
  assert.equal(isCategoryUpload("dgd", "FACTURA-MANIFIESTO 045-1 - a.pdf"), false);
  assert.equal(isUploadCategory("invoice"), true);
  assert.equal(isUploadCategory("other"), false);
});
