import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { HouseForm, type HouseFormValues } from "@/components/house-form";
import { canManageGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { guiaValuesOf } from "@/lib/guias/guia-data";
import { masterOptions } from "@/lib/guias/house-masters";

export default async function HousePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!canManageGuias(user)) redirect("/guias?error=Only%20the%20ACK%20team%20can%20open%20the%20houses");
  const { id } = await params;
  const query = await searchParams;
  const house = await prisma.airWaybillDocument.findFirst({
    where: { id, product: "house" },
    include: { lines: { orderBy: { sortOrder: "asc" } }, guiaClient: { select: { name: true } }, master: { select: { id: true, awb: true } } },
  });
  if (!house) notFound();
  const masters = await masterOptions();
  const values = guiaValuesOf(house);
  const initial: HouseFormValues = {
    hawb: house.hawb ?? "",
    masterId: house.masterId ?? "",
    client: values.client,
    shipper: values.shipper,
    shipperAddress: values.shipperAddress,
    consignee: values.consignee,
    consigneeAddress: values.consigneeAddress,
    notify: values.notify,
    notifyAddress: values.notifyAddress,
    origin: values.origin,
    destination: values.destination,
    pieces: values.pieces,
    grossKg: values.grossKg,
    chargeableKg: values.chargeableKg,
    rate: values.rate,
    goods: values.goods,
    handling: values.handling,
  };
  const error = Array.isArray(query.error) ? query.error[0] : query.error;
  const saved = Array.isArray(query.saved) ? query.saved[0] : query.saved;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <GuiaEyebrow />
          <h1 className="font-display text-4xl">House {house.hawb}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {house.master ? (
              <>
                Travels under master{" "}
                <Link href={`/guias/${house.master.id}`} className="underline-offset-2 hover:underline">
                  {house.master.awb || "Draft"}
                </Link>
                .
              </>
            ) : (
              "Not linked to a master yet."
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <a href={`/api/guias/houses/${house.id}/pdf`} target="_blank" rel="noreferrer" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
            Open PDF
          </a>
          <a href={`/api/guias/houses/${house.id}/pdf?download=1`} className="rounded-md border border-input px-3 py-2 text-sm hover:bg-secondary">
            Download
          </a>
          <a href={`/api/guias/houses/${house.id}/pdf?draft=1`} target="_blank" rel="noreferrer" className="rounded-md border border-input px-3 py-2 text-sm hover:bg-secondary">
            Draft (1 copy)
          </a>
        </div>
      </div>
      {saved ? <p className="text-sm text-muted-foreground">Saved.</p> : null}
      {error ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{error}</p> : null}
      <HouseForm id={house.id} initial={initial} masters={masters} />
    </div>
  );
}
