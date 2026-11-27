import { prisma } from "@/lib/db";
import {
  decryptSecret,
  encryptSecret,
  qboCredentials,
  qboTokenKey,
  refreshQboToken,
  type CompanyKey,
} from "@/lib/guias/qbo";

const REFRESH_WINDOW_MS = 120_000;

export async function realmTakenByOther(agentKey: CompanyKey, realmId: string): Promise<boolean> {
  const other = await prisma.quickBooksConnection.findFirst({
    where: { realmId, NOT: { agentKey } },
    select: { agentKey: true },
  });
  return Boolean(other);
}

export async function saveConnection(input: {
  agentKey: CompanyKey;
  realmId: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn?: number;
  connectedBy: string;
  touchConnectedAt?: boolean;
}) {
  const key = qboTokenKey();
  const now = Date.now();
  await prisma.quickBooksConnection.upsert({
    where: { agentKey: input.agentKey },
    create: {
      agentKey: input.agentKey,
      realmId: input.realmId,
      accessTokenEnc: encryptSecret(input.accessToken, key),
      refreshTokenEnc: encryptSecret(input.refreshToken, key),
      accessExpiresAt: new Date(now + input.expiresIn * 1000),
      refreshExpiresAt: input.refreshExpiresIn ? new Date(now + input.refreshExpiresIn * 1000) : null,
      connectedBy: input.connectedBy,
    },
    update: {
      realmId: input.realmId,
      accessTokenEnc: encryptSecret(input.accessToken, key),
      refreshTokenEnc: encryptSecret(input.refreshToken, key),
      accessExpiresAt: new Date(now + input.expiresIn * 1000),
      refreshExpiresAt: input.refreshExpiresIn ? new Date(now + input.refreshExpiresIn * 1000) : null,
      connectedBy: input.connectedBy,
      ...(input.touchConnectedAt === false ? {} : { connectedAt: new Date() }),
    },
  });
}

/** Access token for this company only. Refresh writes back to the same row. */
export async function accessForCompany(agentKey: CompanyKey): Promise<{ realmId: string; accessToken: string } | null> {
  const row = await prisma.quickBooksConnection.findUnique({ where: { agentKey } });
  if (!row) return null;
  const key = qboTokenKey();
  const creds = qboCredentials(agentKey);
  const fresh = row.accessExpiresAt.getTime() - Date.now() > REFRESH_WINDOW_MS;
  if (fresh || !creds) {
    return { realmId: row.realmId, accessToken: decryptSecret(row.accessTokenEnc, key) };
  }
  const next = await refreshQboToken({
    refreshToken: decryptSecret(row.refreshTokenEnc, key),
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
  });
  await saveConnection({
    agentKey,
    realmId: row.realmId,
    accessToken: next.access_token,
    refreshToken: next.refresh_token,
    expiresIn: next.expires_in,
    refreshExpiresIn: next.x_refresh_token_expires_in,
    connectedBy: row.connectedBy,
    touchConnectedAt: false,
  });
  return { realmId: row.realmId, accessToken: next.access_token };
}
