// Shapes proof-of-delivery files for the customer who owns a trip request.
// Never includes driver email, notes, or the rest of the trip log.

function publicProofFile(file) {
  if (!file || !file.url) return null;
  return {
    url: String(file.url),
    name: String(file.name || "proof"),
    kind: file.kind === "document" ? "document" : "image",
  };
}

// Firestore rejects arrays nested in arrays, and a signature is strokes of
// [x, y] points. So it is stored as [{ p: [x0, y0, x1, y1, ...] }, ...] and
// turned back into number[][][] when it is read.
const MAX_STROKES = 200;
const MAX_POINTS = 5000;

function encodeSignatureStrokes(strokes) {
  if (!Array.isArray(strokes)) return [];
  const out = [];
  let points = 0;
  for (const stroke of strokes.slice(0, MAX_STROKES)) {
    if (!Array.isArray(stroke)) continue;
    const flat = [];
    for (const point of stroke) {
      if (!Array.isArray(point) || point.length < 2) continue;
      const x = Number(point[0]);
      const y = Number(point[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (++points > MAX_POINTS) break;
      flat.push(x, y);
    }
    if (flat.length > 0) out.push({ p: flat });
  }
  return out;
}

function decodeSignatureStrokes(stored) {
  if (!Array.isArray(stored)) return [];
  return stored
    .map((stroke) => {
      // Older records may already be plain [[x, y], ...] strokes.
      if (Array.isArray(stroke)) return stroke;
      const flat = stroke && Array.isArray(stroke.p) ? stroke.p : [];
      const points = [];
      for (let i = 0; i + 1 < flat.length; i += 2) points.push([flat[i], flat[i + 1]]);
      return points;
    })
    .filter((stroke) => stroke.length > 0);
}

function proofsForRequest(tripRequest, tripById) {
  const grouped = new Map();
  for (const line of (tripRequest && tripRequest.awbLines) || []) {
    if (!line || !line.tripLogId) continue;
    if (!grouped.has(line.tripLogId)) grouped.set(line.tripLogId, []);
    if (line.awbNumber) grouped.get(line.tripLogId).push(String(line.awbNumber));
  }

  const proofs = [];
  for (const [tripLogId, awbNumbers] of grouped) {
    const trip = tripById[tripLogId];
    if (!trip) continue;
    const signature = publicProofFile(trip.signature);
    proofs.push({
      tripLogId,
      awbNumbers,
      proofFiles: (trip.proofFiles || []).map(publicProofFile).filter(Boolean),
      signature,
      signatureStrokes: decodeSignatureStrokes(trip.signatureStrokes),
    });
  }
  return proofs;
}

module.exports = {
  publicProofFile,
  proofsForRequest,
  encodeSignatureStrokes,
  decodeSignatureStrokes,
};
