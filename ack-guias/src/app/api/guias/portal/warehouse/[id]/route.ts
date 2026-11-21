import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadCompany } from "@/lib/guias/company";
import { receiptNumber } from "@/lib/guias/wr";
import { renderWarehouseReceipt } from "@/lib/guias/wr-pdf";

/**
 * A warehouse receipt of a shipment of the client that is signed in. Only the receipt itself is shown, not the cargo
 * acceptance checklist, and only when the receipt belongs to an issued guía of that client.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || user.role !== "CUSTOMER" || !user.clientId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await context.params;
  const receipt = await prisma.warehouseReceipt.findFirst({
    where: { id, guia: { product: "guia", status: "issued", agentKey: "ack", guiaClientId: user.clientId } },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!receipt) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const company = await loadCompany("ack");
    const pdf = await renderWarehouseReceipt(receipt, company, { checklist: false });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="WAREHOUSE RECEIPT ${receiptNumber(receipt.seq)}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("customer warehouse receipt", error);
    return NextResponse.json({ error: "Could not open the warehouse receipt." }, { status: 500 });
  }
}
