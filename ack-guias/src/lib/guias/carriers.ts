import { carrierBlock } from "@/lib/awb/airports";
import { prisma } from "@/lib/db";

export type CarrierBlock = { id: string | null; name: string; address: string };

/** "LATAM AIRLINES CARGO (MIA)  ·  045", for a list. */
export function carrierLabel(carrier: { name: string; prefix: string | null }): string {
  return carrier.prefix ? `${carrier.name}  ·  ${carrier.prefix}` : carrier.name;
}

/**
 * The carrier a guía prints: the one the team picked, else the one registered for the airline prefix of its AWB, else
 * what the app has always derived from the prefix.
 */
export async function resolveCarrier(input: { carrierId?: string | null; awbPrefix?: string | null }): Promise<CarrierBlock> {
  const picked = input.carrierId ? await prisma.carrier.findUnique({ where: { id: input.carrierId } }) : null;
  if (picked) return { id: picked.id, name: picked.name, address: picked.address };
  const prefix = /^\d{3}$/.test(input.awbPrefix ?? "") ? (input.awbPrefix as string) : "";
  const registered = prefix ? await prisma.carrier.findFirst({ where: { prefix }, orderBy: { createdAt: "asc" } }) : null;
  if (registered) return { id: registered.id, name: registered.name, address: registered.address };
  const airline = prefix ? await prisma.airlinePrefix.findUnique({ where: { prefix } }) : null;
  const fallback = carrierBlock(prefix || "000", airline?.airline ?? null);
  return { id: null, name: fallback.name, address: fallback.address };
}

/** The carriers for the Carrier field of the guía form, by name. */
export async function loadCarrierOptions(): Promise<Array<{ id: string; label: string }>> {
  const rows = await prisma.carrier.findMany({ orderBy: { name: "asc" } });
  return rows.map((row) => ({ id: row.id, label: carrierLabel(row) }));
}
