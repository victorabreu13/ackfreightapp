import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { WarehouseReceiptForm, type ReceiptFormValues } from "@/components/warehouse-receipt-form";
import { canManageGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pickupNumber, receiptNumber } from "@/lib/guias/wr";

const text = (value: string | null | undefined) => value ?? "";
const numberText = (value: number | null | undefined) => (value == null ? "" : String(value));

export default async function WarehouseReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!canManageGuias(user)) redirect("/guias?error=Only%20the%20ACK%20team%20can%20open%20the%20warehouse%20receipts");
  const { id } = await params;
  const query = await searchParams;
  const receipt = await prisma.warehouseReceipt.findUnique({
    where: { id },
    include: { lines: { orderBy: { sortOrder: "asc" } }, guia: { select: { id: true, awb: true, status: true } } },
  });
  if (!receipt) notFound();
  const requests = await prisma.pickupRequest.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  const pickups = requests.map((request) => ({ id: request.id, label: `${pickupNumber(request.seq)} · ${request.clientLabel} · ${request.shipperName}` }));
  const initial: ReceiptFormValues = {
    id: receipt.id,
    warehouse: receipt.warehouse,
    receivedBy: text(receipt.receivedBy),
    client: text(receipt.clientLabel),
    shipper: text(receipt.shipperName),
    shipperAddress: text(receipt.shipperAddress),
    consignee: text(receipt.consigneeName),
    consigneeAddress: text(receipt.consigneeAddress),
    carrier: text(receipt.carrier),
    driver: text(receipt.driver),
    driverLicense: text(receipt.driverLicense),
    supplier: text(receipt.supplier),
    invoiceNumber: text(receipt.invoiceNumber),
    poNumber: text(receipt.poNumber),
    pickupNumber: text(receipt.pickupNumber),
    trackingNumber: text(receipt.trackingNumber),
    proNumber: text(receipt.proNumber),
    htPallet: receipt.htPallet,
    palletType: text(receipt.palletType),
    dangerousGood: text(receipt.dangerousGood),
    sealedDrum: text(receipt.sealedDrum),
    notes: text(receipt.notes),
    pickupRequestId: text(receipt.pickupRequestId),
    lines: receipt.lines.map((line) => ({
      pieces: String(line.pieces),
      packageType: text(line.packageType),
      length: numberText(line.length),
      width: numberText(line.width),
      height: numberText(line.height),
      weightKg: numberText(line.weightKg),
      location: text(line.location),
      description: text(line.description),
      notes: text(line.notes),
      pcTracking: text(line.pcTracking),
    })),
  };
  const saved = (Array.isArray(query.saved) ? query.saved[0] : query.saved) === "1";
  const error = Array.isArray(query.error) ? query.error[0] : query.error;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <GuiaEyebrow />
          <h1 className="font-display text-4xl">Warehouse receipt {receiptNumber(receipt.seq)}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {receipt.guia ? (
              <>
                Ligado a la guía{" "}
                <Link href={`/guias/${receipt.guia.id}`} className="underline-offset-2 hover:underline">
                  {receipt.guia.awb || "en borrador"}
                </Link>
                . {receipt.guia.status === "issued" ? "Ya está emitida: los cambios del receipt no la modifican." : "Al guardar, la guía se actualiza con los datos del receipt."}
              </>
            ) : (
              "Sin guía. Se liga desde la guía, en la sección Warehouse receipts, o con un pickup request."
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <a href={`/api/guias/warehouse/${receipt.id}/pdf`} target="_blank" rel="noreferrer" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
            Abrir PDF (receipt y checklist)
          </a>
          <a href={`/api/guias/warehouse/${receipt.id}/pdf?download=1`} className="rounded-md border border-input px-3 py-2 text-sm hover:bg-secondary">
            Descargar
          </a>
        </div>
      </div>
      {saved ? <p className="rounded-md bg-secondary px-3 py-2 text-sm">Guardado.</p> : null}
      {error ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{error}</p> : null}
      <WarehouseReceiptForm initial={initial} pickups={pickups} />
    </div>
  );
}
