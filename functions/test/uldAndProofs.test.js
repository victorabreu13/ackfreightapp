const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { decodeSignatureStrokes, encodeSignatureStrokes, proofsForRequest } = require("../proofs");
const { hasAnyTrip, uldDocId, uldPairs } = require("../uldKeys");

describe("uld keys", () => {
  it("uses one stable id for the same AWB and ULD regardless of case", () => {
    assert.equal(uldDocId("  awb-1 ", "ake1"), uldDocId("AWB-1", "AKE1"));
    assert.notEqual(uldDocId("AWB-1", "AKE1"), uldDocId("AWB-2", "AKE1"));
  });

  it("pairs each distinct ULD on a trip and skips blanks", () => {
    const pairs = uldPairs({ awbNumber: "awb-1", uldNumbers: [" a ", "A", "", "b"] });
    assert.deepEqual(
      pairs.map((pair) => pair.uld),
      ["A", "B"]
    );
    assert.equal(pairs[0].awb, "AWB-1");
  });

  it("treats an empty claim as not a duplicate", () => {
    assert.equal(hasAnyTrip(null), false);
    assert.equal(hasAnyTrip({ tripIds: {} }), false);
    assert.equal(hasAnyTrip({ tripIds: { t1: true } }), true);
  });
});

describe("proofsForRequest", () => {
  it("returns only proof files for linked trip logs, not driver details", () => {
    const proofs = proofsForRequest(
      {
        awbLines: [
          { awbNumber: "111", tripLogId: "trip-1", status: "completed" },
          { awbNumber: "222", tripLogId: "trip-1", status: "completed" },
          { awbNumber: "333", status: "assigned" },
        ],
      },
      {
        "trip-1": {
          driverName: "Dee",
          driverEmail: "dee@example.com",
          notes: "secret note",
          proofFiles: [
            { url: "https://files.example/a.jpg", name: "a.jpg", kind: "image" },
            { url: "https://files.example/b.pdf", name: "b.pdf", kind: "document" },
          ],
          signature: { url: "https://files.example/sign.svg", name: "signature.svg", kind: "document" },
          signatureStrokes: [{ p: [0.1, 0.2, 0.4, 0.6] }],
        },
      }
    );

    assert.equal(proofs.length, 1);
    assert.deepEqual(proofs[0].awbNumbers, ["111", "222"]);
    assert.equal(proofs[0].proofFiles.length, 2);
    assert.equal(proofs[0].signature.url, "https://files.example/sign.svg");
    assert.deepEqual(proofs[0].signatureStrokes, [[[0.1, 0.2], [0.4, 0.6]]]);
    assert.equal(JSON.stringify(proofs).includes("dee@example.com"), false);
    assert.equal(JSON.stringify(proofs).includes("secret note"), false);
    assert.equal(JSON.stringify(proofs).includes("Dee"), false);
  });
  it("stores a signature without nested arrays and reads it back", () => {
    const strokes = [[[0.1, 0.2], [0.4, 0.6]], [[0.5, 0.5]]];
    const stored = encodeSignatureStrokes(strokes);
    const hasNestedArray = (value) =>
      Array.isArray(value) && value.some((v) => Array.isArray(v) || (v && typeof v === "object" && Object.values(v).some(hasNestedArray)));
    assert.equal(hasNestedArray(stored), false);
    assert.deepEqual(decodeSignatureStrokes(stored), strokes);
    assert.deepEqual(encodeSignatureStrokes("junk"), []);
    assert.deepEqual(decodeSignatureStrokes(strokes), strokes);
  });
});
