// Merging two trip requests that carry the same AWB: what to copy from the
// duplicate into the one that stays. Pure (no Firebase) so it can be tested.
const { awbKey } = require("./awbLogic");

const DOC_FIELDS = [
  ["awbFile", "AWB document"],
  ["loaFile", "Letter of Authorization"],
  ["doFile", "Delivery Order"],
];

// A duplicate AWB line can leave its request only while nothing has happened to it yet.
const REMOVABLE = new Set(["submitted", "assigned", "accepted"]);

/**
 * For every AWB of `other` that is also on `keep`: the missing documents (and an
 * empty weight / piece count) to copy into `keep`'s line, plus any document both
 * have but that differ (keep's one stays). Also the import fee files `keep` lacks.
 */
function planMerge(keep, other) {
  const work = (keep.awbLines || []).map((l) => ({ ...l }));
  const indexByKey = new Map();
  work.forEach((l, i) => {
    const key = awbKey(l.awbNumber);
    if (key && !indexByKey.has(key)) indexByKey.set(key, i);
  });

  const pairs = [];
  (other.awbLines || []).forEach((o, otherIndex) => {
    const key = awbKey(o.awbNumber);
    if (!key || !indexByKey.has(key)) return;
    const keepIndex = indexByKey.get(key);
    const target = work[keepIndex];
    const patch = {};
    const copied = [];
    const conflicts = [];
    for (const [field, label] of DOC_FIELDS) {
      if (!target[field] && o[field]) {
        patch[field] = o[field];
        copied.push(label);
      } else if (target[field] && o[field] && target[field].url !== o[field].url) {
        conflicts.push(label);
      }
    }
    for (const [field, label] of [
      ["kilograms", "Weight"],
      ["qtyPieces", "Pieces"],
    ]) {
      if (!(Number(target[field]) > 0) && Number(o[field]) > 0) {
        patch[field] = o[field];
        copied.push(label);
      }
    }
    Object.assign(target, patch); // a later duplicate line sees what was already filled in
    pairs.push({
      keepIndex,
      otherIndex,
      awbNumber: String(target.awbNumber),
      patch,
      copied,
      conflicts,
      removable: REMOVABLE.has(o.status),
    });
  });

  const haveUrls = new Set((keep.importFeeFiles || []).map((f) => f && f.url).filter(Boolean));
  const feeToAdd = [];
  for (const f of other.importFeeFiles || []) {
    if (f && f.url && !haveUrls.has(f.url)) {
      haveUrls.add(f.url);
      feeToAdd.push(f);
    }
  }
  return { pairs, feeToAdd };
}

/** keep's lines with every pair's patch applied (fill-ins only, never overwrites). */
function applyPatches(keepLines, pairs) {
  const out = (keepLines || []).map((l) => ({ ...l }));
  for (const p of pairs) {
    for (const [field, value] of Object.entries(p.patch)) {
      const empty = field === "kilograms" || field === "qtyPieces" ? !(Number(out[p.keepIndex][field]) > 0) : !out[p.keepIndex][field];
      if (empty) out[p.keepIndex][field] = value;
    }
  }
  return out;
}

module.exports = { planMerge, applyPatches, DOC_FIELDS, REMOVABLE };
