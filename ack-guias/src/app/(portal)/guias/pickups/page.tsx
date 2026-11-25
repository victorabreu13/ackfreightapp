import Link from "next/link";
import { redirect } from "next/navigation";
import { GuiaEyebrow } from "@/components/guia-eyebrow";
import { PickupForm } from "@/components/pickup-form";
import { truckerNames } from "@/lib/guias/trucker-names";
import { canManageGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatNyDate } from "@/lib/guias/documents-index";
import { pickupNumber } from "@/lib/guias/wr";
import { PICKUP_LIST_LIMIT, pickupFiltersFrom, pickupHref, pickupOrderBy, pickupSortChange, pickupWhere, type PickupFilters } from "@/lib/guias/pickup-list";
import { matchesDays } from "@/lib/guias/wr-list";
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
  const prefixes = await prisma.airlinePrefix.findMany({ orderBy: { prefix: "asc" }, take: 200 });
  const stock = await prisma.awbStockNumber.groupBy({ by: ["prefix"], where: { status: "available", agentKey: "ack" }, _count: true });
  const awbOptions = prefixes.map((row) => ({ prefix: row.prefix, airline: row.airline, left: stock.find((item) => item.prefix === row.prefix)?._count ?? 0 }));
  const filters = pickupFiltersFrom(params);
  const filtered = Boolean(filters.number || filters.client || filters.awb || filters.destination || filters.from || filters.to || filters.warehouse);
  const found = await prisma.pickupRequest.findMany({
    where: pickupWhere(filters),
    orderBy: pickupOrderBy(filters),
    take: PICKUP_LIST_LIMIT * 4,
    include: { guia: { select: { id: true, awb: true, status: true } }, receipts: { select: { id: true, seq: true } } },
  });
  const matching = found.filter((request) => matchesDays(request.createdAt, filters));
  const requests = matching.slice(0, PICKUP_LIST_LIMIT);
  const sortHeader = (label: string, sort: PickupFilters["sort"]) => (
    <Link href={pickupHref(filters, pickupSortChange(filters, sort))} className="inline-flex items-center gap-1 hover:text-foreground">
      {label}
      {filters.sort === sort ? <span aria-hidden>{filters.dir === "asc" ? "▲" : "▼"}</span> : null}
    </Link>
  );

  return (
    <div className="space-y-6">
      <div>
        <GuiaEyebrow />
        <h1 className="font-display text-4xl">Pickup requests</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Each pickup request creates the draft of its guía. The Pickup Order comes from it, and when the cargo reaches the warehouse its Warehouse Receipt is linked.
        </p>
      </div>
      {notice ? <p className="rounded-md bg-secondary px-3 py-2 text-sm">{notice}</p> : null}
      {error ? <p className="rounded-md bg-[#fff1e4] px-3 py-2 text-sm text-stuck">{error}</p> : null}

      <PickupForm awbOptions={awbOptions} truckers={await truckerNames()} />

      <form method="get" action="/guias/pickups" className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-3 lg:grid-cols-7">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Pickup no.</span>
          <input name="number" defaultValue={filters.number} placeholder="PU-0061" className="block h-10 w-full rounded-md border border-input bg-background px-3" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Client or shipper</span>
          <input name="client" defaultValue={filters.client} placeholder="PACIFIKO" className="block h-10 w-full rounded-md border border-input bg-background px-3" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">AWB</span>
          <input name="awb" defaultValue={filters.awb} placeholder="045-52890364" className="block h-10 w-full rounded-md border border-input bg-background px-3 font-mono" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Destino</span>
          <input name="destination" defaultValue={filters.destination} placeholder="GUA" className="block h-10 w-full rounded-md border border-input bg-background px-3" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Created from</span>
          <input name="from" type="date" defaultValue={filters.from} className="block h-10 w-full rounded-md border border-input bg-background px-3" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Created to</span>
          <input name="to" type="date" defaultValue={filters.to} className="block h-10 w-full rounded-md border border-input bg-background px-3" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Warehouse</span>
          <select name="warehouse" defaultValue={filters.warehouse} className="block h-10 w-full rounded-md border border-input bg-background px-3">
            <option value="">All</option>
            <option value="received">Received</option>
            <option value="pending">Not received yet</option>
          </select>
        </label>
        <input type="hidden" name="sort" value={filters.sort} />
        <input type="hidden" name="dir" value={filters.dir} />
        <div className="flex flex-wrap items-center gap-3 md:col-span-3 lg:col-span-7">
          <button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
            Filter
          </button>
          {filtered ? (
            <Link href={pickupHref(filters, { number: "", client: "", awb: "", destination: "", from: "", to: "", warehouse: "" })} className="text-sm underline-offset-2 hover:underline">
              Clear filters
            </Link>
          ) : null}
          <span className="text-sm text-muted-foreground">
            {matching.length > requests.length ? `Showing the first ${requests.length} of ${matching.length} pickup requests. Narrow the search to see the rest.` : `${requests.length} pickup request${requests.length === 1 ? "" : "s"}`}
            {" · Click Pickup, Creado, Client, Destino or Guía to sort."}
          </span>
        </div>
      </form>

      <section className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="px-3 py-2">{sortHeader("Pickup", "pickup")}</th>
              <th className="px-3 py-2">{sortHeader("Creado", "created")}</th>
              <th className="px-3 py-2">{sortHeader("Client", "client")}</th>
              <th className="px-3 py-2">Shipper</th>
              <th className="px-3 py-2">{sortHeader("Destino", "destination")}</th>
              <th className="px-3 py-2">Pieces / kg</th>
              <th className="px-3 py-2">Pickup</th>
              <th className="px-3 py-2">{sortHeader("Guía", "awb")}</th>
              <th className="px-3 py-2">Warehouse</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-muted-foreground">
                  {filtered ? "No pickup request matches those filters." : "There are no pickup requests yet."}
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
                    {request.pieces ?? "—"}
                    {request.packageType ? ` ${request.packageType}` : ""} / {request.weightKg ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{[request.pickupDate, request.readyTime].filter(Boolean).join(" ") || "—"}</td>
                  <td className="px-3 py-2">
                    {request.guia ? (
                      <div className="flex flex-col gap-1">
                        <Link href={`/guias/${request.guia.id}`} className="underline-offset-2 hover:underline">
                          {request.guia.awb || "Draft"}
                        </Link>
                        {request.truckerName ? (
                          <a href={`/api/guias/${request.guia.id}/file?kind=pickup`} target="_blank" rel="noreferrer" className="text-xs underline-offset-2 hover:underline">
                            Pickup order (PDF)
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">The trucker is missing for the pickup order</span>
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
                    <Link href={`/guias/pickups/${request.id}`} className="mr-3 text-xs underline-offset-2 hover:underline">
                      Edit
                    </Link>
                    <form action={deletePickupRequest} className="inline">
                      <input type="hidden" name="id" value={request.id} />
                      <button type="submit" className="text-xs text-stuck underline-offset-2 hover:underline">
                        Delete
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
