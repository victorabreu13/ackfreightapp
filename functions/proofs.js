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
    proofs.push({
      tripLogId,
      awbNumbers,
      proofFiles: (trip.proofFiles || []).map(publicProofFile).filter(Boolean),
    });
  }
  return proofs;
}

module.exports = { publicProofFile, proofsForRequest };
