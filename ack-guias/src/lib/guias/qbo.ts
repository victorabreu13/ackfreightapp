import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const ACK_ACCOUNTING_EMAIL = "xiomara.viloria@ackfreight.com";
export const QBO_SCOPE = "com.intuit.quickbooks.accounting";
export const QBO_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
export const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
export const QBO_ITEM_NAME = "Flete aéreo";
export const QBO_MINOR_VERSION = "75";

export const QBO_NO_RATE = "Este cliente no tiene una tarifa acordada por kilo. No se creó la factura.";
export const QBO_NO_KG = "Esta guía no tiene kilos cobrables. No se creó la factura.";
export const QBO_NOT_ISSUED = "Emite la guía antes de facturar.";
export const QBO_DUPLICATE = "Esta guía ya tiene una factura en QuickBooks.";
export const QBO_IN_PROGRESS = "Ya se está creando la factura de esta guía en QuickBooks.";
export const QBO_NO_CLIENT = "Esta guía no tiene un cliente. No se creó la factura.";
export const QBO_WRONG_COMPANY = "La conexión de QuickBooks no es de esta empresa. No se creó la factura.";
export const QBO_DOWN = "QuickBooks no respondió. No se creó la factura.";
export const QBO_NO_INCOME = "QuickBooks no tiene una cuenta de ingresos para el flete. No se creó la factura.";

export type CompanyKey = "ack" | "kope";

export function companyKeyOrNull(value: string | null | undefined): CompanyKey | null {
  const key = value?.trim().toLowerCase();
  if (key === "ack" || key === "kope") return key;
  return null;
}

export function companyTitle(agentKey: string): string {
  return agentKey === "ack" ? "ACK" : agentKey === "kope" ? "Kope" : agentKey;
}

export function qboNotConnected(agentKey: string): string {
  return `QuickBooks de ${companyTitle(agentKey)} no está conectado.`;
}

export function qboRedirectUri(authUrl: string): string {
  const origin = authUrl.trim().replace(/\/$/, "");
  return `${origin}/api/guias/qbo/callback`;
}

type Env = Record<string, string | undefined>;

export function qboCredentials(agentKey: string, env: Env = process.env): { clientId: string; clientSecret: string } | null {
  const suffix = agentKey.trim().toUpperCase();
  const clientId = env[`QBO_CLIENT_ID_${suffix}`]?.trim() || env.QBO_CLIENT_ID?.trim() || "";
  const clientSecret = env[`QBO_CLIENT_SECRET_${suffix}`]?.trim() || env.QBO_CLIENT_SECRET?.trim() || "";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function qboApiBase(env: Env = process.env): string {
  return env.QBO_ENVIRONMENT === "production" ? "https://quickbooks.api.intuit.com" : "https://sandbox-quickbooks.api.intuit.com";
}

export function qboTokenKey(env: Env = process.env): Buffer {
  const raw = env.QBO_TOKEN_KEY?.trim() ?? "";
  if (raw) {
    const decoded = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
    if (decoded.length === 32) return decoded;
  }
  return scryptSync(env.AUTH_SECRET?.trim() || "dev-guias-secret", "ack-guias-qbo-v1", 32);
}

export function qboTokenKeyIsDedicated(env: Env = process.env): boolean {
  const raw = env.QBO_TOKEN_KEY?.trim() ?? "";
  if (!raw) return false;
  const decoded = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  return decoded.length === 32;
}

export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptSecret(payload: string, key: Buffer): string {
  const [version, ivText, tagText, dataText] = payload.split(".");
  if (version !== "v1" || !ivText || !tagText || !dataText) throw new Error("Bad token payload");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataText, "base64url")), decipher.final()]).toString("utf8");
}

type OAuthState = { agentKey: CompanyKey; userId: string; exp: number };

