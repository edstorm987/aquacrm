import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";

process.env.NODE_ENV = "test";
process.env.PORTAL_BACKEND = "memory";
process.env.PORTAL_SESSION_SECRET = "login-route-context-test-secret";
process.env.NEXT_PUBLIC_PORTAL_BASE_URL = "http://localhost:3999";
process.env.PUBLIC_AUTH_RESPONSE_WINDOW_MS = "1";
delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
delete process.env.TURNSTILE_SECRET_KEY;

import {
  resolvePasswordResetAuthContext,
  resolvePublicAuthContext,
  resolveUserAuthContext,
} from "../src/lib/server/auth/authContext";
import { buildAuthorizeUrl, verifyOAuthState } from "../src/lib/server/integrations/oauthGoogle";
import { signPasswordResetToken, verifyPasswordResetToken } from "../src/lib/server/auth/passwordReset";
import { handlePasswordResetRequest } from "../src/app/api/auth/password/request-reset/handler";
import { GET as leaveShowcase } from "../src/app/login/live/route";
import { GET as startOAuth } from "../src/app/api/auth/oauth/google/start/route";
import { reset } from "../src/server/storage";
import { createAgency, createClient } from "../src/server/tenants";
import { createUser, updateUser } from "../src/server/users";

let agencyA: ReturnType<typeof createAgency>;
let agencyB: ReturnType<typeof createAgency>;
let clientA: ReturnType<typeof createClient>;
let clientB: ReturnType<typeof createClient>;
let owner: ReturnType<typeof createUser>;
let customer: ReturnType<typeof createUser>;

before(async () => {
  await reset();
  agencyA = createAgency({ name: "Context A & Sons", slug: "context-a" });
  agencyB = createAgency({ name: "Context B", slug: "context-b" });
  clientA = createClient(agencyA.id, { name: "Exact Client A" });
  clientB = createClient(agencyB.id, { name: "Exact Client B" });
  owner = createUser({
    email: "context-owner@example.test",
    password: "Context-owner-password-123",
    role: "agency-owner",
    agencyId: agencyA.id,
  });
  owner = updateUser(owner.email, { agencyIds: [agencyA.id, agencyB.id] }, { role: "agency-owner" })!;
  customer = createUser({
    email: "context-customer@example.test",
    password: "Context-customer-password-123",
    role: "end-customer",
    agencyId: agencyA.id,
    clientId: clientA.id,
  });
});

