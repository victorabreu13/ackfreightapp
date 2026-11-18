import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { ReportFilters, ReportShipment } from "@/lib/guias/acct-reports";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

/** The shipments a report is made from: the ones of the period, client, destination and airline chosen. */
export async function loadReportShipments(filters: ReportFilters): Promise<ReportShipment[]> {
  const where: Prisma.AcctShipmentWhereInput = {};
  if (filters.from || filters.to) {
    where.date = {};
    if (filters.from) where.date.gte = day(filters.from);
    if (filters.to) where.date.lt = new Date(day(filters.to).getTime() + 86_400_000);
  }
  if (filters.client) where.client = filters.client;
  if (filters.dest) where.dest = filters.dest;
  if (filters.airline) where.airline = filters.airline;
  return prisma.acctShipment.findMany({
    where,
    select: {
      date: true, client: true, dest: true, airline: true, pcs: true, gross: true, chw: true,
      airSold: true, airCost: true, pickupSold: true, pickupCost: true, handlingSold: true, handlingCost: true, transferSold: true, transferCost: true,
      insuranceSold: true, insuranceCost: true, aes: true, awbFee: true, kopeHandling: true, kopeInCost: true, invoiced: true, costTotal: true, profit: true,
    },
  });
}

/** What the filters of a report can choose from. */
export async function loadReportChoices() {
  const [clients, dests, airlines] = await Promise.all([
    prisma.acctShipment.findMany({ distinct: ["client"], select: { client: true }, orderBy: { client: "asc" } }),
    prisma.acctShipment.findMany({ distinct: ["dest"], select: { dest: true }, orderBy: { dest: "asc" } }),
    prisma.acctShipment.findMany({ distinct: ["airline"], select: { airline: true }, orderBy: { airline: "asc" } }),
  ]);
  return { clients: clients.map((row) => row.client), dests: dests.map((row) => row.dest), airlines: airlines.map((row) => row.airline) };
}