export function signOAuthState(payload: OAuthState, key: Buffer): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", key).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readOAuthState(token: string, key: Buffer, now: number): OAuthState | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", key).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthState;
    if (parsed.exp < now) return null;
    if (parsed.agentKey !== "ack" && parsed.agentKey !== "kope") return null;
    if (!parsed.userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function qboAuthorizeUrl(input: { clientId: string; redirectUri: string; state: string }): string {
  const url = new URL(QBO_AUTHORIZE_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", QBO_SCOPE);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  return url.toString();
}

export function moneyAmount(kg: number, ratePerKg: number): number {
  return Math.round((kg * ratePerKg + Number.EPSILON) * 100) / 100;
}

export function invoiceDescription(input: { awb: string; origin: string; destination: string; pieces: number }): string {
  const route = [input.origin.trim(), input.destination.trim()].filter(Boolean).join(" → ");
  const parts = [`AWB ${input.awb.trim() || "sin número"}`];
  if (route) parts.push(route);
  parts.push(`${input.pieces} piezas`);
  return parts.join(" · ");
}

export type DraftInvoiceInput = {
  agentKey: string;
  connectionAgentKey: string | null;
  status: string;
  awb: string;
  origin: string;
  destination: string;
  pieces: number;
  chargeableKg: number;
  agreedRatePerKg: number | null;
  /** Printed on the AWB. Never used for the QuickBooks amount. */
  lineRate: number | null;
  clientName: string | null;
  qboInvoiceId: string | null;
};

export type InvoicePlan =
  | { ok: true; amount: number; qty: number; unitPrice: number; description: string; customerName: string }
  | { ok: false; error: string };

export function planDraftInvoice(input: DraftInvoiceInput): InvoicePlan {
  void input.lineRate;
  if (input.status !== "issued") return { ok: false, error: QBO_NOT_ISSUED };
  if (input.qboInvoiceId && !input.qboInvoiceId.startsWith("pending:")) return { ok: false, error: QBO_DUPLICATE };
  if (!input.clientName?.trim()) return { ok: false, error: QBO_NO_CLIENT };
  if (!(input.chargeableKg > 0)) return { ok: false, error: QBO_NO_KG };
  if (input.agreedRatePerKg == null || !(input.agreedRatePerKg > 0)) return { ok: false, error: QBO_NO_RATE };
  if (input.connectionAgentKey !== input.agentKey) return { ok: false, error: input.connectionAgentKey ? QBO_WRONG_COMPANY : qboNotConnected(input.agentKey) };
  return {
    ok: true,
    amount: moneyAmount(input.chargeableKg, input.agreedRatePerKg),
    qty: input.chargeableKg,
    unitPrice: input.agreedRatePerKg,
    description: invoiceDescription(input),
    customerName: input.clientName.trim().slice(0, 100),
  };
}

export function draftInvoiceBody(plan: Extract<InvoicePlan, { ok: true }>, customerId: string, itemId: string) {
  return {
    CustomerRef: { value: customerId },
    EmailStatus: "NotSet" as const,
    PrivateNote: "Borrador creado desde ACK Freight App. No se envía por correo.",
    Line: [
      {
        Amount: plan.amount,
        Description: plan.description,
        DetailType: "SalesItemLineDetail" as const,
        SalesItemLineDetail: {
          ItemRef: { value: itemId },
          Qty: plan.qty,
          UnitPrice: plan.unitPrice,
        },
      },
    ],
  };
}

export function escapeQboLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in?: number;
};

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function exchangeQboCode(
  input: { code: string; redirectUri: string; clientId: string; clientSecret: string },
  fetchImpl: FetchLike = fetch,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
  });
  const response = await fetchImpl(QBO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${input.clientId}:${input.clientSecret}`).toString("base64")}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const parsed = (await readJson(response)) as TokenResponse | null;
  if (!response.ok || !parsed?.access_token || !parsed.refresh_token) throw new Error(QBO_DOWN);
  return parsed;
}

export async function refreshQboToken(
  input: { refreshToken: string; clientId: string; clientSecret: string },
  fetchImpl: FetchLike = fetch,
): Promise<TokenResponse> {
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: input.refreshToken });
  const response = await fetchImpl(QBO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${input.clientId}:${input.clientSecret}`).toString("base64")}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const parsed = (await readJson(response)) as TokenResponse | null;
  if (!response.ok || !parsed?.access_token || !parsed.refresh_token) throw new Error(QBO_DOWN);
  return parsed;
}

type QboEntity = { Id?: string; DisplayName?: string; Name?: string; DocNumber?: string };

function queryRows(payload: unknown, key: "Customer" | "Item" | "Account"): QboEntity[] {
  if (!payload || typeof payload !== "object") return [];
  const query = (payload as { QueryResponse?: Record<string, unknown> }).QueryResponse;
  const rows = query?.[key];
  return Array.isArray(rows) ? (rows as QboEntity[]) : [];
}

