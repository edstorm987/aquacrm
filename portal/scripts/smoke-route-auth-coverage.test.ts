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
  "auth/end-customer/signup": "a client's own customer creating their account",
  "auth/me": "reports the caller's session, answering 401 when there is none",
  "auth/magic/request": "requests a magic link; rate-limited, reveals nothing",
  "auth/magic/verify": "redeems a signed magic-link token",
  "auth/password/request-reset": "requests a reset; must not reveal whether an account exists",
  "auth/password/reset": "redeems a signed reset token",
  "auth/verify-email": "redeems a signed email-verification token",
  "auth/oauth/google/start": "begins the Google OAuth redirect",
  "auth/oauth/google/callback": "receives Google's redirect and validates state",

  // Genuinely public surfaces.
  "public/contact": "the public contact form",
  "public/brand-enquiry": "the public enquiry form",
  "public/careers": "the public careers application form",
  "public/form-capture": "the Aqua Tag's capture endpoint for our own sites",
  "public/aqua-tag-config": "serves the Tag's per-site config; no private data",
  "public/health-check/complete": "completes a health check from a link; rate-limited",
  "public/proposals/[token]": "a proposal opened from an emailed link; the token IS the gate",
  "public/client-forms/[connectionId]": "a client's Supabase webhook; HMAC-verified per connection",

  // Machine callers that authenticate by something other than a session.
  "v1/openapi.json": "the API's own published specification",
  "v1/embed/sessions": "mints an embed session; the embed key is checked inside",
  "v1/embed/consume": "redeems an embed session token",
  "telemetry/collect": "anonymous client telemetry collector; rate-limited",
  "webhooks/meta": "Meta's webhook — HMAC-signed, verified against the raw body",

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

describe("the embed API token", () => {
  // Found in the D9 mutating-route sweep. The route is correctly gated, but
  // the SHAPE of the gate is worth pinning, because the parts that are real
  // guarantees and the part that is a deployment decision look alike from
  // inside the handler.
  const tokenSource = readFileSync(join(ROOT, "src/lib/server/aquaEmbedToken.ts"), "utf8");
  const route = readFileSync(join(ROOT, "src/app/api/v1/embed/sessions/route.ts"), "utf8");

  it("cannot fail open in production", () => {
    // Unset in production resolves to "" and `matchesEmbedApiToken` refuses any
    // candidate against an empty expectation — so a deploy that forgets the
    // variable denies everyone rather than admitting everyone. The local
    // fallback is explicitly gated on NOT being production.
    assert.match(tokenSource, /if \(configured\) return configured;/, "a configured token must win");
    assert.match(tokenSource, /return isProduction\(\) \? "" : LOCAL_API_TOKEN;/, "production must fall back to no token, never to the local one");
    assert.match(tokenSource, /if \(!candidate \|\| !expected\) return false;/, "an empty expectation must deny, not admit");
    assert.match(tokenSource, /left\.length === right\.length && timingSafeEqual\(left, right\)/, "the comparison must be timing-safe");
  });

  it("is checked before the handler does anything else", () => {
    // The 401 must be the first statement in the handler: a token check that
    // happens after a lookup is a token check that leaks whether a record
    // exists to an unauthenticated caller.
    const body = /export async function POST\(req: NextRequest\) \{([\s\S]{0,220})/.exec(route);
    assert.ok(body, "the embed session handler must still be a POST");
    assert.match(body[1], /^\s*if \(!matchesEmbedApiToken\(bearerToken\(req\)\)\) \{/, "the bearer check must come first");
  });

  it("is deployment-wide, and that is recorded rather than assumed", () => {
    // ── A DECISION FOR ED, not a defect ──────────────────────────────────
    //
    // There is ONE `AQUA_EMBED_API_TOKEN` for the whole deployment, and this
    // route applies NO agency scoping: `getClient(clientId)` finds any client
    // in any agency, `mode` is taken from the request body (so the caller may
    // choose "admin"), and the response returns that client's name.
    //
    // For a single-operator deployment that is coherent — Ed holds the token.
    // The risk is what the feature is FOR: an embed token is the thing you hand
    // to whoever embeds a portal in their own site. Hand it to one partner and
    // they can mint an admin embed session for every other tenant's clients.
    //
    // This test does not change that. It fails if the shape changes, so the
    // decision has to be re-made deliberately instead of drifting.
    assert.match(route, /const client = getClient\(clientId\);/, "still resolves a client with no agency scope");
    assert.doesNotMatch(route, /getClientForAgency/, "if this gains agency scoping, revisit the note in this test");
    assert.match(route, /body\.mode === "admin" \? "admin" : "client"/, "mode still comes from the request body");
  });
});
