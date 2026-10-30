import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadCompany } from "@/lib/guias/company";
import { renderGuiaPdf } from "@/lib/guias/files";

/** The AWB of one guía, for the client that owns it. It is the only document a client can open. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || user.role !== "CUSTOMER" || !user.clientId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await context.params;
  const document = await prisma.airWaybillDocument.findFirst({
    where: { id, product: "guia", agentKey: "ack", status: "issued", guiaClientId: user.clientId },
    include: { lines: { orderBy: { sortOrder: "asc" } }, agent: true, guiaClient: true },
  });
  if (!document) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const company = await loadCompany("ack");
    const pdf = await renderGuiaPdf("awb", document, company, { email: user.email, name: user.name, customerCopy: true });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${document.awb} - AWB.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("customer AWB", error);
    return NextResponse.json({ error: "Could not open the AWB." }, { status: 500 });
  }
}
