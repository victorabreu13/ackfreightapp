import Link from "next/link";
import { redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { canManageGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatNy } from "@/lib/guias/documents-index";
import { receiptNumber, receiptTotals } from "@/lib/guias/wr";
import { deleteWarehouseReceipt } from "@/server/wr-actions";

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function WarehousePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!canManageGuias(user)) redirect("/guias?error=Only%20the%20ACK%20team%20can%20open%20the%20warehouse%20receipts");
  const params = await searchParams;
  const notice = one(params, "notice");
  const error = one(params, "error");
  const receipts = await prisma.warehouseReceipt.findMany({
    orderBy: { seq: "desc" },
    take: 200,
    include: { lines: true, guia: { select: { id: true, awb: true, status: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <GuiaEyebrow />
          <h1 className="font-display text-4xl">Warehouse receipts</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Cada receipt es carga recibida en la bodega. Una guía puede juntar varios, y mientras siga en borrador toma de ellos las piezas, los pesos, el shipper, el consignee y la mercancía.
          </p>
        </div>
        <Link href="/guias/warehouse/new" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
          Nuevo warehouse receipt
        </Link>
      </div>
      {notice ? <p className="rounded-md bg-secondary px-3 py-2 text-sm">{notice}</p> : null}
      {error ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{error}</p> : null}
      <section className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Receipt</th>
              <th className="px-3 py-2">Recibido</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Shipper</th>
              <th className="px-3 py-2">Pzas</th>
              <th className="px-3 py-2">Kg</th>
              <th className="px-3 py-2">VKg</th>
              <th className="px-3 py-2">Guía</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {receipts.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-muted-foreground">
                  Todavía no hay warehouse receipts.
                </td>
              </tr>
            ) : (
              receipts.map((receipt) => {
                const totals = receiptTotals(receipt.lines.map((line) => ({ pieces: line.pieces, length: line.length, width: line.width, height: line.height, weightKg: line.weightKg })));
                return (
                  <tr key={receipt.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <Link href={`/guias/warehouse/${receipt.id}`} className="font-medium underline-offset-2 hover:underline">
                        {receiptNumber(receipt.seq)}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{formatNy(receipt.receivedAt)}</td>
                    <td className="px-3 py-2">{receipt.clientLabel || "—"}</td>
                    <td className="px-3 py-2">{receipt.shipperName || "—"}</td>
                    <td className="px-3 py-2">{totals.pieces}</td>
                    <td className="px-3 py-2">{totals.weightKg.toFixed(2)}</td>
                    <td className="px-3 py-2">{totals.volumeWeightKg.toFixed(2)}</td>
                    <td className="px-3 py-2">
                      {receipt.guia ? (
                        <Link href={`/guias/${receipt.guia.id}`} className="underline-offset-2 hover:underline">
                          {receipt.guia.awb || "Borrador"}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Sin guía</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <a href={`/api/guias/warehouse/${receipt.id}/pdf`} target="_blank" rel="noreferrer" className="text-xs underline-offset-2 hover:underline">
                          PDF
                        </a>
                        <form action={deleteWarehouseReceipt}>
                          <input type="hidden" name="id" value={receipt.id} />
                          <button type="submit" className="text-xs text-stuck underline-offset-2 hover:underline">
                            Eliminar
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
