import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AwbLine, newAwbLine, TripRequest } from "../types";
import { documentCount, duplicateRequestGroups, previewCopies, suggestedKeep } from "./duplicateRequests";

const file = (name: string) => ({ url: "https://files.example/" + name, name });
const line = (awb: string, extra: Partial<AwbLine> = {}): AwbLine => ({ ...newAwbLine(), awbNumber: awb, ...extra });
function req(id: string, lines: AwbLine[], extra: Partial<TripRequest> = {}): TripRequest {
  return { id, customerId: "c1", customerName: "Ivi", status: "submitted", awbLines: lines, importFeeFiles: [], createdAt: 1, ...extra } as unknown as TripRequest;
}

describe("duplicate trip request groups", () => {
  it("groups active requests that share an AWB, however it was typed", () => {
    const groups = duplicateRequestGroups([
      req("a", [line("045-54066773")]),
      req("b", [line("045 54066773"), line("777-1")]),
      req("c", [line("888-2")]),
      req("d", [line("045-54066773")], { status: "cancelled" }),
    ]);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].requests.map((r) => r.id), ["a", "b"]);
  });

  it("does not group a request with itself", () => {
    assert.equal(duplicateRequestGroups([req("a", [line("1"), line("1")])]).length, 0);
  });

  it("previews the documents a merge would add and suggests the fuller request", () => {
    const keep = req("a", [line("045-54066773", { awbFile: file("awb.pdf") })], { createdAt: 5 });
    const other = req("b", [line("045 54066773", { awbFile: file("awb2.pdf"), loaFile: file("loa.pdf"), doFile: file("do.pdf") })], { createdAt: 1 });
    const key = "04554066773";
    assert.deepEqual(previewCopies(keep, other, key), ["Letter of Authorization", "Delivery Order"]);
    assert.equal(documentCount(other, key), 3);
    const group = duplicateRequestGroups([keep, other])[0];
    assert.equal(suggestedKeep(group).id, "b");
  });
});
