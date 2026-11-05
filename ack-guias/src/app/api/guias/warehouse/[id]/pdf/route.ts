import { NextResponse } from "next/server";
import { canReadGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadCompany } from "@/lib/guias/company";
import { receiptNumber } from "@/lib/guias/wr";
import { renderWarehouseReceipt } from "@/lib/guias/wr-pdf";

/** The warehouse receipt as a PDF: the receipt and the cargo acceptance checklist. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || !canReadGuias(user)) return NextResponse.json({ error: "Team only." }, { status: 401 });
  const { id } = await context.params;
  const receipt = await prisma.warehouseReceipt.findUnique({ where: { id }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
  if (!receipt) return NextResponse.json({ error: "Warehouse receipt not found." }, { status: 404 });
  const company = await loadCompany("ack").catch((error: unknown) => (error instanceof Error ? error.message : "Unknown issuing company"));
  if (typeof company === "string") return NextResponse.json({ error: company }, { status: 400 });
  try {
    const bytes = await renderWarehouseReceipt(receipt, company);
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="WAREHOUSE RECEIPT ${receiptNumber(receipt.seq)}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not draw the receipt." }, { status: 500 });
  }
}