describe("exact login and recovery context", () => {
  it("lets presentation narrow authority but never grant or cross a membership/client", () => {
    assert.equal(resolveUserAuthContext(owner, { brand: agencyB.slug })?.agency.id, agencyB.id);
    assert.equal(resolveUserAuthContext(owner, { brand: "aqua" })?.agency.id, agencyA.id,
      "a static front cannot select or reject an otherwise exact primary membership");
    assert.equal(resolveUserAuthContext(owner, { brand: "missing-tenant" }), null);
    assert.equal(resolveUserAuthContext(customer, {
      brand: agencyA.slug,
      clientId: clientA.id,
    })?.client?.id, clientA.id);
    assert.equal(resolveUserAuthContext(customer, {
      brand: "aqua",
      clientId: clientA.id,
    })?.agency.id, agencyA.id, "a static website front is presentation, not authority");
    assert.equal(resolveUserAuthContext(customer, { brand: agencyB.slug, clientId: clientA.id }), null);
    assert.equal(resolveUserAuthContext(customer, { brand: agencyA.slug, clientId: clientB.id }), null);
    assert.equal(resolveUserAuthContext(customer, { clientId: `${clientA.id} ` }), null,
      "changed client input is not normalised into authority");
    assert.equal(resolveUserAuthContext(customer, { clientId: 42 }), null,
      "a malformed explicit client cannot be discarded into unscoped authority");

    const exactPublic = resolvePublicAuthContext({ brand: agencyA.slug, clientId: clientA.id });
    assert.equal(exactPublic.valid, true);
    assert.equal(exactPublic.exact?.agency.id, agencyA.id);
    assert.equal(resolvePublicAuthContext({ brand: agencyB.slug, clientId: clientA.id }).valid, false);
    assert.equal(resolvePublicAuthContext({ clientId: `${clientA.id} ` }).valid, false);
    assert.equal(resolvePublicAuthContext({ brand: agencyB.slug, clientId: clientB.id }).exact?.agency.id, agencyB.id,
      "an exact client remains anchored to its own agency");
  });

  it("signs the resolved tenant/client into the reset bearer and rejects a conflicting subject", () => {
    const signed = signPasswordResetToken({
      userId: customer.id,
      email: customer.email,
      sessionRev: customer.sessionRev ?? 0,
      clientId: clientA.id,
      contextAgencyId: agencyA.id,
    });
    assert.equal(verifyPasswordResetToken(signed.token).ok, true);
    assert.equal(resolvePasswordResetAuthContext(signed.payload)?.agency.id, agencyA.id);
    assert.equal(resolvePasswordResetAuthContext({ ...signed.payload, contextAgencyId: agencyB.id }), null);
    assert.equal(resolvePasswordResetAuthContext({ ...signed.payload, clientId: clientB.id }), null);
  });

  it("preserves the exact client through the showcase-to-live boundary", async () => {
    const url = new URL("/login/live", "http://localhost:3999");
    url.searchParams.set("brand", agencyA.slug);
    url.searchParams.set("clientId", clientA.id);
    url.searchParams.set("next", "/portal/customer?tab=files");
    const response = await leaveShowcase(new NextRequest(url));
    assert.equal(response.status, 303);
    const location = new URL(response.headers.get("location")!, "http://localhost:3999");
    assert.equal(location.pathname, "/login");
    assert.equal(location.searchParams.get("brand"), agencyA.slug);
    assert.equal(location.searchParams.get("clientId"), clientA.id);
    assert.equal(location.searchParams.get("next"), "/portal/customer?tab=files");

    const loginPage = readFileSync("src/app/login/page.tsx", "utf8");
    const loginRoute = readFileSync("src/app/api/auth/login/route.ts", "utf8");
    assert.match(loginPage, /query\.set\("clientId", context\.requestedClientId\)/);
    assert.match(loginPage, /contextIsValid \? \([\s\S]*?<LoginForm[\s\S]*?login-context-error/,
      "an invalid explicit context must not be omitted into an unscoped login form");
    assert.match(loginRoute, /resolveUserAuthContext\(portalUser/);
    assert.match(loginRoute, /clientId: body\.clientId/);
  });

  it("emails only the server-resolved tenant/client presentation", async () => {
    const sent: Array<Record<string, unknown>> = [];
    const request = (brand: string, ip: string) => new NextRequest(
      "http://localhost:3999/api/auth/password/request-reset",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ email: customer.email, brand, clientId: clientA.id }),
      },
    );
    const sendEmail = async (input: Record<string, unknown>) => {
      sent.push(input);
      return { delivered: true, via: "resend" as const, externalMessageId: "context-message" };
    };
    const exact = await handlePasswordResetRequest(request(agencyA.slug, "127.0.20.1"), { sendEmail });
    const exactBody = await exact.json() as { ok: boolean; devResetUrl?: string };
    assert.equal(exactBody.ok, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.agencyId, agencyA.id);
    assert.equal(sent[0]?.clientId, clientA.id);
    assert.match(String(sent[0]?.subject), new RegExp(agencyA.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(String(sent[0]?.bodyHtml), /Context A &amp; Sons/);
    assert.ok(exactBody.devResetUrl);
    assert.equal(new URL(exactBody.devResetUrl!).searchParams.has("brand"), false,
      "caller-selected presentation is not copied beside the signed bearer");
    const bearer = verifyPasswordResetToken(new URL(exactBody.devResetUrl!).searchParams.get("token")!);
    assert.equal(bearer.ok, true);
    if (bearer.ok) {
      assert.equal(bearer.payload.contextAgencyId, agencyA.id);
      assert.equal(bearer.payload.clientId, clientA.id);
    }

    const mismatch = await handlePasswordResetRequest(request(agencyB.slug, "127.0.20.2"), { sendEmail });
    assert.deepEqual(await mismatch.json(), { ok: true });
    assert.equal(sent.length, 1, "a cross-tenant brand/client conflict sends no message");
    const callerStaticBrand = await handlePasswordResetRequest(request("milesymedia", "127.0.20.3"), { sendEmail });
    assert.equal((await callerStaticBrand.json() as { ok: boolean }).ok, true);
    assert.equal(sent.length, 2, "a static website front does not prevent the exact subject receiving recovery");
    assert.match(String(sent[1]?.subject), /Context A & Sons/);
    assert.doesNotMatch(String(sent[1]?.subject), /Milesymedia/,
      "caller-selected static presentation never becomes recovery email truth");

    const ownerReset = await handlePasswordResetRequest(new NextRequest(
      "http://localhost:3999/api/auth/password/request-reset",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "127.0.20.4" },
        body: JSON.stringify({ email: owner.email, brand: agencyB.slug }),
      },
    ), { sendEmail });
    assert.equal((await ownerReset.json() as { ok: boolean }).ok, true);
    assert.equal(sent[2]?.agencyId, agencyB.id,
      "a multi-agency subject's exact recovery context selects the matching tenant delivery configuration");
    assert.match(String(sent[2]?.subject), /Context B/);
  });
});

