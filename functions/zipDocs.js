// Which documents of a trip request go into a download zip. Pure helpers (no
// Firebase) so they can be unit tested.

const DOC_SLOTS = [
  { slot: "awb", field: "awbFile", label: "AWB document" },
  { slot: "loa", field: "loaFile", label: "Letter of Authorization" },
  { slot: "do", field: "doFile", label: "Delivery Order" },
];

// https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<url-encoded path>?alt=media...
function parseStorageUrl(url) {
  try {
    const u = new URL(String(url));
    if (u.hostname !== "firebasestorage.googleapis.com") return null;
    const parts = u.pathname.split("/");
    if (parts[1] !== "v0" || parts[2] !== "b" || parts[4] !== "o" || !parts[3]) return null;
    return { bucket: parts[3], path: decodeURIComponent(parts.slice(5).join("/")) };
  } catch (err) {
    return null;
  }
}

function safeName(value) {
  const cleaned = String(value || "")
    .replace(/[^A-Za-z0-9._ -]+/g, "_")
    .trim()
    .slice(0, 80);
  return cleaned || "file";
}

/**
 * The documents to zip: every document on every AWB when `items` is empty, else
 * only the chosen { awbIndex, slot } pairs. Files outside this request's own
 * Storage folder are skipped.
 */
function documentsForRequest(req, requestId, items) {
  const folder = `tripRequestDocs/${req.customerId}/${requestId}/`;
  const chosen = Array.isArray(items) && items.length > 0 ? items : null;
  const wanted = (awbIndex, slot) =>
    !chosen || chosen.some((c) => c && c.awbIndex === awbIndex && c.slot === slot);
  const out = [];
  (req.awbLines || []).forEach((line, awbIndex) => {
    for (const { slot, field, label } of DOC_SLOTS) {
      const file = line && line[field];
      if (!file || !file.url || !wanted(awbIndex, slot)) continue;
      const parsed = parseStorageUrl(file.url);
      if (!parsed || !parsed.path.startsWith(folder) || parsed.path.startsWith(folder + "zips/")) continue;
      out.push({
        awbIndex,
        slot,
        label,
        awbNumber: String(line.awbNumber || `AWB ${awbIndex + 1}`),
        name: String(file.name || "document"),
        bucket: parsed.bucket,
        path: parsed.path,
      });
    }
  });
  return out;
}

/** Unique, tidy path inside the zip: "<AWB>/<document type> - <original name>". */
function zipEntryNames(docs) {
  const used = new Set();
  return docs.map((d) => {
    const base = `${safeName(d.awbNumber)}/${safeName(d.label)} - ${safeName(d.name)}`;
    let name = base;
    let n = 2;
    while (used.has(name)) name = `${base} (${n++})`;
    used.add(name);
    return name;
  });
}

module.exports = { DOC_SLOTS, parseStorageUrl, safeName, documentsForRequest, zipEntryNames };
