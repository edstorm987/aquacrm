import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";

import { NextRequest } from "next/server";

process.env.PORTAL_BACKEND = "memory";
process.env.PORTAL_SESSION_SECRET = "abuse-admission-smoke-secret";

import { POST as signupPOST } from "../src/app/api/auth/signup/route";
import { GET as verifyEmailGET } from "../src/app/api/auth/verify-email/route";
import { POST as passwordResetPOST } from "../src/app/api/auth/password/request-reset/route";
import { POST as magicRequestPOST } from "../src/app/api/auth/magic/request/route";
import {
  activateAgencySignup,
  AGENCY_SIGNUP_SETUP_COOKIE,
  claimAgencySignupVerification,
  getAgencySignupOperation,
  prepareAgencySignup,
  recordAgencySignupDelivery,
  type AgencySignupActivationDependencies,
} from "../src/server/agencySignup";
import { consumeVerifyNonce, verifyVerifyEmailToken } from "../src/lib/server/auth/emailVerification";
import { __resetBotChallengeForTest } from "../src/lib/server/security/botChallenge";
import { _createMemoryAdapterForTests, _swapStoreForTests } from "../src/lib/server/auth/nonceStore";
import { reset } from "../src/server/storage";
import { bindSupabaseAuthIdentity, createUser, getUser } from "../src/server/users";
import { createAgency, getAgency, listAgencies } from "../src/server/tenants";
import { SESSION_COOKIE_NAME } from "../src/lib/server/auth/auth";

const ORIGIN = "http://localhost:3030";
const savedEnvironment = {
  site: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  secret: process.env.TURNSTILE_SECRET_KEY,
  resend: process.env.RESEND_API_KEY,
  from: process.env.AQUACRM_AUTH_FROM_EMAIL,
  legacyFrom: process.env.MILESYMEDIA_FROM_EMAIL,
};
let realFetch: typeof fetch;

function challengeAction(token: string): string {
  const match = /^valid:([^:]+):/.exec(token);
  return match?.[1] ?? "wrong-action";
}

function jsonRequest(path: string, body: unknown, ip: string): NextRequest {
  return new NextRequest(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

function formRequest(fields: Record<string, string>, ip: string): NextRequest {
  return new NextRequest(`${ORIGIN}/api/auth/signup`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-forwarded-for": ip,
      referer: `${ORIGIN}/published/contact`,
    },
    body: new URLSearchParams(fields).toString(),
  });
}

function sessionCookie(response: Response): string | undefined {
  return response.headers.getSetCookie().find(value => value.startsWith(`${SESSION_COOKIE_NAME}=`));
}

function setupCookie(response: Response): string | undefined {
  return response.headers.getSetCookie().find(value => value.startsWith(`${AGENCY_SIGNUP_SETUP_COOKIE}=`));
}

