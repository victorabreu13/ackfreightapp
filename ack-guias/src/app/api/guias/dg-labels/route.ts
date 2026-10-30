import { NextResponse } from "next/server";
import { canReadGuias, guiaWhere } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseUnNumbers } from "@/lib/guias/dg";
import { renderDgChecklist, renderDgParties } from "@/lib/guias/dg/labels-pdf";
import { dgParty } from "@/lib/guias/dg/party-text";
import { planDgLabels, type LabelChoice } from "@/lib/guias/dg/un";

function choice(value: string | null): LabelChoice {
  return value === "yes" || value === "no" ? value : "auto";
}

function pdf(bytes: Buffer, name: string, download: boolean) {
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

/**
 * The two dangerous goods papers the team needs: kind=checklist is the checklist of required labels with their
 * drawings and a box to check, and kind=parties is the Shipper and Consignee as the DGD shows them.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || !canReadGuias(user)) return NextResponse.json({ error: "Team only." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const download = params.get("download") === "1";
  const kind = params.get("kind") ?? "checklist";

  let guia: { awb: string; shipperName: string | null; shipperAddress: string | null; consigneeName: string | null; consigneeAddress: string | null } | null = null;
  const guiaId = params.get("guia");
  if (guiaId) {
    guia = await prisma.airWaybillDocument.findFirst({
      where: { id: guiaId, ...guiaWhere(user) },
      select: { awb: true, shipperName: true, shipperAddress: true, consigneeName: true, consigneeAddress: true },
    });
  }

  try {
    if (kind === "parties") {
      const shipper = dgParty(params.get("shipperName") ?? guia?.shipperName, params.get("shipperAddress") ?? guia?.shipperAddress);
      const consignee = dgParty(params.get("consigneeName") ?? guia?.consigneeName, params.get("consigneeAddress") ?? guia?.consigneeAddress);
      if (!shipper.name && !consignee.name) return NextResponse.json({ error: "Enter the shipper and the consignee." }, { status: 400 });
      return pdf(await renderDgParties(shipper, consignee), "DGD SHIPPER AND CONSIGNEE.pdf", download);
    }
    if (kind !== "checklist") return NextResponse.json({ error: "Unknown document." }, { status: 400 });
    const un = parseUnNumbers(params.get("un")).map((number) => `UN${number}`).join(" ");
    if (!un) return NextResponse.json({ error: "Enter at least one UN number." }, { status: 400 });
    const copies = Number(params.get("copies")) || 1;
    const plan = planDgLabels({
      un,
      copies,
      cargoAircraftOnly: choice(params.get("cao")),
      arrows: choice(params.get("arrows")),
      marks: params.get("marks") === "1",
    });
    const bytes = await renderDgChecklist(plan, { copies: Math.max(1, Math.min(50, Math.round(copies))), reference: guia?.awb ? `AWB ${guia.awb}` : undefined });
    return pdf(bytes, `DG LABEL CHECKLIST ${plan.units.map((unit) => `UN${unit.un}`).join(" ")}.pdf`, download);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not draw the document.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
