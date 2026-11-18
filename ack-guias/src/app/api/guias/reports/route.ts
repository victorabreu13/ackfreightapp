import { NextResponse } from "next/server";
import { canViewFinance } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { loadReportShipments } from "@/lib/guias/acct-report-data";
import { filtersFrom, reportCsv, type ReportKind } from "@/lib/guias/acct-reports";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

/** A report of the accounting as a CSV file, with the same filters as the screen. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || !canViewFinance(user)) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const kind = (["weight", "sales", "rubro"] as const).find((value) => value === params.report) as ReportKind | undefined;
  if (!kind) return NextResponse.json({ error: "Unknown report." }, { status: 400 });
  const filters = filtersFrom(params, today());
  const shipments = await loadReportShipments(filters);
  const period = filters.from || filters.to ? `${filters.from || "start"} to ${filters.to || "today"}` : "all time";
  return new NextResponse(reportCsv(kind, shipments, filters.groupBy), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ACK ${kind} report ${period}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
