import { redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { WarehouseReceiptForm } from "@/components/warehouse-receipt-form";
import { EMPTY_RECEIPT } from "@/lib/guias/wr-form";
import { canManageGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pickupNumber } from "@/lib/guias/wr";

export default async function NewWarehouseReceiptPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!canManageGuias(user)) redirect("/guias?error=Only%20the%20ACK%20team%20can%20create%20a%20warehouse%20receipt");
  const params = await searchParams;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  const requests = await prisma.pickupRequest.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  const pickups = requests.map((request) => ({ id: request.id, label: `${pickupNumber(request.seq)} · ${request.clientLabel} · ${request.shipperName}`, number: pickupNumber(request.seq) }));
  return (
    <div className="space-y-4">
      <div>
        <GuiaEyebrow />
        <h1 className="font-display text-4xl">Nuevo warehouse receipt</h1>
      </div>
      {error ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{error}</p> : null}
      <WarehouseReceiptForm initial={{ ...EMPTY_RECEIPT, receivedBy: user.name || "" }} pickups={pickups} />
    </div>
  );
}