describe("signed OAuth navigation context", () => {
  const config = { clientId: "context-google", clientSecret: "secret", redirectUri: "http://localhost/callback" };

  it("validates public tenant/client context before redirecting to Google", async () => {
    const savedClient = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const savedSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    process.env.GOOGLE_OAUTH_CLIENT_ID = "context-google";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "context-secret";
    try {
      const exactUrl = new URL("/api/auth/oauth/google/start", "http://localhost:3999");
      exactUrl.searchParams.set("brand", agencyA.slug);
      exactUrl.searchParams.set("clientId", clientA.id);
      exactUrl.searchParams.set("return", "/portal/customer");
      const exact = await startOAuth(new NextRequest(exactUrl));
      assert.equal(exact.status, 302);
      const provider = new URL(exact.headers.get("location")!);
      assert.equal(provider.hostname, "accounts.google.com");
      assert.deepEqual(verifyOAuthState(provider.searchParams.get("state")!, process.env.PORTAL_SESSION_SECRET!), {
        ok: true,
        returnUrl: "/portal/customer",
        brand: agencyA.slug,
        clientId: clientA.id,
      });

      for (const [brand, clientId] of [
        [agencyB.slug, clientA.id],
        [agencyA.slug, "missing-client"],
      ]) {
        const mismatchUrl = new URL(exactUrl);
        mismatchUrl.searchParams.set("brand", brand!);
        mismatchUrl.searchParams.set("clientId", clientId!);
        const mismatch = await startOAuth(new NextRequest(mismatchUrl));
        const fallback = new URL(mismatch.headers.get("location")!, "http://localhost:3999");
        assert.equal(fallback.pathname, "/login");
        assert.equal(fallback.searchParams.get("oauth_error"), "invalid_context");
        assert.equal(fallback.searchParams.has("brand"), false, "untrusted context is not reflected");
        assert.equal(fallback.searchParams.has("clientId"), false, "untrusted client is not reflected");
      }
    } finally {
      if (savedClient === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_ID;
      else process.env.GOOGLE_OAUTH_CLIENT_ID = savedClient;
      if (savedSecret === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      else process.env.GOOGLE_OAUTH_CLIENT_SECRET = savedSecret;
    }
  });

  it("round-trips exact brand/client context and normalises unsafe returns", () => {
    const { state } = buildAuthorizeUrl(config, {
      secret: "oauth-state-context-secret",
      returnUrl: "/portal/customer?tab=files",
      brand: "context-a",
      clientId: "client-context-a",
    });
    assert.deepEqual(verifyOAuthState(state, "oauth-state-context-secret"), {
      ok: true,
      returnUrl: "/portal/customer?tab=files",
      brand: "context-a",
      clientId: "client-context-a",
    });
    for (const returnUrl of [
      "//attacker.test/x",
      "/\\attacker.test/x",
      "/%2f%2fattacker.test/x",
      "/%5cattacker.test/x",
      "https://attacker.test/x",
    ]) {
      const unsafe = buildAuthorizeUrl(config, { secret: "oauth-state-context-secret", returnUrl });
      assert.equal(verifyOAuthState(unsafe.state, "oauth-state-context-secret").ok, true);
      assert.equal((verifyOAuthState(unsafe.state, "oauth-state-context-secret") as { returnUrl: string }).returnUrl, "/portal");
    }
  });

  it("rejects context tampering and oversized hostile state before callback authority", () => {
    const { state } = buildAuthorizeUrl(config, {
      secret: "oauth-state-context-secret",
      returnUrl: "/portal",
      brand: "context-a",
      clientId: "client-context-a",
    });
    const [body, signature] = state.split(".");
    const decoded = JSON.parse(Buffer.from(body!, "base64url").toString("utf8"));
    decoded.clientId = "client-context-b";
    const tampered = `${Buffer.from(JSON.stringify(decoded)).toString("base64url")}.${signature}`;
    assert.deepEqual(verifyOAuthState(tampered, "oauth-state-context-secret"), { ok: false, error: "invalid_state" });
    assert.deepEqual(verifyOAuthState("a".repeat(4_097), "oauth-state-context-secret"), { ok: false, error: "malformed_state" });
    assert.throws(() => buildAuthorizeUrl(config, {
      secret: "oauth-state-context-secret",
      clientId: "c".repeat(121),
    }), /invalid_oauth_context/);
    assert.throws(() => buildAuthorizeUrl(config, {
      secret: "oauth-state-context-secret",
      brand: " context-a ",
    }), /invalid_oauth_context/);
  });
});
