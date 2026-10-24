import assert from "node:assert/strict";
import test from "node:test";
import { CANONICAL_APP_URL, canonicalAuthRequest, isLegacyCloudRunHost, resolveAppUrl } from "@/lib/app-url";

test("production auth ignores the legacy Cloud Run status.url", () => {
  const legacy = "https://ack-guias-c6zfevpofa-ue.a.run.app";
  assert.equal(isLegacyCloudRunHost(legacy), true);
  assert.equal(isLegacyCloudRunHost(CANONICAL_APP_URL), false);
  assert.equal(
    resolveAppUrl({ NODE_ENV: "production", AUTH_URL: legacy, NEXTAUTH_URL: legacy }),
    CANONICAL_APP_URL,
  );
  assert.equal(
    resolveAppUrl({ NODE_ENV: "production", APP_URL: "https://guias.ackfreight.com/" }),
    "https://guias.ackfreight.com",
  );
  assert.equal(resolveAppUrl({ NODE_ENV: "production", APP_URL: legacy }), CANONICAL_APP_URL);
});

test("the auth request host is rewritten to the canonical origin", () => {
  const request = canonicalAuthRequest(
    new Request("https://ack-guias-c6zfevpofa-ue.a.run.app/api/auth/providers"),
    CANONICAL_APP_URL,
  );
  assert.equal(request.url, `${CANONICAL_APP_URL}/api/auth/providers`);
  assert.equal(request.headers.get("x-forwarded-host"), "ack-guias-711303341686.us-east1.run.app");
});
