// T1 R029 smoke — env secrets policy.
// Run via `npm run smoke:env-secrets` (tsx --test).
//
// env.ts deliberately omits `server-only` so the smoke can drive
// every branch under tsx. secrets.ts has the shim — covered via
// source-marker.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ENV_ALLOWLIST,
  inspectEnv,
  optionalEnv,
  requireEnv,
  runStartupEnvCheck,
} from "../src/lib/server/env";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ENV_EXAMPLE = join(ROOT, ".env.example");
const SECRETS = join(ROOT, "src", "lib", "server", "secrets.ts");

const PROD_REQUIRED_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  PORTAL_SESSION_SECRET: "x".repeat(48),
  DATABASE_URL: "postgres://user:pass@host/db",
  NEXT_PUBLIC_PORTAL_BASE_URL: "https://milesymedia.com",
  NEXT_PUBLIC_PORTAL_SECURITY: "strict",
  FOUNDER_EMAIL: "ed@example.com",
  FOUNDER_PASSWORD: "x".repeat(16),
};

describe("Env secrets — requireEnv (R029)", () => {
  it("throws in production when missing", () => {
    const orig = { node: process.env.NODE_ENV, secret: process.env.PORTAL_SESSION_SECRET };
    (process.env as Record<string, string>).NODE_ENV = "production";
    delete process.env.PORTAL_SESSION_SECRET;
    try {
      assert.throws(() => requireEnv("PORTAL_SESSION_SECRET"), /required but not set/);
    } finally {
      (process.env as Record<string, string>).NODE_ENV = orig.node;
      if (orig.secret !== undefined) process.env.PORTAL_SESSION_SECRET = orig.secret;
    }
  });

  it("returns undefined in dev when missing (no throw)", () => {
    const orig = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = "development";
    delete process.env.SOME_NOT_SET_VAR;
    try {
      const v = requireEnv("SOME_NOT_SET_VAR");
      assert.equal(v, undefined);
    } finally {
      (process.env as Record<string, string>).NODE_ENV = orig;
    }
  });

  it("returns the value when set", () => {
    process.env.MM_TEST_VAR = "hello";
    try {
      assert.equal(requireEnv("MM_TEST_VAR"), "hello");
    } finally {
      delete process.env.MM_TEST_VAR;
    }
  });

  it("alwaysRequired throws even in dev", () => {
    const orig = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = "development";
    delete process.env.MM_NOT_SET;
    try {
      assert.throws(() => requireEnv("MM_NOT_SET", { alwaysRequired: true }));
    } finally {
      (process.env as Record<string, string>).NODE_ENV = orig;
    }
  });
});

describe("Env secrets — optionalEnv (R029)", () => {
  it("returns fallback when unset", () => {
    delete process.env.MM_NOT_SET2;
    assert.equal(optionalEnv("MM_NOT_SET2", "default"), "default");
  });

  it("returns the value when set", () => {
    process.env.MM_TEST_VAR2 = "actual";
    try {
      assert.equal(optionalEnv("MM_TEST_VAR2", "default"), "actual");
    } finally {
      delete process.env.MM_TEST_VAR2;
    }
  });

  it("treats empty-string as unset (returns fallback)", () => {
    process.env.MM_TEST_VAR3 = "";
    try {
      assert.equal(optionalEnv("MM_TEST_VAR3", "default"), "default");
    } finally {
      delete process.env.MM_TEST_VAR3;
    }
  });
});

