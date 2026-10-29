import { prisma } from "@/lib/db";

/** "Kay Air Delivery" and "KAY AIR DELIVERY." are the same carrier, and the same goes for a driver. */
export function driverKey(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

export type DriverPick = { carrier: string; name: string; license: string; phone: string };

/**
 * Remembers a driver from a receipt: the carrier, the driver and the license. A driver already known keeps what it
 * had, and takes the license or the phone only when it had none. Nothing is saved without a driver name.
 */
export async function rememberDriver(input: { carrier?: string | null; name?: string | null; license?: string | null; phone?: string | null }): Promise<void> {
  const name = (input.name ?? "").replace(/\s+/g, " ").trim();
  const carrier = (input.carrier ?? "").replace(/\s+/g, " ").trim();
  const nameKey = driverKey(name);
  if (!nameKey) return;
  const carrierKey = driverKey(carrier);
  const license = (input.license ?? "").trim();
  const phone = (input.phone ?? "").trim();
  const existing = await prisma.truckDriver.findUnique({ where: { carrierKey_nameKey: { carrierKey, nameKey } } });
  if (existing) {
    // Used again, so it moves to the top of the suggestions.
    const data: { license?: string; phone?: string; updatedAt: Date } = { updatedAt: new Date() };
    if (license && !existing.license) data.license = license;
    if (phone && !existing.phone) data.phone = phone;
    await prisma.truckDriver.update({ where: { id: existing.id }, data });
    return;
  }
  await prisma.truckDriver.create({ data: { carrier, name, license: license || null, phone: phone || null, carrierKey, nameKey } });
}

/** The drivers whose carrier or name contains what was typed, the most recent first. */
export async function searchDrivers(query: string): Promise<DriverPick[]> {
  const q = query.trim().slice(0, 80);
  const rows = await prisma.truckDriver.findMany({
    where: q ? { OR: [{ carrier: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {},
    orderBy: { updatedAt: "desc" },
    take: 8,
  });
  return rows.map((row) => ({ carrier: row.carrier, name: row.name, license: row.license ?? "", phone: row.phone ?? "" }));
}
