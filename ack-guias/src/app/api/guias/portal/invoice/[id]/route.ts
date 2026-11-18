import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { invoicePdf } from "@/lib/guias/invoice-service";

/** An invoice of the client that is signed in. Only an invoice that accounting already sent is shown. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || user.role !== "CUSTOMER" || !user.clientId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await context.params;
  const invoice = await prisma.invoice.findFirst({ where: { id, status: "sent", guiaClientId: user.clientId }, include: { lines: true } });
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
    console.error("customer invoice", error);
    return NextResponse.json({ error: "Could not open the invoice." }, { status: 500 });
  }
}