describe("Env secrets — inspectEnv issues (R029)", () => {
  it("clean prod env produces no issues", () => {
    const issues = inspectEnv(PROD_REQUIRED_ENV);
    assert.equal(issues.length, 0, "expected no issues; got: " + JSON.stringify(issues));
  });

  it("missing PORTAL_SESSION_SECRET in prod is an error", () => {
    const env = { ...PROD_REQUIRED_ENV, PORTAL_SESSION_SECRET: undefined } as NodeJS.ProcessEnv;
    delete env.PORTAL_SESSION_SECRET;
    const issues = inspectEnv(env);
    const e = issues.find(i => i.name === "PORTAL_SESSION_SECRET");
    assert.ok(e);
    assert.equal(e!.severity, "error");
  });

  it("PORTAL_SESSION_SECRET shorter than 32 chars flagged", () => {
    const env = { ...PROD_REQUIRED_ENV, PORTAL_SESSION_SECRET: "short" };
    const issues = inspectEnv(env);
    const e = issues.find(i => i.name === "PORTAL_SESSION_SECRET" && i.reason.includes("≥32"));
    assert.ok(e, "expected length-check issue");
  });

  it("FOUNDER_PASSWORD shorter than 12 chars flagged", () => {
    const env = { ...PROD_REQUIRED_ENV, FOUNDER_PASSWORD: "short" };
    const issues = inspectEnv(env);
    const e = issues.find(i => i.name === "FOUNDER_PASSWORD" && i.reason.includes("≥12"));
    assert.ok(e);
  });

  it("dev-default FOUNDER_EMAIL flagged as example sentinel", () => {
    const env = { ...PROD_REQUIRED_ENV, FOUNDER_EMAIL: "edwardhallam07@gmail.com" };
    const issues = inspectEnv(env);
    const e = issues.find(i => i.name === "FOUNDER_EMAIL" && i.reason.includes("sentinel"));
    assert.ok(e);
  });

  it("NEXT_PUBLIC_PORTAL_SECURITY != strict in prod is an error", () => {
    const env = { ...PROD_REQUIRED_ENV, NEXT_PUBLIC_PORTAL_SECURITY: "relaxed" };
    const issues = inspectEnv(env);
    const e = issues.find(i => i.name === "NEXT_PUBLIC_PORTAL_SECURITY");
    assert.ok(e);
    assert.equal(e!.severity, "error");
  });

  it("dev mode downgrades missing-required errors to warns", () => {
    const env = { NODE_ENV: "development" } as NodeJS.ProcessEnv;
    const issues = inspectEnv(env);
    const errors = issues.filter(i => i.severity === "error");
    assert.equal(errors.length, 0, "dev should never produce errors");
    assert.ok(issues.length > 0, "should still flag missing as warns");
  });

  it("typo guard — unknown PORTAL_-prefixed key warns w/ closest match suggestion", () => {
    const env = { ...PROD_REQUIRED_ENV, PORTAL_SESION_SECRET: "typo-here" };
    const issues = inspectEnv(env);
    const typo = issues.find(i => i.name === "PORTAL_SESION_SECRET");
    assert.ok(typo);
    assert.equal(typo!.severity, "warn");
    assert.ok(typo!.reason.includes("closest:"));
  });
});

describe("Env secrets — runStartupEnvCheck (R029)", () => {
  it("throws in production with missing required vars", () => {
    const env = { NODE_ENV: "production" } as NodeJS.ProcessEnv;
    assert.throws(() => runStartupEnvCheck(env), /startup self-check failed/);
  });

  it("does not throw in dev (just warns)", () => {
    const env = { NODE_ENV: "test" } as NodeJS.ProcessEnv;
    // NODE_ENV=test silences the warn channel too.
    const issues = runStartupEnvCheck(env);
    assert.ok(Array.isArray(issues));
    assert.ok(issues.every(i => i.severity === "warn" || i.severity === "error"));
  });

  it("clean production env returns empty issues + no throw", () => {
    const issues = runStartupEnvCheck(PROD_REQUIRED_ENV);
    assert.deepEqual(issues, []);
  });
});

describe("Env secrets — ENV_ALLOWLIST (R029)", () => {
  it("includes every PRODUCTION_REQUIRED key", () => {
    const required = [
      "PORTAL_SESSION_SECRET",
      "DATABASE_URL",
      "NEXT_PUBLIC_PORTAL_BASE_URL",
      "NEXT_PUBLIC_PORTAL_SECURITY",
      "FOUNDER_EMAIL",
      "FOUNDER_PASSWORD",
    ];
    for (const k of required) {
      assert.ok(ENV_ALLOWLIST.includes(k), `missing ${k} from allowlist`);
    }
  });

  it("includes the FOUNDER_AGENCY_NAME + Sentry + Vercel keys", () => {
    for (const k of ["FOUNDER_AGENCY_NAME", "SENTRY_DSN", "VERCEL_TOKEN"]) {
      assert.ok(ENV_ALLOWLIST.includes(k), `missing ${k}`);
    }
  });
});

describe("Env secrets — secrets.ts typed accessors (R029, source-marker)", () => {
  it("exports sessionSecret / databaseUrl / portalBaseUrl / portalSecurity / founder*", () => {
    const src = readFileSync(SECRETS, "utf8");
    for (const name of [
      "export function sessionSecret",
      "export function databaseUrl",
      "export function portalBaseUrl",
      "export function portalSecurity",
      "export function founderEmail",
      "export function founderPassword",
      "export function founderAgencyName",
      "export function portalBackend",
      "export function devBypass",
      "export function sentryDsn",
    ]) {
      assert.ok(src.includes(name), `missing ${name}`);
    }
  });
});

describe("Env secrets — `.env.example` shape (R029)", () => {
  it("has all required keys + no real-looking secrets", () => {
    const env = readFileSync(ENV_EXAMPLE, "utf8");
    for (const k of ["PORTAL_SESSION_SECRET", "FOUNDER_EMAIL", "FOUNDER_PASSWORD"]) {
      assert.ok(env.includes(k), `missing ${k} in .env.example`);
    }
    // FOUNDER_PASSWORD must be present + empty (no default).
    assert.ok(env.match(/^FOUNDER_PASSWORD=\s*$/m));
    // PORTAL_SESSION_SECRET must be present + empty.
    assert.ok(env.match(/^PORTAL_SESSION_SECRET=\s*$/m));
  });
});
