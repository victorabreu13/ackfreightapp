import { NextResponse } from "next/server";
import { canReadGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { searchDrivers } from "@/lib/guias/drivers";

/** Suggestions for the Carrier and Driver fields of a warehouse receipt, from the drivers already saved. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || !canReadGuias(user)) return NextResponse.json({ error: "Team only." }, { status: 401 });
  const query = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 80);
  try {
    return NextResponse.json({ items: await searchDrivers(query) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("drivers lookup", error);
    return NextResponse.json({ items: [] });
  }
}
