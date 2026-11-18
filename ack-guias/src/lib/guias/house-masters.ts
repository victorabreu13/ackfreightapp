import { prisma } from "@/lib/db";

/** The master guías a house can be linked to: the latest ones, newest first, with the AWB or the client to tell them apart. */
export async function masterOptions(): Promise<Array<{ id: string; label: string }>> {
  const masters = await prisma.airWaybillDocument.findMany({
    where: { product: "guia", agentKey: "ack" },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, awb: true, status: true, clientLabel: true, shipperName: true },
  });
  return masters.map((master) => ({
    id: master.id,
    label: `${master.awb || "Draft"} · ${master.clientLabel || master.shipperName || "no client"}${master.status === "issued" ? "" : " · draft"}`,
  }));
}
