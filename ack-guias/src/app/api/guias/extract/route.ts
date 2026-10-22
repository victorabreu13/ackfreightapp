import { NextResponse } from "next/server";
import { canManageGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { extractGuiaFromEnv } from "@/lib/guias/parser";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || !canManageGuias(user)) return NextResponse.json({ error: "Team only." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { text?: string } | null;
  const text = String(body?.text ?? "");
  if (!text.trim()) return NextResponse.json({ error: "Paste the client instructions first." }, { status: 400 });
  const extracted = await extractGuiaFromEnv(text);
  return NextResponse.json(extracted);
}
