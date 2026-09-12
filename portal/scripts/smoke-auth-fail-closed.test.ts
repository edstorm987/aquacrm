// Authentication fail-closed + security-control regression (assume-breach
// containment, Phase 0-B).
//
// Pins four contracts:
//   1. Session signing FAILS CLOSED in production: a missing secret, or the
//      public dev-fallback literal, refuses to sign or verify instead of
//      silently minting forgeable cookies (the old behaviour was console.warn
//      + sign with "dev-secret-do-not-use-in-prod").
//   2. The startup environment self-check genuinely gates boot: it throws in
//      production on missing/sentinel secrets, and instrumentation.register()
//      actually calls it (it previously had ZERO callers — dead code billed
//      as "fail-closed boot").
//   3. The proxy's portal gate is ALWAYS strict in production, regardless of
//      NEXT_PUBLIC_PORTAL_SECURITY (which previously switched it off).
//   4. The security control plane enforces suspension, global/tenant/user
//      security epochs and per-session revocation CENTRALLY — a bumped epoch
//      or revoked sid refuses the session on the next request, including
//      legacy cookies that carry no stamps.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

import { inspectEnv, runStartupEnvCheck } from "../src/lib/server/env";
import { isPortalSecurityStrict } from "../src/proxy";
import { issueSession } from "../src/lib/server/auth/auth";
import {
  bumpGlobalSecurityEpoch,
  bumpTenantSecurityEpoch,
  bumpUserSecurityEpoch,
  enforceSessionSecurity,
  newSessionId,
  recordIssuedSession,
  revokeAllUserSessions,
  revokeSession,
  listUserSessions,
  suspendUser,
  unsuspendUser,
} from "../src/lib/server/auth/securityControl";
import type { SessionPayload } from "../src/server/types";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SESSION_TOKEN = join(ROOT, "src/lib/server/auth/sessionToken.ts");

// ─── 1. Session secret fail-closed (child processes, real NODE_ENV) ────────

function signInChild(env: Record<string, string | undefined>): { ok: boolean; out: string } {
  const code = `
    const m = await import(process.env.__TOKEN_PATH);
    const api = m.signSessionPayload ? m : (m.default ?? m);
    const token = api.signSessionPayload({ userId: "u", email: "e@x", role: "agency-owner", agencyId: "a", agencyIds: ["a"], activeAgencyId: "a", sessionRev: 0, iat: 0, exp: 4102444800 });
    process.stdout.write("SIGNED:" + token.length);
  `;
  const cleanEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...process.env, ...env })) {
    if (value !== undefined) cleanEnv[key] = value;
  }
  delete cleanEnv.NODE_OPTIONS;
  try {
    const out = execFileSync(
      process.execPath,
      ["--import", "tsx", "--conditions", "react-server", "--input-type=module", "-e", code],
      { env: { ...cleanEnv, __TOKEN_PATH: SESSION_TOKEN }, encoding: "utf8", timeout: 30_000 },
    );
    return { ok: true, out };
  } catch (error) {
    const stderr = (error as { stderr?: Buffer | string }).stderr?.toString() ?? String(error);
    return { ok: false, out: stderr };
  }
}

test("production with NO session secret refuses to sign", () => {
  const result = signInChild({ NODE_ENV: "production", PORTAL_SESSION_SECRET: undefined });
  assert.equal(result.ok, false, "signing must throw");
  assert.match(result.out, /PORTAL_SESSION_SECRET is unset in production/);
});

test("production with the public dev-fallback secret refuses to sign", () => {
  const result = signInChild({ NODE_ENV: "production", PORTAL_SESSION_SECRET: "dev-secret-do-not-use-in-prod" });
  assert.equal(result.ok, false, "the known public literal must be refused");
  assert.match(result.out, /public dev fallback/);
});

test("production with a real secret signs", () => {
  const result = signInChild({ NODE_ENV: "production", PORTAL_SESSION_SECRET: "a".repeat(48) });
  assert.equal(result.ok, true, `should sign: ${result.out.slice(0, 200)}`);
  assert.match(result.out, /^SIGNED:\d+/);
});

test("development without a secret keeps working (fallback preserved)", () => {
  const result = signInChild({ NODE_ENV: "development", PORTAL_SESSION_SECRET: undefined });
  assert.equal(result.ok, true, `dev must keep the fallback: ${result.out.slice(0, 200)}`);
});

// ─── 2. Startup env check gates boot ───────────────────────────────────────

