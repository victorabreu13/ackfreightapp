import { NextResponse } from "next/server";
import { canReadGuias, guiaWhere } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseUnNumbers } from "@/lib/guias/dg";
import { renderDgLabels } from "@/lib/guias/dg/labels-pdf";
import { planDgLabels, type LabelChoice } from "@/lib/guias/dg/un";

function choice(value: string | null): LabelChoice {
  return value === "yes" || value === "no" ? value : "auto";
}

/** The dangerous goods labels for one or more UN numbers, drawn as a printable PDF. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || !canReadGuias(user)) return NextResponse.json({ error: "Team only." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const un = parseUnNumbers(params.get("un")).map((number) => `UN${number}`).join(" ");
  if (!un) return NextResponse.json({ error: "Enter at least one UN number." }, { status: 400 });
  const plan = planDgLabels({
    un,
    copies: Number(params.get("copies")) || 1,
    cargoAircraftOnly: choice(params.get("cao")),
    arrows: choice(params.get("arrows")),
    marks: params.get("marks") === "1",
  });
  let shipper = "";
  let consignee = "";
  const guiaId = params.get("guia");
  if (guiaId) {
    const guia = await prisma.airWaybillDocument.findFirst({
      where: { id: guiaId, ...guiaWhere(user) },
      select: { shipperName: true, consigneeName: true },
    });
    shipper = guia?.shipperName ?? "";
    consignee = guia?.consigneeName ?? "";
  }
  try {
    const pdf = await renderDgLabels(plan, { shipper, consignee, generatedBy: user.email });
    const name = `DG-LABELS ${plan.units.map((unit) => `UN${unit.un}`).join(" ")}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${params.get("download") === "1" ? "attachment" : "inline"}; filename="${name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not draw the labels.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
