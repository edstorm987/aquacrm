// Every API route is gated — and a NEW one cannot quietly ship without a gate.
//
// ── Why this exists ──────────────────────────────────────────────────────
//
// Phase D began with the obvious question: which routes answer without
// authentication? Answering it by hand took two passes and both were wrong in
// an instructive way.
//
// The first grep looked for `requireRole|requireSession|getSession(|…` and
// reported **48 of 234 routes unauthenticated**, including `portal/dev/repo-write`
// (which writes to a git repository) and `portal/mfa/enrol`. Both are gated —
// the dev routes through `requireDevProjectAccess`, the MFA routes through
// Supabase's own `client.auth.getUser()`. The grep vocabulary was too narrow,
// not the code.
//
// A hand audit that is wrong twice is exactly the thing to turn into a test, so
// the vocabulary lives here where it can be extended deliberately instead of
// re-guessed under pressure.
//
// ── What it proves ───────────────────────────────────────────────────────
//
// Every `src/app/api/**/route.ts` either names a known gate, or is on the
// PUBLIC list below with a reason. The PUBLIC list is the interesting half: it
// is the complete, reviewed set of endpoints that answer a stranger, and adding
// to it is a deliberate act with a sentence attached.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_ROOT = join(ROOT, "src", "app", "api");

/**
 * Every mechanism that constitutes "this route decided who is calling".
 *
 * Session-based, capability-based and key-based all count — the point is that
 * SOMETHING authenticates or authorises, not that it is one particular helper.
 */
const GATES = [
  // Aqua's own session
  "requireRole", "requireSession", "getSessionFromRequest", "getSession(",
  "requireFounder", "requireCurrentAccessActor",
  // The access kernel
  "requireCurrentWorkspaceElementAccess", "requireCurrentClientWorkspaceElementAccess",
  "requireCurrentFulfilmentTechnicalAccess",
  // 2026-09-03: the assistant route binds every AI scope to the asking actor and
  // an element (`requireAssistantElement("workspace.overview")` wraps
  // requireCurrentAccessActor); it is a gate, not a public door.
  "requireAssistantElement",
  "requireAccessCapability", "requireDevProjectAccess", "requireWholeWorkingTreeFounderAccess",
  // Supabase's session (the MFA routes)
  "auth.getUser",
  // Keys, signed capabilities and webhook signatures
  "authenticateExternalAssistant", "verifyInboxMediaToken", "verifyMetaWebhookRequest",
  "canUseDevMode",
];

/**
 * Routes that answer without a session, each for a stated reason.
 *
 * Adding a line here is the reviewable act. Removing a route from the codebase
 * without removing its line here is caught below, so this cannot rot into a
 * list of endpoints that no longer exist.
 */
const PUBLIC: Record<string, string> = {
  // Sign-in and account recovery — these are how you GET a session.
  "auth/csrf": "issues the CSRF token the login form posts back",
  "auth/login": "the sign-in exchange itself",
  "auth/login/browser": "browser variant of the sign-in exchange",
  "auth/signup": "account creation",
  "auth/end-customer/signup": "legacy public path retained as a fail-closed 403; portal membership requires an authenticated agency invitation",
  "auth/me": "reports the caller's session, answering 401 when there is none",
  "auth/magic/request": "requests sign-in only for an existing exact client membership; rate-limited and reveals nothing",
  "auth/magic/verify": "redeems a purpose-bound single-use sign-in or authenticated-agency invitation token",
  "auth/password/request-reset": "requests a reset; must not reveal whether an account exists",
  "auth/password/reset": "redeems a signed reset token",
  "auth/verify-email": "redeems a signed email-verification token",
  "auth/oauth/google/start": "begins the Google OAuth redirect",
  "auth/oauth/google/callback": "receives Google's redirect and validates state",

  // Genuinely public surfaces.
  "public/contact": "the public contact form",
  "public/bot-challenge/config": "serves only the public managed-challenge site key and required/enabled flags; no secret or tenant data",
  "public/demo-interest": "the AquaCRM demo gate — same-origin, honeypotted, rate-limited per caller AND per contact, 404s entirely unless WEBSITE_DEMO_ENABLED is set, and writes only into the website-demo realm: no lead, client or user is created",
  "public/brand-enquiry": "the public enquiry form",
  "public/careers": "the public careers application form",
  "public/form-capture": "the Aqua Tag's capture endpoint for our own sites",
  "public/aqua-tag-config": "serves the Tag's per-site config; no private data",
  "public/health-check/complete": "completes a health check from a link; rate-limited",
  "public/proposals/[token]": "a proposal opened from an emailed link; the token IS the gate",
  "public/client-forms/[connectionId]": "a client's Supabase webhook; HMAC-verified per connection",

  // Machine callers that authenticate by something other than a session.
  "v1/openapi.json": "the API's own published specification",
  "v1/embed/sessions": "mints an embed token only for a matching scoped vault credential; the handler owns the gate",
  "v1/embed/consume": "atomically redeems a scoped, live-credential embed token once",
  "telemetry/collect": "anonymous client telemetry collector; rate-limited",
  "webhooks/meta": "Meta's webhook — HMAC-signed, verified against the raw body",
  "webhooks/twilio/voice": "Twilio's inbound-call webhook — HMAC-SHA1 signed; the `To` number selects the connection whose auth token verifies it, and an unrecognised `To` is refused before any secret is read",

  // Cron.
  "cron/inbox": "scheduled inbox sweep; deployment-scheduled, not user-reachable",
  "cron/radar-probes": "scheduled Radar probes; deployment-scheduled, not user-reachable",
};

function routeFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) routeFiles(full, found);
    else if (entry === "route.ts") found.push(full);
  }
  return found;
}

const routes = routeFiles(API_ROOT).map(file => ({
  id: relative(API_ROOT, file).replace(/\/route\.ts$/, "").replaceAll("\\", "/"),
  source: readFileSync(file, "utf8"),
}));

describe("api route auth coverage", () => {
  it("finds the whole API surface", () => {
    // A collector that silently found nothing would make every assertion below
    // vacuously true — the failure mode this whole file exists to avoid.
    assert.ok(routes.length > 200, `expected the full API surface, collected ${routes.length}`);
  });

  it("every route is gated, or is public for a written reason", () => {
    const ungated = routes
      .filter(route => !GATES.some(gate => route.source.includes(gate)))
      .filter(route => !(route.id in PUBLIC))
      .map(route => route.id);

    assert.deepEqual(
      ungated,
      [],
      `these routes name no gate and are not on the reviewed public list:\n  ${ungated.join("\n  ")}\n` +
      "Either gate the route, or add it to PUBLIC with the reason it may answer a stranger.",
    );
  });

  it("the public list has no entries for routes that no longer exist", () => {
    const ids = new Set(routes.map(route => route.id));
    const stale = Object.keys(PUBLIC).filter(id => !ids.has(id));
    assert.deepEqual(stale, [], `PUBLIC names routes that are gone: ${stale.join(", ")}`);
  });

  it("the Meta webhook cannot fail open", () => {
    // The classic hole in signed webhooks: "no secret configured, so allow".
    // Here the secrets are collected into a Set and the result is
    // `[...secrets].some(...)` — an empty Set returns false, which denies.
    const meta = readFileSync(join(ROOT, "src/lib/server/integrations/metaMessaging.ts"), "utf8");
    assert.match(meta, /if \(!signatureHeader\) return false;/, "a missing signature must deny");
    assert.match(meta, /\[\.\.\.secrets\]\.some\(secret => verifyMetaWebhookSignature/, "with no secret the check must deny, not pass");
    assert.match(meta, /crypto\.timingSafeEqual\(a, b\)/, "the comparison must be timing-safe");
    assert.match(meta, /a\.length === b\.length && a\.length > 0/, "an empty digest must not compare equal");
  });
});

describe("the scoped embed credential boundary", () => {
  // These are routing/architecture tripwires. Adversarial behavior is exercised
  // separately by smoke-embed-security.test.ts.
  const tokenSource = readFileSync(join(ROOT, "src/lib/server/aquaEmbedToken.ts"), "utf8");
  const route = readFileSync(join(ROOT, "src/app/api/v1/embed/sessions/route.ts"), "utf8");
  const handler = readFileSync(join(ROOT, "src/lib/server/embedSessionHandlers.ts"), "utf8");
  const authority = readFileSync(join(ROOT, "src/lib/server/embedCredentialAuthority.ts"), "utf8");

  it("does not retain deployment-wide credential authority", () => {
    assert.doesNotMatch(tokenSource, /AQUA_EMBED_API_TOKEN|matchesEmbedApiToken|expectedEmbedApiToken/);
    assert.doesNotMatch(route, /AQUA_EMBED_API_TOKEN|matchesEmbedApiToken|getClient\(/);
    assert.doesNotMatch(handler, /AQUA_EMBED_API_TOKEN/);
    assert.match(authority, /EMBED_CREDENTIAL_PROVIDER = "aqua-embed"/);
  });

  it("keeps the public route thin and delegates to the reviewed handler", () => {
    assert.match(route, /return handleEmbedSessionMint\(request\)/);
    assert.match(handler, /resolveEmbedBearer\(bearerFromRequest\(request\), clientId\)/);
    assert.match(handler, /embedCredentialAllows\(credential, client, mode\)/);
  });

  it("carries immutable credential lineage and revalidates it on consumption", () => {
    assert.match(tokenSource, /agencyId: string/);
    assert.match(tokenSource, /credentialId: string/);
    assert.match(tokenSource, /credentialVersion: string/);
    assert.match(handler, /revalidateEmbedCredential\(payload\)/);
    assert.match(handler, /nonceStore\.consumeNonce\(payload\.nonce, "aqua-embed"/);
  });
});