const VALID_PROD_ENV = {
  NODE_ENV: "production",
  PORTAL_SESSION_SECRET: "s".repeat(40),
  NEXT_PUBLIC_PORTAL_BASE_URL: "https://www.aqua-crm.com",
  NEXT_PUBLIC_PORTAL_SECURITY: "strict",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  NEXT_PUBLIC_SUPABASE_PUBLIC_BUCKET: "aquacrm-public",
  NEXT_PUBLIC_SUPABASE_UPLOAD_BUCKET: "aquacrm-uploads",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  CONTENT_SCANNER_URL: "https://scanner.example.com/v1/scan",
  CONTENT_SCANNER_ALLOWED_ORIGINS: "https://scanner.example.com",
  CONTENT_SCANNER_BEARER_TOKEN: "x".repeat(32),
  FOUNDER_EMAIL: "owner@example.com",
  FOUNDER_PASSWORD: "founder-password-ok",
} as NodeJS.ProcessEnv;

test("startup check throws in production when the session secret is missing", () => {
  const env = { ...VALID_PROD_ENV } as NodeJS.ProcessEnv;
  delete env.PORTAL_SESSION_SECRET;
  assert.throws(() => runStartupEnvCheck(env), /PORTAL_SESSION_SECRET/);
});

test("startup check throws in production on a dev-sentinel secret", () => {
  const env = { ...VALID_PROD_ENV, PORTAL_SESSION_SECRET: "dev-secret" } as NodeJS.ProcessEnv;
  assert.throws(() => runStartupEnvCheck(env), /sentinel|≥32/);
});

test("startup check throws in production when portal security is not strict", () => {
  const env = { ...VALID_PROD_ENV, NEXT_PUBLIC_PORTAL_SECURITY: "off" } as NodeJS.ProcessEnv;
  assert.throws(() => runStartupEnvCheck(env), /NEXT_PUBLIC_PORTAL_SECURITY/);
});

test("startup check passes a fully valid production environment", () => {
  const issues = inspectEnv(VALID_PROD_ENV).filter(issue => issue.severity === "error");
  assert.deepEqual(issues, []);
});

test("instrumentation.register() actually invokes the startup check", () => {
  // The wiring pin: the check had ZERO callers before 2026-09-08. If this
  // import or call is removed, boot silently stops being fail-closed again.
  const source = readFileSync(join(ROOT, "src/instrumentation.ts"), "utf8");
  assert.ok(source.includes('import("@/lib/server/env")'), "instrumentation must import the env module");
  assert.ok(source.includes("runStartupEnvCheck()"), "instrumentation must call runStartupEnvCheck()");
  const checkAt = source.indexOf("runStartupEnvCheck()");
  const observabilityAt = source.indexOf("inspectObservabilityCapability");
  assert.ok(checkAt >= 0 && checkAt < observabilityAt, "the env check must run before anything else warms");
});

test("no token family inlines the dev-fallback secret any more (sweep)", () => {
  // Eleven call sites (CSRF, magic links, password reset, email verification,
  // OAuth state ×4, connection confirmations, inbox media) used to inline
  // `process.env.PORTAL_SESSION_SECRET ?? "dev-secret-do-not-use-in-prod"`,
  // which meant a secretless production signed FORGEABLE tokens in every one
  // of those families. They must all resolve through the fail-closed
  // resolveSigningSecret() (or their own production throw, like
  // metaMessaging.stateSecret). This sweep fails if the inline pattern comes
  // back anywhere outside sessionToken.ts itself.
  const { execSync } = require("node:child_process") as typeof import("node:child_process");
  const hits = execSync(
    `grep -rln 'PORTAL_SESSION_SECRET.*dev-secret-do-not-use-in-prod' "${join(ROOT, "src")}" || true`,
    { encoding: "utf8" },
  ).trim().split("\n").filter(Boolean).filter(file => !file.endsWith("sessionToken.ts"));
  assert.deepEqual(hits, [], `inline dev-fallback secret reintroduced in: ${hits.join(", ")}`);
});

// ─── 3. Proxy: production is always strict ─────────────────────────────────

test("portal security is unconditionally strict in production", () => {
  assert.equal(isPortalSecurityStrict("production", undefined), true);
  assert.equal(isPortalSecurityStrict("production", "off"), true);
  assert.equal(isPortalSecurityStrict("production", "false"), true);
  assert.equal(isPortalSecurityStrict("production", "strict"), true);
});

test("development keeps the opt-in behaviour", () => {
  assert.equal(isPortalSecurityStrict("development", undefined), false);
  assert.equal(isPortalSecurityStrict("development", "strict"), true);
  assert.equal(isPortalSecurityStrict("development", "true"), true);
  assert.equal(isPortalSecurityStrict("test", undefined), false);
});

// ─── 4. Security control plane (memory backend) ────────────────────────────

function decodePayload(token: string): SessionPayload {
  return JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8")) as SessionPayload;
}

function mintPayload(userId: string, agencyId: string): SessionPayload {
  return decodePayload(issueSession({
    userId,
    email: `${userId}@example.test`,
    role: "agency-owner",
    agencyId,
    agencyIds: [agencyId],
    activeAgencyId: agencyId,
    sessionRev: 0,
    accessRev: 0,
  }));
}

