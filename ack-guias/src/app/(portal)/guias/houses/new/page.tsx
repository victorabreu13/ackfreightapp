import { redirect } from "next/navigation";
import { EMPTY_HOUSE, HouseForm } from "@/components/house-form";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { canManageGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { masterOptions } from "@/lib/guias/house-masters";

export default async function NewHousePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!canManageGuias(user)) redirect("/guias?error=Only%20the%20ACK%20team%20can%20create%20a%20house");
  const params = await searchParams;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  const masterId = (Array.isArray(params.master) ? params.master[0] : params.master) ?? "";
  const masters = await masterOptions();
  // Opened from a master, the house starts with that master, its client and its route.
  const master = masterId ? await prisma.airWaybillDocument.findFirst({ where: { id: masterId, product: "guia" }, select: { id: true, clientLabel: true, departure: true, destination: true } }) : null;
  const initial = { ...EMPTY_HOUSE, masterId: master?.id ?? "", client: master?.clientLabel ?? "", origin: master?.departure ?? "", destination: master?.destination ?? "" };
  return (
    <div className="space-y-4">
      <div>
        <GuiaEyebrow />
        <h1 className="font-display text-4xl">New house</h1>
      </div>
      {error ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{error}</p> : null}
      <HouseForm initial={initial} masters={masters} />
    </div>
  );
}
