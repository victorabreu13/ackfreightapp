/** Project-number Cloud Run URL. Not the legacy `*.a.run.app` status.url. */
export const CANONICAL_APP_URL = "https://ack-guias-711303341686.us-east1.run.app";

type UrlEnv = {
  APP_URL?: string;
  AUTH_URL?: string;
  NEXTAUTH_URL?: string;
  NODE_ENV?: string;
};

function strip(url: string): string {
  return url.trim().replace(/\/$/, "");
}

/** `gcloud run services describe` status.url. Auth.js must not use it. */
export function isLegacyCloudRunHost(value: string): boolean {
  try {
    return new URL(value).hostname.endsWith(".a.run.app");
  } catch {
    return value.includes(".a.run.app");
  }
}

/**
 * Public origin for OAuth and Auth.js.
 * In production, `APP_URL` wins. A legacy `*.a.run.app` value is ignored.
 * Bracket reads stay runtime values; Next does not inline those.
 */
export function resolveAppUrl(env: UrlEnv = process.env): string {
  const appUrl = strip(env.APP_URL ?? "");
  if (env.NODE_ENV === "production") {
    if (appUrl && !isLegacyCloudRunHost(appUrl)) return appUrl;
    return CANONICAL_APP_URL;
  }
  const local = strip(appUrl || env.AUTH_URL || env.NEXTAUTH_URL || "http://127.0.0.1:43123");
  if (local && !isLegacyCloudRunHost(local)) return local;
  return "http://127.0.0.1:43123";
}

/** Point Auth.js at the canonical origin before it reads the environment. */
export function applyCanonicalAuthEnv(env: NodeJS.ProcessEnv = process.env): string {
  const url = resolveAppUrl(env);
  env.APP_URL = url;
  env.AUTH_URL = url;
  env.NEXTAUTH_URL = url;
  env.AUTH_TRUST_HOST = "true";
  return url;
}

/** Rebuild an Auth.js request so provider URLs use the canonical host. */
export function canonicalAuthRequest(request: Request, appUrl = resolveAppUrl()): Request {
  const canonical = new URL(appUrl);
  const url = new URL(request.url);
  url.protocol = canonical.protocol;
  url.host = canonical.host;
  const headers = new Headers(request.headers);
  headers.set("host", canonical.host);
  headers.set("x-forwarded-host", canonical.host);
  headers.set("x-forwarded-proto", canonical.protocol.replace(":", ""));
  const method = request.method;
  return new Request(url, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : request.body,
  });
}
