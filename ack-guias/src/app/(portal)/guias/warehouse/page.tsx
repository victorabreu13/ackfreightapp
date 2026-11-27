import Link from "next/link";
import { redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { canManageGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatNy } from "@/lib/guias/documents-index";
import { receiptNumber, receiptTotals } from "@/lib/guias/wr";
import { matchesDays, WR_LIST_LIMIT, wrFiltersFrom, wrHref, wrOrderBy, wrSortChange, wrWhere, type WrFilters } from "@/lib/guias/wr-list";
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
  const filters = wrFiltersFrom(params);
  const filtered = Boolean(filters.number || filters.client || filters.awb || filters.from || filters.to || filters.link);
  const found = await prisma.warehouseReceipt.findMany({
    where: wrWhere(filters),
    orderBy: wrOrderBy(filters),
    take: WR_LIST_LIMIT * 4,
    include: { lines: true, guia: { select: { id: true, awb: true, status: true } } },
  });
  const matching = found.filter((receipt) => matchesDays(receipt.receivedAt, filters));
  const receipts = matching.slice(0, WR_LIST_LIMIT);
  const sortHeader = (label: string, sort: WrFilters["sort"]) => (
    <Link href={wrHref(filters, wrSortChange(filters, sort))} className="inline-flex items-center gap-1 hover:text-foreground">
      {label}
      {filters.sort === sort ? <span aria-hidden>{filters.dir === "asc" ? "▲" : "▼"}</span> : null}
    </Link>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <GuiaEyebrow />
          <h1 className="font-display text-4xl">Warehouse receipts</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Each receipt is cargo received at the warehouse. An AWB can gather several, and while it is still a draft it takes from them the pieces, the weights, the shipper, the consignee and the goods.
          </p>
        </div>
        <Link href="/guias/warehouse/new" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
          New warehouse receipt
        </Link>
      </div>
      {notice ? <p className="rounded-md bg-secondary px-3 py-2 text-sm">{notice}</p> : null}
      {error ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{error}</p> : null}
      <form method="get" action="/guias/warehouse" className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-3 lg:grid-cols-6">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Warehouse no.</span>
          <input name="number" defaultValue={filters.number} placeholder="K5554" className="block h-10 w-full rounded-md border border-input bg-background px-3" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Client or shipper</span>
          <input name="client" defaultValue={filters.client} placeholder="PACIFIKO" className="block h-10 w-full rounded-md border border-input bg-background px-3" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">AWB or tracking</span>
          <input name="awb" defaultValue={filters.awb} placeholder="045-52890364" className="block h-10 w-full rounded-md border border-input bg-background px-3 font-mono" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">From</span>
          <input name="from" type="date" defaultValue={filters.from} className="block h-10 w-full rounded-md border border-input bg-background px-3" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">To</span>
          <input name="to" type="date" defaultValue={filters.to} className="block h-10 w-full rounded-md border border-input bg-background px-3" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">AWB</span>
          <select name="link" defaultValue={filters.link} className="block h-10 w-full rounded-md border border-input bg-background px-3">
            <option value="">All</option>
            <option value="linked">With AWB</option>
            <option value="unlinked">No AWB yet</option>
          </select>
        </label>
        <input type="hidden" name="sort" value={filters.sort} />
        <input type="hidden" name="dir" value={filters.dir} />
        <div className="flex flex-wrap items-center gap-3 md:col-span-3 lg:col-span-6">
          <button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
            Filter
          </button>
          {filtered ? (
            <Link href={wrHref(filters, { number: "", client: "", awb: "", from: "", to: "", link: "" })} className="text-sm underline-offset-2 hover:underline">
              Clear filters
            </Link>
          ) : null}
          <span className="text-sm text-muted-foreground">
            {matching.length > receipts.length ? `Showing the first ${receipts.length} of ${matching.length} receipts. Narrow the search to see the rest.` : `${receipts.length} receipt${receipts.length === 1 ? "" : "s"}`}
            {" · Click Receipt, Received, Client or AWB to sort."}
          </span>
        </div>
      </form>
      <section className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="px-3 py-2">{sortHeader("Receipt", "receipt")}</th>
              <th className="px-3 py-2">{sortHeader("Received", "received")}</th>
              <th className="px-3 py-2">{sortHeader("Client", "client")}</th>
              <th className="px-3 py-2">Shipper</th>
              <th className="px-3 py-2">Pcs</th>
              <th className="px-3 py-2">Kg</th>
              <th className="px-3 py-2">VKg</th>
              <th className="px-3 py-2">{sortHeader("AWB", "awb")}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {receipts.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-muted-foreground">
                  {filtered ? "No warehouse receipt matches those filters." : "There are no warehouse receipts yet."}
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
                          {receipt.guia.awb || "Draft"}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">No AWB</span>
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
