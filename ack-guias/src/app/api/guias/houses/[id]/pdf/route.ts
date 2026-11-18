import { NextResponse } from "next/server";
import { canReadGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadCompany } from "@/lib/guias/company";
import { renderHouseAwb } from "@/lib/guias/house-pdf";

const INCLUDE = { lines: { orderBy: { sortOrder: "asc" as const } }, agent: true, guiaClient: true };

/** The house air waybill as a PDF. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || !canReadGuias(user)) return NextResponse.json({ error: "Team only." }, { status: 401 });
  const { id } = await context.params;
  const house = await prisma.airWaybillDocument.findFirst({ where: { id, product: "house" }, include: INCLUDE });
  if (!house) return NextResponse.json({ error: "House not found." }, { status: 404 });
  const master = house.masterId ? await prisma.airWaybillDocument.findFirst({ where: { id: house.masterId, product: "guia" }, include: INCLUDE }) : null;
  const company = await loadCompany("ack").catch((error: unknown) => (error instanceof Error ? error.message : "Unknown issuing company"));
  if (typeof company === "string") return NextResponse.json({ error: company }, { status: 400 });
  try {
    const params = new URL(request.url).searchParams;
    const bytes = await renderHouseAwb(house, master, company, { email: user.email, name: user.name, draft: params.get("draft") === "1" });
    const name = `HAWB ${(house.hawb ?? "").trim() || "DRAFT"}.pdf`;
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${params.get("download") === "1" ? "attachment" : "inline"}; filename="${name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not draw the house." }, { status: 500 });
  }
}
