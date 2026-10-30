import { prisma } from "@/lib/db";
import {
  ACK_FREIGHT_DEFAULT_WAREHOUSE,
  DOCUMENT_SLOT_BY_KIND,
  MAX_DOCUMENT_BYTES,
  deliveryTripPayload,
  pickupTripPayload,
  sendTripRequest,
  type PickupInput,
  type SendResult,
  type TripDocument,
} from "@/lib/guias/ack-freight";

// Not a "use server" file on purpose: these functions are only called by the server actions, and
// must never become callable from the browser on their own.

function warehouse(): string {
  return process.env.ACK_FREIGHT_WAREHOUSE?.trim() || ACK_FREIGHT_DEFAULT_WAREHOUSE;
}

/** The pickup order -> a trip request in ACK Freight. Never throws. */
export async function sendPickupToAckFreight(pickup: PickupInput): Promise<SendResult> {
  try {
    return await sendTripRequest(pickupTripPayload(pickup, warehouse()));
  } catch (error) {
    console.error("ACK Freight link (pickup)", error);
    return { state: "failed", message: "No se pudo enviar el trip request a ACK Freight." };
  }
}

/** The guía's latest AWB, pickup order and delivery order PDFs, as the documents of the trip request. */
async function loadTripDocuments(guiaId: string): Promise<TripDocument[]> {
  const rows = await prisma.guiaDocument.findMany({
    where: { guiaId, kind: { in: Object.keys(DOCUMENT_SLOT_BY_KIND) } },
    orderBy: { generatedAt: "desc" },
    include: { file: true },
  });
  const seen = new Set<string>();
  const documents: TripDocument[] = [];
  for (const row of rows) {
    if (seen.has(row.kind) || !row.file) continue;
    const bytes = Buffer.from(row.file.bytes);
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_DOCUMENT_BYTES) continue;
    seen.add(row.kind);
    documents.push({ slot: DOCUMENT_SLOT_BY_KIND[row.kind], name: row.fileName, contentBase64: bytes.toString("base64") });
  }
  return documents;
}

/** The guía whose cargo is ready -> a trip request in ACK Freight, with its documents. Never throws. */
export async function sendGuiaToAckFreight(guiaId: string): Promise<SendResult> {
  try {
    const guia = await prisma.airWaybillDocument.findFirst({
      where: { id: guiaId, product: "guia" },
      include: { lines: true, guiaClient: true },
    });
    if (!guia) return { state: "failed", message: "No se encontró la guía." };
    if (!guia.awb.trim()) return { state: "failed", message: "Asigna el AWB a la guía antes de solicitar el trip request." };
    const documents = await loadTripDocuments(guia.id);
    return await sendTripRequest(
      deliveryTripPayload(
        {
          id: guia.id,
          awb: guia.awb,
          clientLabel: guia.guiaClient?.name || guia.clientLabel,
          carrierName: guia.carrierName,
          destination: guia.destination,
          flightNumber: guia.flightNumber,
          flightDate: guia.flightDate,
          shipperName: guia.shipperName,
          consigneeName: guia.consigneeName,
          seal: guia.seal,
          bup: guia.bup,
          dgDeclarable: guia.dgDeclarable,
          unNumbers: guia.unNumbers,
          lines: guia.lines.map((l) => ({ pieces: l.pieces, grossWeight: l.grossWeight, kgLb: l.kgLb })),
          documents,
        },
        warehouse(),
      ),
    );
  } catch (error) {
    console.error("ACK Freight link (guía)", error);
    return { state: "failed", message: "No se pudo enviar el trip request a ACK Freight." };
  }
}
