import { NextRequest } from "next/server";
import { applyCanonicalAuthEnv, canonicalAuthRequest } from "@/lib/app-url";
import { handlers } from "@/lib/auth";

export const dynamic = "force-dynamic";

function canonicalNextRequest(request: NextRequest): NextRequest {
  applyCanonicalAuthEnv();
  const canonical = canonicalAuthRequest(request);
  return new NextRequest(canonical.url, {
    method: canonical.method,
    headers: canonical.headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    duplex: "half",
  });
}

export function GET(request: NextRequest) {
  return handlers.GET(canonicalNextRequest(request));
}

export function POST(request: NextRequest) {
  return handlers.POST(canonicalNextRequest(request));
}
