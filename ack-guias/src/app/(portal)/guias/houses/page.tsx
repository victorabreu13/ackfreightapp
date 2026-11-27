import Link from "next/link";
import { redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { canManageGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatNy } from "@/lib/guias/documents-index";
import { deleteHouse } from "@/server/house-actions";

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function HousesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!canManageGuias(user)) redirect("/guias?error=Only%20the%20ACK%20team%20can%20open%20the%20houses");
  const params = await searchParams;
  const notice = one(params, "notice");
  const error = one(params, "error");
  const houses = await prisma.airWaybillDocument.findMany({
    where: { product: "house" },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { lines: true, master: { select: { id: true, awb: true, status: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <GuiaEyebrow />
          <h1 className="font-display text-4xl">Houses</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            A house air waybill (HAWB) is its own document. It has its own ACK number and its own shipper, consignee and cargo, and it travels under one master AWB. The master adds up its houses.
          </p>
        </div>
        <Link href="/guias/houses/new" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
          New house
        </Link>
      </div>
      {notice ? <p className="rounded-md bg-secondary px-3 py-2 text-sm">{notice}</p> : null}
      {error ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{error}</p> : null}
      <section className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="px-3 py-2">HAWB</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">Shipper</th>
              <th className="px-3 py-2">Consignee</th>
              <th className="px-3 py-2">Pcs</th>
              <th className="px-3 py-2">Kg</th>
              <th className="px-3 py-2">Master</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {houses.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-muted-foreground">
                  There are no houses yet.
                </td>
              </tr>
            ) : (
              houses.map((house) => {
                const pieces = house.lines.reduce((sum, line) => sum + (line.pieces ?? 0), 0);
                const gross = house.lines.reduce((sum, line) => sum + (line.grossWeight ?? 0), 0);
                return (
                  <tr key={house.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <Link href={`/guias/houses/${house.id}`} className="font-mono font-medium underline-offset-2 hover:underline">
                        {house.hawb || "—"}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{formatNy(house.createdAt)}</td>
                    <td className="px-3 py-2">{house.clientLabel || "—"}</td>
                    <td className="px-3 py-2">{house.shipperName || "—"}</td>
                    <td className="px-3 py-2">{house.consigneeName || "—"}</td>
                    <td className="px-3 py-2">{pieces || "—"}</td>
                    <td className="px-3 py-2">{gross ? gross : "—"}</td>
                    <td className="px-3 py-2">
                      {house.master ? (
                        <Link href={`/guias/${house.master.id}`} className="underline-offset-2 hover:underline">
                          {house.master.awb || "Draft"}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Not linked</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <a href={`/api/guias/houses/${house.id}/pdf`} target="_blank" rel="noreferrer" className="text-xs underline-offset-2 hover:underline">
                          PDF
                        </a>
                        <form action={deleteHouse}>
                          <input type="hidden" name="id" value={house.id} />
                          <button type="submit" className="text-xs text-stuck underline-offset-2 hover:underline">
                            Delete
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
