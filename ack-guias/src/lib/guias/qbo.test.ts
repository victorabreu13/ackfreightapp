import assert from "node:assert/strict";
import test from "node:test";
import { roleOnGoogleSignIn } from "@/lib/auth-role";
import {
  ACK_ACCOUNTING_EMAIL,
  QBO_DUPLICATE,
  QBO_NO_RATE,
  QBO_WRONG_COMPANY,
  createQuickBooksDraft,
  decryptSecret,
  draftInvoiceBody,
  encryptSecret,
  planDraftInvoice,
  qboAuthorizeUrl,
  qboCredentials,
  qboRedirectUri,
  qboTokenKey,
  readOAuthState,
  signOAuthState,
  type DraftInvoiceInput,
} from "@/lib/guias/qbo";

const key = qboTokenKey({ AUTH_SECRET: "test-secret", QBO_TOKEN_KEY: Buffer.alloc(32, 7).toString("base64") });

function guia(overrides: Partial<DraftInvoiceInput> = {}): DraftInvoiceInput {
  return {
    agentKey: "ack",
    connectionAgentKey: "ack",
    status: "issued",
    awb: "006-14513321",
    origin: "PVG",
    destination: "MIA",
    pieces: 4,
    chargeableKg: 10,
    agreedRatePerKg: 2.5,
    lineRate: 99,
    clientName: "ACME",
    qboInvoiceId: null,
    ...overrides,
  };
}

test("sign-in keeps a listed role, rejects a new domain account, and forces admin emails", () => {
  const admins = new Set(["victor.abreu@ackfreight.com", "andres.alvarado@ackfreight.com"]);
  assert.equal(roleOnGoogleSignIn("ACCOUNTING", ACK_ACCOUNTING_EMAIL, admins), "ACCOUNTING");
  assert.equal(roleOnGoogleSignIn("OPERATIONS", "ops@ackfreight.com", admins), "OPERATIONS");
  assert.equal(roleOnGoogleSignIn(null, "new.person@ackfreight.com", admins), null);
  assert.equal(roleOnGoogleSignIn("VIEWER", "andres.alvarado@ackfreight.com", admins), "ADMIN");
  assert.equal(roleOnGoogleSignIn(null, "victor.abreu@ackfreight.com", admins), "ADMIN");
});

test("the draft uses the agreed rate and never the AWB rate", () => {
  const plan = planDraftInvoice(guia());
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.amount, 25);
  assert.equal(plan.unitPrice, 2.5);
  assert.equal(plan.qty, 10);
  assert.equal(plan.description, "AWB 006-14513321 · PVG → MIA · 4 piezas");
  const fromAwbRate = planDraftInvoice(guia({ agreedRatePerKg: null, lineRate: 2.5 }));
  assert.equal(fromAwbRate.ok, false);
  const missing = planDraftInvoice(guia({ agreedRatePerKg: null }));
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error, QBO_NO_RATE);
  const duplicate = planDraftInvoice(guia({ qboInvoiceId: "90" }));
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.error, QBO_DUPLICATE);
  const crossed = planDraftInvoice(guia({ connectionAgentKey: "kope" }));
  assert.equal(crossed.ok, false);
  if (!crossed.ok) assert.equal(crossed.error, QBO_WRONG_COMPANY);
  const body = draftInvoiceBody(plan, "55", "8");
  assert.equal(body.EmailStatus, "NotSet");
  assert.equal("BillEmail" in body, false);
  assert.equal(JSON.stringify(body).includes("send"), false);
  assert.equal(body.Line[0].Amount, 25);
});

test("QuickBooks credentials and the OAuth state stay on one company", () => {
  const env = {
    QBO_CLIENT_ID: "shared-id",
    QBO_CLIENT_SECRET: "shared-secret",
    QBO_CLIENT_ID_ACK: "ack-id",
    QBO_CLIENT_SECRET_ACK: "ack-secret",
  };
  assert.deepEqual(qboCredentials("ack", env), { clientId: "ack-id", clientSecret: "ack-secret" });
  assert.deepEqual(qboCredentials("kope", env), { clientId: "shared-id", clientSecret: "shared-secret" });
  assert.equal(qboCredentials("ack", { QBO_CLIENT_ID_ACK: "ack-id" }), null);
  assert.equal(qboRedirectUri("https://ack-guias.example.run.app/"), "https://ack-guias.example.run.app/api/guias/qbo/callback");
  const state = signOAuthState({ agentKey: "ack", userId: "user-ack", exp: 5_000 }, key);
  assert.deepEqual(readOAuthState(state, key, 4_000), { agentKey: "ack", userId: "user-ack", exp: 5_000 });
  assert.equal(readOAuthState(state, key, 5_001), null);
  assert.equal(readOAuthState(state.slice(0, -2) + "aa", key, 4_000), null);
  const url = new URL(qboAuthorizeUrl({ clientId: "ack-id", redirectUri: qboRedirectUri("https://guias.example"), state }));
  assert.equal(url.searchParams.get("scope"), "com.intuit.quickbooks.accounting");
  assert.equal(url.searchParams.get("redirect_uri"), "https://guias.example/api/guias/qbo/callback");
  const round = decryptSecret(encryptSecret("realm-token", key), key);
  assert.equal(round, "realm-token");
});

test("the invoice is posted only to the ACK realm and is not emailed", async () => {
  const calls: string[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    assert.equal(url.includes("/send"), false);
    assert.equal(url.includes("/company/KOPE-REALM/"), false);
    const href = url;
    if (href.includes("Customer")) {
      return Response.json({ QueryResponse: {} });
    }
    if (href.endsWith("/customer?minorversion=75") || href.includes("/customer?minorversion=75")) {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.DisplayName, "ACME");
      return Response.json({ Customer: { Id: "55", DisplayName: "ACME" } });
    }
    if (href.includes("Item")) {
      return Response.json({ QueryResponse: { Item: [{ Id: "8", Name: "Flete aéreo" }] } });
    }
    if (href.includes("/invoice?")) {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.Line[0].Amount, 25);
      assert.equal(body.Line[0].SalesItemLineDetail.UnitPrice, 2.5);
      assert.equal(body.EmailStatus, "NotSet");
      assert.equal(body.BillEmail, undefined);
      return Response.json({ Invoice: { Id: "90", DocNumber: "1042" } });
    }
    throw new Error(`unexpected ${href}`);
  };
  const created = await createQuickBooksDraft(
    { guia: guia(), realmId: "ACK-REALM", accessToken: "token", apiBase: "https://quickbooks.example" },
    fetchImpl,
  );
  assert.deepEqual(created, { ok: true, id: "90", docNumber: "1042" });
  assert.equal(calls.some((call) => call.includes("/company/ACK-REALM/")), true);
  assert.equal(calls.some((call) => call.includes("/send")), false);

  let fetched = false;
  const blocked = await createQuickBooksDraft(
    {
      guia: guia({ connectionAgentKey: "kope", lineRate: 2.5 }),
      realmId: "KOPE-REALM",
      accessToken: "token",
      apiBase: "https://quickbooks.example",
    },
    async () => {
      fetched = true;
      return Response.json({});
    },
  );
  assert.equal(blocked.ok, false);
  assert.equal(fetched, false);
});
