import { NextResponse } from "next/server";
import { ACK_AGENT_KEY, canReadGuias } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { ensureDirectorySeeded, searchClients, searchParties, type PartyRole } from "@/lib/guias/parties";

const ROLE_BY_TYPE: Record<string, PartyRole> = {
  shipper: "SHIPPER",
  consignee: "CONSIGNEE",
  notify: "NOTIFY",
};

/** Suggestions for the new guía form: clients, and the shippers, consignees and notify parties of the directory. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || !canReadGuias(user)) return NextResponse.json({ error: "Team only." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const type = params.get("type") ?? "";
  const query = (params.get("q") ?? "").slice(0, 120);
  try {
    if (type === "client") {
      return NextResponse.json({ items: await searchClients(ACK_AGENT_KEY, query) }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const role = ROLE_BY_TYPE[type];
    if (!role) return NextResponse.json({ error: "Unknown lookup." }, { status: 400 });
    await ensureDirectorySeeded(ACK_AGENT_KEY);
    const items = await searchParties({ agentKey: ACK_AGENT_KEY, role, query, clientName: (params.get("client") ?? "").slice(0, 160) });
    return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("guía lookup", error);
    return NextResponse.json({ items: [] });
  }
}
