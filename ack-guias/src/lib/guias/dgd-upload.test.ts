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