async function qboQuery(
  input: { base: string; realmId: string; accessToken: string; statement: string },
  fetchImpl: FetchLike,
): Promise<unknown> {
  const url = `${input.base}/v3/company/${encodeURIComponent(input.realmId)}/query?minorversion=${QBO_MINOR_VERSION}&query=${encodeURIComponent(input.statement)}`;
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.accessToken}`, Accept: "application/json" },
  });
  const parsed = await readJson(response);
  if (!response.ok) throw new Error(QBO_DOWN);
  return parsed;
}

async function qboPost(
  input: { base: string; realmId: string; accessToken: string; path: string; body: unknown },
  fetchImpl: FetchLike,
): Promise<unknown> {
  if (input.path.includes("send")) throw new Error(QBO_WRONG_COMPANY);
  const url = `${input.base}/v3/company/${encodeURIComponent(input.realmId)}/${input.path}?minorversion=${QBO_MINOR_VERSION}`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input.body),
  });
  const parsed = await readJson(response);
  if (!response.ok) throw new Error(QBO_DOWN);
  return parsed;
}

export type QboDraftResult = { ok: true; id: string; docNumber: string } | { ok: false; error: string };

export async function createQuickBooksDraft(
  input: {
    guia: DraftInvoiceInput;
    realmId: string;
    accessToken: string;
    apiBase?: string;
  },
  fetchImpl: FetchLike = fetch,
): Promise<QboDraftResult> {
  const plan = planDraftInvoice(input.guia);
  if (!plan.ok) return plan;
  const base = input.apiBase ?? qboApiBase();
  const realmId = input.realmId.trim();
  if (!realmId) return { ok: false, error: qboNotConnected(input.guia.agentKey) };
  try {
    const customers = queryRows(
      await qboQuery(
        {
          base,
          realmId,
          accessToken: input.accessToken,
          statement: `select Id, DisplayName from Customer where DisplayName = '${escapeQboLiteral(plan.customerName)}'`,
        },
        fetchImpl,
      ),
      "Customer",
    );
    const exact = customers.find((row) => row.DisplayName === plan.customerName && row.Id);
    let customerId = exact?.Id ?? "";
    if (!customerId) {
      const created = (await qboPost(
        { base, realmId, accessToken: input.accessToken, path: "customer", body: { DisplayName: plan.customerName } },
        fetchImpl,
      )) as { Customer?: QboEntity } | null;
      customerId = created?.Customer?.Id ?? "";
    }
    if (!customerId) return { ok: false, error: QBO_DOWN };

    const items = queryRows(
      await qboQuery(
        {
          base,
          realmId,
          accessToken: input.accessToken,
          statement: `select Id, Name from Item where Name = '${escapeQboLiteral(QBO_ITEM_NAME)}'`,
        },
        fetchImpl,
      ),
      "Item",
    );
    let itemId = items.find((row) => row.Name === QBO_ITEM_NAME && row.Id)?.Id ?? "";
    if (!itemId) {
      const accounts = queryRows(
        await qboQuery(
          {
            base,
            realmId,
            accessToken: input.accessToken,
            statement: "select Id, Name from Account where AccountType = 'Income' and Active = true maxresults 1",
          },
          fetchImpl,
        ),
        "Account",
      );
      const incomeId = accounts.find((row) => row.Id)?.Id ?? "";
      if (!incomeId) return { ok: false, error: QBO_NO_INCOME };
      const created = (await qboPost(
        {
          base,
          realmId,
          accessToken: input.accessToken,
          path: "item",
          body: { Name: QBO_ITEM_NAME, Type: "Service", IncomeAccountRef: { value: incomeId } },
        },
        fetchImpl,
      )) as { Item?: QboEntity } | null;
      itemId = created?.Item?.Id ?? "";
    }
    if (!itemId) return { ok: false, error: QBO_DOWN };

    const invoice = (await qboPost(
      {
        base,
        realmId,
        accessToken: input.accessToken,
        path: "invoice",
        body: draftInvoiceBody(plan, customerId, itemId),
      },
      fetchImpl,
    )) as { Invoice?: QboEntity } | null;
    const id = invoice?.Invoice?.Id ?? "";
    if (!id) return { ok: false, error: QBO_DOWN };
    return { ok: true, id, docNumber: invoice?.Invoice?.DocNumber || id };
  } catch (error) {
    const message = error instanceof Error ? error.message : QBO_DOWN;
    if (message === QBO_NO_INCOME || message === QBO_WRONG_COMPANY) return { ok: false, error: message };
    return { ok: false, error: QBO_DOWN };
  }
}