test("issued sessions carry a session id and epoch stamps", () => {
  const payload = mintPayload("usr_epoch_a", "agency-alpha");
  assert.ok(payload.sid && payload.sid.length >= 16, "sid stamped");
  assert.ok(payload.se && typeof payload.se.g === "number", "epoch stamps present");
  assert.equal(enforceSessionSecurity(payload).ok, true, "fresh session passes the gate");
});

test("a user epoch bump refuses that user's sessions and nobody else's", () => {
  const victim = mintPayload("usr_epoch_victim", "agency-alpha");
  const bystander = mintPayload("usr_epoch_bystander", "agency-alpha");
  bumpUserSecurityEpoch("usr_epoch_victim", "test", "compromise drill");
  const refused = enforceSessionSecurity(victim);
  assert.deepEqual(refused, { ok: false, reason: "user-epoch" });
  assert.equal(enforceSessionSecurity(bystander).ok, true, "other users unaffected");
  const reissued = mintPayload("usr_epoch_victim", "agency-alpha");
  assert.equal(enforceSessionSecurity(reissued).ok, true, "re-issued session carries the new epoch");
});

test("a tenant epoch bump refuses that tenant's sessions and preserves other tenants", () => {
  const tenantA = mintPayload("usr_tenant_a", "agency-lockdown");
  const tenantB = mintPayload("usr_tenant_b", "agency-untouched");
  bumpTenantSecurityEpoch("agency-lockdown", "test", "tenant containment drill");
  assert.deepEqual(enforceSessionSecurity(tenantA), { ok: false, reason: "tenant-epoch" });
  assert.equal(enforceSessionSecurity(tenantB).ok, true, "unaffected tenant keeps working");
});

test("legacy cookies (no stamps) die on the first relevant bump", () => {
  const legacy = {
    userId: "usr_legacy", email: "l@x", role: "agency-owner", agencyId: "agency-legacy",
    sessionRev: 0, iat: 0, exp: 4102444800,
  } as SessionPayload;
  assert.equal(enforceSessionSecurity(legacy).ok, true, "legacy passes while epochs are zero");
  bumpTenantSecurityEpoch("agency-legacy", "test", "legacy invalidation");
  assert.deepEqual(enforceSessionSecurity(legacy), { ok: false, reason: "tenant-epoch" });
});

test("suspension refuses every request centrally and lifts cleanly", () => {
  const payload = mintPayload("usr_suspended", "agency-alpha");
  suspendUser("usr_suspended", "test", "incident");
  assert.deepEqual(enforceSessionSecurity(payload), { ok: false, reason: "suspended" });
  unsuspendUser("usr_suspended", "test");
  assert.equal(enforceSessionSecurity(payload).ok, true);
});

test("an individual session can be revoked without touching the user's other devices", () => {
  const sidOne = newSessionId();
  const sidTwo = newSessionId();
  const base = { userId: "usr_devices", agencyId: "agency-alpha", role: "agency-owner" as const };
  recordIssuedSession({ ...base, sid: sidOne }, { issuedVia: "login", ip: "203.0.113.5", userAgent: "device-one" });
  recordIssuedSession({ ...base, sid: sidTwo }, { issuedVia: "login", userAgent: "device-two" });
  assert.equal(listUserSessions("usr_devices").length, 2);

  const stamped = mintPayload("usr_devices", "agency-alpha");
  const one = { ...stamped, sid: sidOne };
  const two = { ...stamped, sid: sidTwo };
  assert.equal(revokeSession(sidOne, "test", "stolen laptop"), true);
  assert.deepEqual(enforceSessionSecurity(one), { ok: false, reason: "session-revoked" });
  assert.equal(enforceSessionSecurity(two).ok, true, "the other device keeps working");
});

test("revoke-all covers recorded sessions AND unrecorded legacy cookies", () => {
  const sid = newSessionId();
  recordIssuedSession({ sid, userId: "usr_burned", agencyId: "agency-alpha", role: "agency-owner" }, { issuedVia: "login" });
  const recorded = { ...mintPayload("usr_burned", "agency-alpha"), sid };
  const unrecorded = mintPayload("usr_burned", "agency-alpha"); // sid never registered
  const count = revokeAllUserSessions("usr_burned", "test", "account takeover");
  assert.ok(count >= 1, "recorded sessions revoked");
  assert.equal(enforceSessionSecurity(recorded).ok, false, "recorded session refused");
  assert.equal(enforceSessionSecurity(unrecorded).ok, false, "unrecorded session refused via the epoch layer");
});

test("a global epoch bump refuses everything issued before it", () => {
  const before = mintPayload("usr_global_a", "agency-alpha");
  bumpGlobalSecurityEpoch("test", "global incident drill");
  assert.deepEqual(enforceSessionSecurity(before), { ok: false, reason: "global-epoch" });
  const after = mintPayload("usr_global_a", "agency-alpha");
  assert.equal(enforceSessionSecurity(after).ok, true, "new sessions carry the new epoch");
});
