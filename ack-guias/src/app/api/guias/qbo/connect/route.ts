import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { resolveAppUrl } from "@/lib/app-url";
import { companyKeyOrNull, qboAuthorizeUrl, qboCredentials, qboRedirectUri, qboTokenKey, signOAuthState } from "@/lib/guias/qbo";

function settingsError(message: string) {
  return NextResponse.redirect(new URL(`/guias/settings?error=${encodeURIComponent(message)}`, resolveAppUrl()));
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || !isAdmin(user)) {
    return new NextResponse("Only an administrator can connect QuickBooks.", {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const agentKey = companyKeyOrNull(new URL(request.url).searchParams.get("agentKey"));
  if (agentKey !== "ack") return settingsError("ACK TEAM LLC is the only company.");
  const creds = qboCredentials(agentKey);
  if (!creds) return settingsError("The secrets QBO_CLIENT_ID and QBO_CLIENT_SECRET are missing.");
  const authUrl = resolveAppUrl();
  const state = signOAuthState({ agentKey, userId: user.id, exp: Date.now() + 10 * 60 * 1000 }, qboTokenKey());
  return NextResponse.redirect(qboAuthorizeUrl({ clientId: creds.clientId, redirectUri: qboRedirectUri(authUrl), state }));
}
