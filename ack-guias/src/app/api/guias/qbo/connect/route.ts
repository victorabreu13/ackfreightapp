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
    return new NextResponse("Solo un administrador puede conectar QuickBooks.", {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const agentKey = companyKeyOrNull(new URL(request.url).searchParams.get("agentKey"));
  if (agentKey !== "ack") return settingsError("ACK TEAM LLC es la única empresa.");
  const creds = qboCredentials(agentKey);
  if (!creds) return settingsError("Faltan los secretos QBO_CLIENT_ID y QBO_CLIENT_SECRET.");
  const authUrl = resolveAppUrl();
  const state = signOAuthState({ agentKey, userId: user.id, exp: Date.now() + 10 * 60 * 1000 }, qboTokenKey());
  return NextResponse.redirect(qboAuthorizeUrl({ clientId: creds.clientId, redirectUri: qboRedirectUri(authUrl), state }));
}