before(() => {
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
  process.env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";
  delete process.env.RESEND_API_KEY;
  delete process.env.AQUACRM_AUTH_FROM_EMAIL;
  delete process.env.MILESYMEDIA_FROM_EMAIL;
  realFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL ? input.toString() : input.url;
    if (!url.includes("challenges.cloudflare.com/turnstile")) {
      throw new Error(`Unexpected network request in local abuse smoke: ${url}`);
    }
    const form = new URLSearchParams(typeof init?.body === "string" ? init.body : "");
    const token = form.get("response") ?? "";
    return new Response(JSON.stringify({
      success: token.startsWith("valid:"),
      action: challengeAction(token),
      hostname: "localhost",
      challenge_ts: new Date().toISOString(),
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
});

beforeEach(async () => {
  await reset();
  await _swapStoreForTests(_createMemoryAdapterForTests());
  __resetBotChallengeForTest();
});

after(() => {
  globalThis.fetch = realFetch;
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  };
  restore("NEXT_PUBLIC_TURNSTILE_SITE_KEY", savedEnvironment.site);
  restore("TURNSTILE_SECRET_KEY", savedEnvironment.secret);
  restore("RESEND_API_KEY", savedEnvironment.resend);
  restore("AQUACRM_AUTH_FROM_EMAIL", savedEnvironment.from);
  restore("MILESYMEDIA_FROM_EMAIL", savedEnvironment.legacyFrom);
});

describe("managed challenges precede victim-address budgets", () => {
  it("tokenless reset requests cannot spend a victim's email budget", async () => {
    const email = "reset-victim@example.test";
    for (let index = 0; index < 4; index += 1) {
      const denied = await passwordResetPOST(jsonRequest(
        "/api/auth/password/request-reset",
        { email },
        `40.0.0.${index + 1}`,
      ));
      assert.equal(denied.status, 403);
    }
    const admitted = await passwordResetPOST(jsonRequest(
      "/api/auth/password/request-reset",
      { email, captchaToken: "valid:password-reset-request:1" },
      "40.0.0.99",
    ));
    assert.equal(admitted.status, 200);
  });

  it("tokenless magic requests cannot spend a victim's scoped email budget", async () => {
    const body = { email: "magic-victim@example.test", clientId: "client-victim" };
    for (let index = 0; index < 4; index += 1) {
      const denied = await magicRequestPOST(jsonRequest(
        "/api/auth/magic/request",
        body,
        `40.0.1.${index + 1}`,
      ));
      assert.equal(denied.status, 403);
    }
    const admitted = await magicRequestPOST(jsonRequest(
      "/api/auth/magic/request",
      { ...body, captchaToken: "valid:magic-link-request:1" },
      "40.0.1.99",
    ));
    assert.equal(admitted.status, 200);
    assert.deepEqual(await admitted.json(), { ok: true, sent: true });
  });

  it("tokenless owner and published-lead requests create no admission, tenant, user or lead", async () => {
    const ownerEmail = "blocked-owner@example.test";
    const blockedOwner = await signupPOST(jsonRequest(
      "/api/auth/signup",
      { email: ownerEmail, companyName: "Blocked Owner Ltd" },
      "40.0.2.1",
    ));
    assert.equal(blockedOwner.status, 403);
    assert.equal(getAgencySignupOperation(ownerEmail), null);

    const blockedLead = await signupPOST(formRequest({
      name: "Blocked Lead",
      email: "blocked-lead@example.test",
    }, "40.0.2.2"));
    assert.equal(blockedLead.status, 303);
    assert.match(decodeURIComponent(blockedLead.headers.getSetCookie().join("\n")), /verification challenge/i);
    assert.equal(listAgencies().length, 0);
    assert.equal(getUser(ownerEmail), null);
  });
});

describe("agency owner mailbox-first state machine", () => {
  it("keeps existing-account and new-address admission responses indistinguishable in production", async () => {
    const agency = createAgency({ name: "Existing Agency" });
    createUser({
      email: "existing-owner@example.test",
      password: "Existing-owner-password-123",
      role: "agency-owner",
      agencyId: agency.id,
    });
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const existing = await signupPOST(jsonRequest(
        "/api/auth/signup",
        {
          email: "existing-owner@example.test",
          companyName: "Existing Agency",
          captchaToken: "valid:agency-signup:existing",
        },
        "41.0.0.20",
      ));
      const fresh = await signupPOST(jsonRequest(
        "/api/auth/signup",
        {
          email: "fresh-owner@example.test",
          companyName: "Fresh Agency",
          captchaToken: "valid:agency-signup:fresh",
        },
        "41.0.0.21",
      ));
      assert.equal(existing.status, 202);
      assert.equal(fresh.status, 202);
      assert.deepEqual(await existing.json(), await fresh.json());
      assert.equal(getAgencySignupOperation("existing-owner@example.test"), null);
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("mounted JSON admission and email verification never issue an owner session", async () => {
    const email = "mailbox-first-owner@example.test";
    const response = await signupPOST(jsonRequest(
      "/api/auth/signup",
      {
        email,
        companyName: "Mailbox First Ltd",
        password: "must-not-be-stored-before-proof",
        captchaToken: "valid:agency-signup:1",
      },
      "41.0.0.1",
    ));
    assert.equal(response.status, 202);
    assert.equal(sessionCookie(response), undefined);
    assert.equal(listAgencies().length, 0);
    assert.equal(getUser(email), null);
    const operation = getAgencySignupOperation(email);
    assert.ok(operation);
    assert.doesNotMatch(JSON.stringify(operation), /must-not-be-stored-before-proof/);

    const body = await response.json() as { devVerifyUrl?: string };
    assert.ok(body.devVerifyUrl);
    const verified = await verifyEmailGET(new NextRequest(body.devVerifyUrl!));
    assert.equal(sessionCookie(verified), undefined);
    assert.ok(setupCookie(verified), "mailbox proof should issue only the narrow setup capability");
    assert.equal(getAgencySignupOperation(email)?.stage, "email-verified");
    assert.equal(listAgencies().length, 0);
    assert.equal(getUser(email), null);
  });

  it("duplicate requests and definitive delivery failure reuse one stable operation and token", async () => {
    const now = Date.now();
    const email = "delivery-retry@example.test";
    const first = await prepareAgencySignup({ email, companyName: "Retry Ltd", now });
    assert.ok(first.operation && first.verificationToken && first.shouldDeliver);
    await recordAgencySignupDelivery(first.operation.id, first.operation.deliveryGeneration, {
      delivered: false,
      error: "mail provider unavailable",
    }, now + 1);
    assert.equal(getAgencySignupOperation(email)?.deliveryStatus, "failed");

    const cooldownDuplicate = await prepareAgencySignup({ email, companyName: "Retry Ltd", now: now + 10_000 });
    assert.equal(cooldownDuplicate.shouldDeliver, false);
    assert.equal(cooldownDuplicate.operation?.id, first.operation.id);
    const retry = await prepareAgencySignup({ email, companyName: "Retry Ltd", now: now + 61_000 });
    assert.equal(retry.shouldDeliver, true);
    assert.equal(retry.operation?.id, first.operation.id);
    assert.equal(retry.operation?.userId, first.operation.userId);
    assert.equal(retry.operation?.agencyId, first.operation.agencyId);
    assert.equal(retry.verificationToken, first.verificationToken);

    await recordAgencySignupDelivery(first.operation.id, first.operation.deliveryGeneration, {
      delivered: true,
      externalMessageId: "stale-generation",
    }, now + 62_000);
    assert.equal(getAgencySignupOperation(email)?.deliveryStatus, "pending", "stale delivery receipt must not win");
  });

  it("an ambiguous delivery retries the exact generation and provider idempotency key", async () => {
    const now = Date.now();
    const email = "ambiguous-delivery@example.test";
    const first = await prepareAgencySignup({ email, companyName: "Ambiguous Mail Ltd", now });
    assert.ok(first.operation && first.verificationToken);
    await recordAgencySignupDelivery(first.operation.id, first.operation.deliveryGeneration, {
      delivered: false,
      error: "provider response lost",
      outcomeUnknown: true,
    }, now + 1);

    const retry = await prepareAgencySignup({
      email,
      companyName: "Ambiguous Mail Ltd",
      now: now + 61_000,
    });
    assert.ok(retry.operation && retry.shouldDeliver);
    assert.equal(retry.operation.deliveryGeneration, first.operation.deliveryGeneration);
    assert.equal(retry.verificationToken, first.verificationToken);
    assert.equal(retry.operation.deliveryAttempts, 2);

    await recordAgencySignupDelivery(retry.operation.id, retry.operation.deliveryGeneration, {
      delivered: true,
      externalMessageId: "provider-message",
    }, now + 61_001);
    await recordAgencySignupDelivery(retry.operation.id, retry.operation.deliveryGeneration, {
      delivered: false,
      error: "late failed response",
    }, now + 61_002);
    assert.equal(getAgencySignupOperation(email)?.deliveryStatus, "delivered", "a late failure cannot replace a success receipt");
  });

  it("a crash before the delivery receipt retries the same provider operation", async () => {
    const now = Date.now();
    const email = "pending-delivery@example.test";
    const first = await prepareAgencySignup({ email, companyName: "Pending Mail Ltd", now });
    assert.ok(first.operation && first.shouldDeliver);

    const retry = await prepareAgencySignup({
      email,
      companyName: "Pending Mail Ltd",
      now: now + 61_000,
    });
    assert.ok(retry.operation && retry.shouldDeliver);
    assert.equal(retry.operation.deliveryGeneration, first.operation.deliveryGeneration);
    assert.equal(retry.verificationToken, first.verificationToken);
  });

  it("verification replay and lost provider responses converge on one agency and owner", async () => {
    const email = "resume-owner@example.test";
    const prepared = await prepareAgencySignup({ email, companyName: "Resume Agency" });
    assert.ok(prepared.operation && prepared.verificationToken);
    const token = verifyVerifyEmailToken(prepared.verificationToken);
    assert.equal(token.ok, true);
    if (!token.ok) return;
    const wrongPurpose = await claimAgencySignupVerification({
      ...token.payload,
      purpose: "email-verify",
    });
    assert.deepEqual(wrongPurpose, { ok: false, error: "invalid_verification_purpose" });
    const firstClaim = await claimAgencySignupVerification(token.payload);
    assert.equal(
      await consumeVerifyNonce(token.payload.nonce, token.payload.exp),
      false,
      "the exact verification transition consumes its durable nonce once",
    );
    const replayClaim = await claimAgencySignupVerification(token.payload);
    assert.equal(firstClaim.ok, true);
    assert.deepEqual(replayClaim, firstClaim, "same signed proof should repair/replay only the narrow setup capability");
    if (!firstClaim.ok || firstClaim.state !== "setup-required") return;

    let remoteCreated = false;
    let providerCalls = 0;
    const dependencies: AgencySignupActivationDependencies = {
      async provisionProvider() {
        providerCalls += 1;
        if (!remoteCreated) {
          remoteCreated = true;
          throw new Error("response lost after provider create");
        }
        return { id: "supabase_resume_owner" };
      },
    };
    await assert.rejects(
      activateAgencySignup({ setupToken: firstClaim.setupToken, password: "Resume-password-123", dependencies }),
      /response lost/,
    );
    assert.equal(listAgencies().length, 0);
    assert.equal(getUser(email), null);
    assert.equal(getAgencySignupOperation(email)?.activationAttempts, 1);

    const completed = await activateAgencySignup({
      setupToken: firstClaim.setupToken,
      password: "Resume-password-123",
      dependencies,
    });
    assert.equal(completed.operation.stage, "complete");
    assert.equal(completed.user.role, "agency-owner");
    assert.ok(completed.user.emailVerifiedAt);
    assert.equal(completed.user.supabaseAuthUserId, "supabase_resume_owner");
    assert.equal(listAgencies().length, 1);
    assert.equal(providerCalls, 2, "retry adopts the externally created identity instead of creating another");

    const replayComplete = await activateAgencySignup({
      setupToken: firstClaim.setupToken,
      password: "Resume-password-123",
      dependencies,
    });
    assert.equal(replayComplete.user.id, completed.user.id);
    assert.equal(completed.completedNow, true);
    assert.equal(replayComplete.completedNow, false, "replayed setup proof cannot mint another session");
    assert.equal(listAgencies().length, 1);
    assert.equal(providerCalls, 2, "completed replay must not touch the provider");
  });

  it("a local binding failure rolls the new agency and owner back atomically", async () => {
    const otherAgency = createAgency({ name: "Existing Principal" });
    const otherUser = createUser({
      email: "existing-principal@example.test",
      password: "Existing-password-123",
      role: "agency-owner",
      agencyId: otherAgency.id,
    });
    assert.ok(bindSupabaseAuthIdentity(otherUser.id, "supabase_conflict"));

    const email = "rollback-owner@example.test";
    const prepared = await prepareAgencySignup({ email, companyName: "Rollback Agency" });
    assert.ok(prepared.operation && prepared.verificationToken);
    const token = verifyVerifyEmailToken(prepared.verificationToken);
    assert.equal(token.ok, true);
    if (!token.ok) return;
    const claim = await claimAgencySignupVerification(token.payload);
    assert.equal(claim.ok, true);
    if (!claim.ok || claim.state !== "setup-required") return;

    await assert.rejects(activateAgencySignup({
      setupToken: claim.setupToken,
      password: "Rollback-password-123",
      dependencies: { provisionProvider: async () => ({ id: "supabase_conflict" }) },
    }), /binding_failed/);
    assert.equal(getAgency(prepared.operation.agencyId), null, "failed transaction must not leave the new tenant");
    assert.equal(getUser(email), null, "failed transaction must not leave the owner");
    assert.ok(getAgency(otherAgency.id), "pre-existing state must survive the rollback");
    assert.equal(getAgencySignupOperation(email)?.stage, "provider-ready", "provider receipt remains resumable");
  });
});

describe("source-level order and truthful invitation affordances", () => {
  it("challenge checks precede subject budgets, lookup and work on all three request routes", () => {
    const signup = readFileSync("src/app/api/auth/signup/route.ts", "utf8");
    const reset = readFileSync("src/app/api/auth/password/request-reset/route.ts", "utf8");
    const magic = readFileSync("src/app/api/auth/magic/request/route.ts", "utf8");
    const accountStart = signup.indexOf("async function handleAccountSignup");
    const account = signup.slice(accountStart);
    assert.ok(account.indexOf('action: "agency-signup"') < account.indexOf("agency-signup-email:"));
    assert.ok(account.indexOf("agency-signup-email:") < account.indexOf("prepareAgencySignup"));
    assert.ok(reset.indexOf('action: "password-reset-request"') < reset.indexOf("password-reset-email:"));
    assert.ok(reset.indexOf("password-reset-email:") < reset.indexOf("const user = getUser"));
    assert.ok(magic.indexOf('action: "magic-link-request"') < magic.indexOf("magic-email:"));
    assert.ok(magic.indexOf("magic-email:") < magic.indexOf("const client = getClient"));
    assert.ok(signup.indexOf('action: "website-lead-signup"') < signup.indexOf("website-lead-signup-email:"));
    assert.ok(signup.indexOf("website-lead-signup-email:") < signup.indexOf("const owner = resolveLeadOwner"));
  });

  it("all mounted clients carry the exact action token and reset single-use challenges", () => {
    const forgot = readFileSync("src/app/login/forgot/ForgotForm.tsx", "utf8");
    const login = readFileSync("src/app/login/LoginForm.tsx", "utf8");
    const lead = readFileSync("src/built-ins/modules/website-editor/src/components/blocks/SignupFormBlock.tsx", "utf8");
    assert.match(forgot, /action="password-reset-request"/);
    assert.match(forgot, /captchaRef\.current\?\.reset\(\)/);
    assert.match(login, /"magic-link-request"/);
    assert.match(login, /captchaToken/);
    assert.match(login, /captchaRef\.current\?\.reset\(\)/);
    assert.match(lead, /action="website-lead-signup"/);
    assert.match(lead, /name="captchaToken"/);
  });

  it("removes direct end-customer signup and preserves authenticated invitations", () => {
    const login = readFileSync("src/app/login/LoginForm.tsx", "utf8");
    const publishedLogin = readFileSync("src/built-ins/modules/website-editor/src/components/blocks/LoginFormBlock.tsx", "utf8");
    const publicSignup = readFileSync("src/app/api/auth/end-customer/signup/route.ts", "utf8");
    const issuer = readFileSync("src/app/api/tenants/customer-portal-control/route.ts", "utf8");
    const verifier = readFileSync("src/app/api/auth/magic/verify/route.ts", "utf8");
    assert.doesNotMatch(login, /end-customer\/signup|allowSignup|mode === "signup"/);
    assert.match(login, /access is invitation-only/i);
    assert.match(publishedLogin, /signupHref && signupHref !== "\/signup"/);
    assert.match(publishedLogin, /Create an account/);
    assert.match(publishedLogin, /access is invitation-only/i);
    assert.match(publicSignup, /status: 403/);
    assert.match(issuer, /signClientPortalInviteToken/);
    assert.match(issuer, /invitationsEnabled: true/);
    assert.match(verifier, /purpose === "client-portal-invite"/);
  });
});
