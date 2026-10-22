import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { realmTakenByOther, saveConnection } from "@/lib/guias/qbo-connection";
import { exchangeQboCode, qboCredentials, qboRedirectUri, qboTokenKey, readOAuthState } from "@/lib/guias/qbo";

function settingsError(message: string) {
  return NextResponse.redirect(new URL(`/guias/settings?error=${encodeURIComponent(message)}`, process.env.AUTH_URL || "http://127.0.0.1:43127"));
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || !isAdmin(user)) {
    return new NextResponse("Solo un administrador puede conectar QuickBooks.", {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const params = new URL(request.url).searchParams;
  const authUrl = process.env.AUTH_URL?.trim() || "";
  const state = readOAuthState(params.get("state") ?? "", qboTokenKey(), Date.now());
  if (!state || state.userId !== user.id || state.agentKey !== "ack") {
    return settingsError("La conexión de QuickBooks venció. Inténtalo de nuevo.");
  }
  const code = params.get("code")?.trim() ?? "";
  const realmId = params.get("realmId")?.trim() ?? "";
  if (!code || !realmId) return settingsError("QuickBooks no devolvió la autorización.");
  if (await realmTakenByOther(state.agentKey, realmId)) {
    return settingsError("Esa compañía de QuickBooks ya está conectada a la otra empresa.");
  }
  const creds = qboCredentials(state.agentKey);
  if (!creds || !authUrl) return settingsError("Faltan los secretos QBO_CLIENT_ID y QBO_CLIENT_SECRET.");
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
    return settingsError("QuickBooks no completó la conexión.");
  }
  return NextResponse.redirect(new URL(`/guias/settings?saved=qbo&company=${state.agentKey}`, authUrl));
}
