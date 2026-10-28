const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { applyPatches, planMerge } = require("../mergeRequests");

const f = (name) => ({ url: "https://files.example/" + name, name });
const line = (awb, extra = {}) => ({ awbNumber: awb, type: "PMC", qtyPieces: 1, kilograms: 0, awbFile: null, loaFile: null, doFile: null, status: "submitted", ...extra });

describe("merge duplicate trip requests", () => {
  it("copies the documents the kept AWB is missing, whatever the AWB's spelling", () => {
    const keep = { awbLines: [line("045-54066773", { awbFile: f("awb.pdf") })], importFeeFiles: [] };
    const other = { awbLines: [line("045 54066773", { awbFile: f("awb2.pdf"), loaFile: f("loa.pdf"), doFile: f("do.pdf"), kilograms: 120 })], importFeeFiles: [] };
    const plan = planMerge(keep, other);
    assert.equal(plan.pairs.length, 1);
    const pair = plan.pairs[0];
    assert.deepEqual(pair.copied, ["Letter of Authorization", "Delivery Order", "Weight"]);
    assert.deepEqual(pair.conflicts, ["AWB document"]); // both have an AWB document, keep's stays
    const lines = applyPatches(keep.awbLines, plan.pairs);
    assert.equal(lines[0].awbFile.name, "awb.pdf");
    assert.equal(lines[0].loaFile.name, "loa.pdf");
    assert.equal(lines[0].kilograms, 120);
  });

  it("ignores AWBs that are not on both requests", () => {
    const keep = { awbLines: [line("111")], importFeeFiles: [] };
    const other = { awbLines: [line("222", { awbFile: f("x.pdf") })], importFeeFiles: [] };
    assert.equal(planMerge(keep, other).pairs.length, 0);
  });

  it("adds import fee files the kept request lacks, once each", () => {
    const keep = { awbLines: [line("1")], importFeeFiles: [f("fee-a.pdf")] };
    const other = { awbLines: [line("1")], importFeeFiles: [f("fee-a.pdf"), f("fee-b.pdf"), f("fee-b.pdf")] };
    assert.deepEqual(planMerge(keep, other).feeToAdd.map((x) => x.name), ["fee-b.pdf"]);
  });

  it("only lets a not-yet-started duplicate line leave its request", () => {
    const keep = { awbLines: [line("1"), line("2")], importFeeFiles: [] };
    const other = { awbLines: [line("1", { status: "assigned" }), line("2", { status: "completed" })], importFeeFiles: [] };
    assert.deepEqual(planMerge(keep, other).pairs.map((p) => p.removable), [true, false]);
  });

  it("two duplicate lines for one kept AWB do not copy the same thing twice", () => {
    const keep = { awbLines: [line("1")], importFeeFiles: [] };
    const other = { awbLines: [line("1", { loaFile: f("a.pdf") }), line("1", { loaFile: f("b.pdf"), doFile: f("d.pdf") })], importFeeFiles: [] };
    const plan = planMerge(keep, other);
    assert.deepEqual(plan.pairs[0].copied, ["Letter of Authorization"]);
    assert.deepEqual(plan.pairs[1].copied, ["Delivery Order"]);
    assert.deepEqual(plan.pairs[1].conflicts, ["Letter of Authorization"]);
  });
});
