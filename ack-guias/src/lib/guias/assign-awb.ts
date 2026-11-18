import { destinationCountry, routingTo } from "@/lib/guias/awb-face";
import { assignDraftAwb } from "@/lib/awb/issue";
import { prisma } from "@/lib/db";
import { resolveCarrier } from "@/lib/guias/carriers";

/** The carrier block and routing that come from the airline prefix. Used when the number is assigned and again at issue. */
export async function carrierData(agent: { accountNo: string | null }, destination: string | null, awbPrefix: string, carrierId: string | null = null) {
  const carrier = await resolveCarrier({ carrierId, awbPrefix });
  return {
    carrierName: carrier.name,
    carrierAddress: carrier.address,
    to1: routingTo(destination) || null,
    by1: carrier.name,
    destCountry: destinationCountry(destination) || null,
    accountNo: agent.accountNo,
  };
}

/**
 * Reserves an AWB number for a draft guía, from the stock of an airline prefix or a number typed from stock. The
 * draft's drafts and labels already carry it, and issuing the guía later uses the same number.
 */
export async function assignAwbToGuia(id: string, manualAwb: string, prefix: string) {
  const existing = await prisma.airWaybillDocument.findUnique({ where: { id } });
  const agent = await prisma.issuingAgent.findUnique({ where: { key: "ack" } });
  if (!existing || existing.product !== "guia" || !agent) throw new Error("Waybill not found");
  const awbPrefix = manualAwb.replace(/\D/g, "").slice(0, 3) || prefix.replace(/\D/g, "");
  await assignDraftAwb({
    documentId: id,
    agentKey: agent.key,
    manualAwb: manualAwb || null,
    prefix,
    data: await carrierData(agent, existing.destination, awbPrefix, existing.carrierId),
  });
}
