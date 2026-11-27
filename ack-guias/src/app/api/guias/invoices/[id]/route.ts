import { NextResponse } from "next/server";
import { canViewFinance } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { invoicePdf } from "@/lib/guias/invoice-service";

/** The PDF of an invoice, draft or sent, for the accounting. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || !canViewFinance(user)) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await context.params;
  const invoice = await prisma.invoice.findUnique({ where: { id }, include: { lines: true } });
  if (!invoice) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const pdf = await invoicePdf(invoice);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Invoice ${invoice.number}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("invoice pdf", error);
    return NextResponse.json({ error: "Could not open the invoice." }, { status: 500 });
  }
}
