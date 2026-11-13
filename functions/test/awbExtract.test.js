const test = require("node:test");
const assert = require("node:assert/strict");
const { SCHEMA, normalizeExtraction, parseAnswer, usageDocId } = require("../awbExtract");

test("kilograms and pieces come through as read", () => {
  assert.deepEqual(normalizeExtraction({ awbNumber: "045-54066773", pieces: 3, grossWeight: 120.55, weightUnit: "K" }), {
    awbNumber: "045-54066773",
    pieces: 3,
    kilograms: 120.6,
  });
});

test("pounds are converted to kilograms", () => {
  const r = normalizeExtraction({ awbNumber: "04554066773", pieces: 2, grossWeight: 220.462, weightUnit: "L" });
  assert.equal(r.kilograms, 100);
  assert.equal(r.awbNumber, "045-54066773");
});

test("anything unreadable or out of range stays empty instead of guessed", () => {
  assert.deepEqual(normalizeExtraction({ awbNumber: null, pieces: null, grossWeight: null, weightUnit: null }), {
    awbNumber: null,
    pieces: null,
    kilograms: null,
  });
  assert.equal(normalizeExtraction({ pieces: 0, grossWeight: -5 }).pieces, null);
  assert.equal(normalizeExtraction({ pieces: 2.5 }).pieces, null);
  assert.equal(normalizeExtraction({ grossWeight: 500000, weightUnit: "K" }).kilograms, null);
  assert.equal(normalizeExtraction({ awbNumber: "12345" }).awbNumber, null);
  assert.deepEqual(normalizeExtraction(null), { awbNumber: null, pieces: null, kilograms: null });
});

test("reads the model's JSON answer", () => {
  assert.deepEqual(parseAnswer([{ type: "thinking", thinking: "" }, { type: "text", text: "{\"pieces\":4}" }]), { pieces: 4 });
  assert.equal(parseAnswer([{ type: "text", text: "not json" }]), null);
  assert.equal(parseAnswer([]), null);
});

test("the schema asks for exactly the four fields", () => {
  assert.deepEqual(Object.keys(SCHEMA.properties).sort(), ["awbNumber", "grossWeight", "pieces", "weightUnit"]);
  assert.equal(SCHEMA.additionalProperties, false);
  assert.deepEqual([...SCHEMA.required].sort(), Object.keys(SCHEMA.properties).sort());
});

test("usage is counted per person per day", () => {
  assert.equal(usageDocId("u1", "2026-11-14"), "u1_2026-11-14");
});
