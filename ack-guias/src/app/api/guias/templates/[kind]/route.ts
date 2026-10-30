import { NextResponse } from "next/server";
import { canReadGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { loadCompany } from "@/lib/guias/company";
import { renderGuiaPdf } from "@/lib/guias/files";
import { isTemplateKind, sampleGuia, samplePrintOptions, templateFileName } from "@/lib/guias/templates";

/** Draws a template with made-up data so the team can see it. Nothing is saved or sent to Drive. */
export async function GET(request: Request, context: { params: Promise<{ kind: string }> }) {
  const user = await getSessionUser();
  if (!user || !canReadGuias(user)) return NextResponse.json({ error: "Team only." }, { status: 401 });
  const { kind } = await context.params;
  if (!isTemplateKind(kind)) return NextResponse.json({ error: "Unknown template." }, { status: 404 });
  try {
    const company = await loadCompany("ack");
    const pdf = await renderGuiaPdf(kind, sampleGuia(), company, samplePrintOptions(user.email, user.name));
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${templateFileName(kind)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not render that template.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
