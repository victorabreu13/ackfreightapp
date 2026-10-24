import { NextResponse } from "next/server";
import { canManageGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { parseCustomLabel, renderCustomLabel } from "@/lib/guias/custom-label";

/** A custom 4 x 6 in label. The fields come in the query string, which is the same one the page uses for its preview. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || !canManageGuias(user)) return NextResponse.json({ error: "Team only." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const spec = parseCustomLabel(params);
  if (!spec.text.trim()) return NextResponse.json({ error: "Write the text of the label." }, { status: 400 });
  try {
    const bytes = await renderCustomLabel(spec);
    const download = params.get("download") === "1";
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="CUSTOM LABEL.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not draw the label." }, { status: 500 });
  }
}
