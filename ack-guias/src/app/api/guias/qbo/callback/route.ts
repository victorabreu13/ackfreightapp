import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { realmTakenByOther, saveConnection } from "@/lib/guias/qbo-connection";
import { resolveAppUrl } from "@/lib/app-url";
import { exchangeQboCode, qboCredentials, qboRedirectUri, qboTokenKey, readOAuthState } from "@/lib/guias/qbo";

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
  const params = new URL(request.url).searchParams;
  const authUrl = resolveAppUrl();
  const state = readOAuthState(params.get("state") ?? "", qboTokenKey(), Date.now());
  if (!state || state.userId !== user.id || state.agentKey !== "ack") {
    return settingsError("The QuickBooks connection expired. Try again.");
  }
  const code = params.get("code")?.trim() ?? "";
  const realmId = params.get("realmId")?.trim() ?? "";
  if (!code || !realmId) return settingsError("QuickBooks did not return the authorization.");
  if (await realmTakenByOther(state.agentKey, realmId)) {
    return settingsError("That QuickBooks company is already connected to the other company.");
  }
  const creds = qboCredentials(state.agentKey);
  if (!creds || !authUrl) return settingsError("The secrets QBO_CLIENT_ID and QBO_CLIENT_SECRET are missing.");
  try {
    const tokens = await exchangeQboCode({
      code,
      redirectUri: qboRedirectUri(authUrl),
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
    });
    await saveConnection({
      agentKey: state.agentKey,
      realmId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      refreshExpiresIn: tokens.x_refresh_token_expires_in,
      connectedBy: user.email,
    });
  } catch (error) {
    console.error("QuickBooks callback", error instanceof Error ? error.name : "error");
    return settingsError("QuickBooks did not complete the connection.");
  }
  return NextResponse.redirect(new URL(`/guias/settings?saved=qbo&company=${state.agentKey}`, authUrl));
}
