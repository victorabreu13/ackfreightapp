import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { canManageGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { uploadAwbStock } from "@/server/stock-actions";

function one(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function AwbStockPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) return null;
  if (!canManageGuias(user)) redirect("/guias");
  const query = await searchParams;
  const [prefixes, groups, recent] = await Promise.all([
    prisma.airlinePrefix.findMany({ orderBy: { prefix: "asc" } }),
    prisma.awbStockNumber.groupBy({
      by: ["prefix", "agentKey", "status"],
      where: { agentKey: "ack" },
      _count: true,
    }),
    prisma.awbStockNumber.findMany({
      where: { agentKey: "ack" },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { awb: true, status: true },
    }),
  ]);
  const added = one(query, "added");
  const note = one(query, "note");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/guias" className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
          Guías
        </Link>
        <h1 className="mt-2 font-display text-4xl">AWB stock</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Stock belongs to ACK TEAM LLC. The 8th digit must equal the first 7 digits modulo 7. A 7-digit start gets that
          check digit added. ACK prefixes in use are 045 and 810.
        </p>
      </div>
      {one(query, "error") ? <p className="rounded-md bg-[#fde8e8] px-4 py-3 text-sm text-destructive">{one(query, "error")}</p> : null}
      {added != null ? (
        <p className="rounded-md bg-[#e5f3ef] px-4 py-3 text-sm text-teal">
          Added {added}. Duplicates skipped: {one(query, "duplicates") ?? "0"}. Rejected lines: {one(query, "rejected") ?? "0"}.
          {note ? ` ${note}` : ""}
        </p>
      ) : null}
      <form action={uploadAwbStock} className="grid gap-4 rounded-lg border border-border bg-card p-5 lg:grid-cols-2">
        <input type="hidden" name="agentKey" value="ack" />
        <p className="text-sm text-muted-foreground lg:col-span-2">Issuing agent: ACK TEAM LLC</p>
        <label className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Prefix for bare serials</span>
          <select name="prefix" className="field" defaultValue="">
            <option value="">Only when a line is 8 digits</option>
            {prefixes.map((row) => (
              <option key={row.prefix} value={row.prefix}>
                {row.prefix} {row.airline}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 lg:col-span-2">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Paste a list</span>
          <Textarea name="pasted" placeholder={"045-22416284\n810,5104380,10"} className="min-h-36 font-mono" />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Or start number</span>
          <Input name="start" placeholder="22416284 or 045-22416284" className="font-mono" />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Count</span>
          <Input name="count" type="number" min={1} max={500} placeholder="25" />
        </label>
        <label className="space-y-1.5 lg:col-span-2">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Or CSV / Excel</span>
          <Input name="file" type="file" accept=".csv,.txt,.xlsx,.xls" />
          <span className="block text-xs text-muted-foreground">
            One AWB per line (`045-22416284`), two columns (`prefix,serial`), or three (`prefix,start,count`). A header
            named awb, prefix, number, or mawb is skipped.
          </span>
        </label>
        <div>
          <Button type="submit">Upload stock</Button>
        </div>
      </form>
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="font-display text-2xl">Remaining by airline</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-2">Prefix</th>
              <th className="py-2">Agent</th>
              <th className="py-2">Available</th>
              <th className="py-2">Used</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 text-muted-foreground">
                  Stock is empty.
                </td>
              </tr>
            ) : (
              Object.values(
                groups.reduce<Record<string, { prefix: string; available: number; used: number }>>((map, row) => {
                  const current = map[row.prefix] ?? { prefix: row.prefix, available: 0, used: 0 };
                  if (row.status === "available") current.available += row._count;
                  else current.used += row._count;
                  map[row.prefix] = current;
                  return map;
                }, {}),
              ).map((row) => (
                <tr key={row.prefix} className="border-t border-border">
                  <td className="py-2 font-mono">{row.prefix}</td>
                  <td className="py-2">ACK TEAM LLC</td>
                  <td className="py-2 font-semibold">{row.available}</td>
                  <td className="py-2 text-muted-foreground">{row.used}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {recent.length ? (
          <p className="mt-4 text-xs text-muted-foreground">Latest: {recent.map((row) => `${row.awb} (${row.status})`).join(" · ")}</p>
        ) : null}
      </section>
    </div>
  );
}
