import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { PickupForm, type PickupFormValues } from "@/components/pickup-form";
import { canManageGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { truckerNames } from "@/lib/guias/trucker-names";
import { pickupNumber } from "@/lib/guias/wr";

const text = (value: string | null | undefined) => value ?? "";
const numberText = (value: number | null | undefined) => (value == null ? "" : String(value));

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function EditPickupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!canManageGuias(user)) redirect("/guias?error=Only%20the%20ACK%20team%20can%20open%20the%20pickup%20requests");
  const { id } = await params;
  const query = await searchParams;
  const request = await prisma.pickupRequest.findUnique({ where: { id }, include: { guia: { select: { id: true, awb: true, status: true } } } });
  if (!request) notFound();
  const error = one(query, "error");
  const initial: PickupFormValues = {
    id: request.id,
    client: request.clientLabel,
    destination: text(request.destination),
    shipper: request.shipperName,
    shipperAddress: request.shipperAddress,
    consignee: text(request.consigneeName),
    consigneeAddress: text(request.consigneeAddress),
    contactName: text(request.contactName),
    contactPhone: text(request.contactPhone),
    contactEmail: text(request.contactEmail),
    pieces: numberText(request.pieces),
    packageType: text(request.packageType),
    weightKg: numberText(request.weightKg),
    pickupDate: text(request.pickupDate),
    readyTime: text(request.readyTime),
    description: text(request.description),
    truckerName: text(request.truckerName),
    truckerPhone: text(request.truckerPhone),
    driverName: text(request.driverName),
    notes: text(request.notes),
  };

  return (
    <div className="space-y-6">
      <div>
        <GuiaEyebrow />
        <h1 className="font-display text-4xl">{pickupNumber(request.seq)}</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          <Link href="/guias/pickups" className="underline-offset-2 hover:underline">
            Back to the pickup requests
          </Link>
          {request.guia ? (
            <>
              {" · AWB "}
              <Link href={`/guias/${request.guia.id}`} className="underline-offset-2 hover:underline">
                {request.guia.awb || "Draft"}
              </Link>
              {request.guia.status === "issued" ? " (issued)" : " (draft)"}
            </>
          ) : null}
        </p>
      </div>
      {error ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{error}</p> : null}
      <PickupForm initial={initial} truckers={await truckerNames()} />
    </div>
  );
}
