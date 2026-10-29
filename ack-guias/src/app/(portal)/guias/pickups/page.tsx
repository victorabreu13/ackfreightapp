import Link from "next/link";
import { redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { PickupForm } from "@/components/pickup-form";
import { canManageGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatNyDate } from "@/lib/guias/documents-index";
import { pickupNumber } from "@/lib/guias/wr";
import { deletePickupRequest } from "@/server/pickup-actions";

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function PickupsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!canManageGuias(user)) redirect("/guias?error=Only%20the%20ACK%20team%20can%20open%20the%20pickup%20requests");
  const params = await searchParams;
  const notice = one(params, "notice");
  const error = one(params, "error");
  const requests = await prisma.pickupRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { guia: { select: { id: true, awb: true, status: true } }, receipts: { select: { id: true, seq: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <GuiaEyebrow />
        <h1 className="font-display text-4xl">Pickup requests</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Cada pickup request crea el borrador de su guía. De ahí sale el Pickup Order, y cuando la carga llega a la bodega se le liga su Warehouse Receipt.
        </p>
      </div>
      {notice ? <p className="rounded-md bg-secondary px-3 py-2 text-sm">{notice}</p> : null}
      {error ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{error}</p> : null}

      <PickupForm />

      <section className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Pickup</th>
              <th className="px-3 py-2">Creado</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Shipper</th>
              <th className="px-3 py-2">Destino</th>
              <th className="px-3 py-2">Piezas / kg</th>
              <th className="px-3 py-2">Pickup</th>
              <th className="px-3 py-2">Guía</th>
              <th className="px-3 py-2">Warehouse</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-muted-foreground">
                  Todavía no hay pickup requests.
                </td>
              </tr>
            ) : (
              requests.map((request) => (
                <tr key={request.id} className="border-b border-border align-top last:border-0">
                  <td className="px-3 py-2 font-medium">{pickupNumber(request.seq)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{formatNyDate(request.createdAt)}</td>
                  <td className="px-3 py-2">{request.clientLabel}</td>
                  <td className="px-3 py-2">
                    {request.shipperName}
                    {request.contactName ? <span className="block text-xs text-muted-foreground">{request.contactName}</span> : null}
                  </td>
                  <td className="px-3 py-2">{request.destination || "—"}</td>
                  <td className="px-3 py-2">
                    {request.pieces ?? "—"} / {request.weightKg ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{[request.pickupDate, request.readyTime].filter(Boolean).join(" ") || "—"}</td>
                  <td className="px-3 py-2">
                    {request.guia ? (
                      <div className="flex flex-col gap-1">
                        <Link href={`/guias/${request.guia.id}`} className="underline-offset-2 hover:underline">
                          {request.guia.awb || "Borrador"}
                        </Link>
                        {request.truckerName ? (
                          <a href={`/api/guias/${request.guia.id}/file?kind=pickup`} target="_blank" rel="noreferrer" className="text-xs underline-offset-2 hover:underline">
                            Pickup order (PDF)
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">Falta el trucker para el pickup order</span>
                        )}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {request.receipts.length ? (
                      <div className="flex flex-col gap-1">
                        {request.receipts.map((receipt) => (
                          <Link key={receipt.id} href={`/guias/warehouse/${receipt.id}`} className="underline-offset-2 hover:underline">
                            K{receipt.seq}
                          </Link>
                        ))}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <form action={deletePickupRequest}>
                      <input type="hidden" name="id" value={request.id} />
                      <button type="submit" className="text-xs text-stuck underline-offset-2 hover:underline">
                        Eliminar
                      </button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
