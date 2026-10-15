import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { awbKey, duplicateAwbCount, duplicateAwbTrips } from "./duplicateAwb";

const t = (id: string, awbNumber: string) => ({ id, awbNumber });

describe("duplicate AWB trip logs", () => {
  it("ignores case, spaces and dashes", () => {
    assert.equal(awbKey(" 729-95818844 "), "72995818844");
    assert.equal(awbKey("abc 12"), "ABC12");
  });

  it("flags every trip log that shares an AWB", () => {
    const flagged = duplicateAwbTrips([t("a", "729-95818844"), t("b", "72995818844"), t("c", "810-51718343")]);
    assert.deepEqual([...flagged.keys()].sort(), ["a", "b"]);
    assert.deepEqual(flagged.get("a"), ["729-95818844"]);
  });

  it("handles trip logs with several AWBs", () => {
    const flagged = duplicateAwbTrips([t("a", "111,222"), t("b", "222"), t("c", "333")]);
    assert.deepEqual([...flagged.keys()].sort(), ["a", "b"]);
    assert.deepEqual(flagged.get("a"), ["222"]);
  });

  it("does not flag unique or empty AWBs", () => {
    assert.equal(duplicateAwbTrips([t("a", "111"), t("b", ""), t("c", "")]).size, 0);
  });

  it("counts distinct duplicated AWBs", () => {
    assert.equal(duplicateAwbCount([t("a", "111"), t("b", "111"), t("c", "111"), t("d", "222"), t("e", "222"), t("f", "333")]), 2);
  });
});
