// T1 R030 smoke — basic observability.
// Run via `npm run smoke:observability` (tsx --test, react-server condition).
//
// Three surfaces:
//   - Pure runtime: requestLog formatter + skip rules (no server-only).
//   - Behavioural (#132): the mounted server boundary (src/instrumentation.ts)
//     actually reports through captureError, and the capability probe refuses
//     to call monitoring ready from a DSN string alone.
//   - Source-marker: /healthz/full route + app/error.tsx copy.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatRequestLog,
  shouldSkipRequestLog,
} from "../src/lib/server/requestLog";
import {
  describeRequestError,
  onRequestError,
  register,
} from "../src/instrumentation";
import {
  hasObservabilityDsn,
  inspectObservabilityCapability,
  isSentrySdkInstalled,
} from "../src/lib/server/observabilityCapability";
import {
  isExpectedFrameworkControlFlow,
  resolveSentryDsn,
} from "../src/lib/server/observability";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const HEALTHZ_FULL = join(ROOT, "src", "app", "healthz", "full", "route.ts");
// The deep DB probe was promoted out of the route into the shared
// databaseStorageHealth() (radar upgrade Stage 4); the route now delegates to it.
const DB_HEALTH = join(ROOT, "src", "lib", "server", "databaseStorageHealth.ts");
const ERROR_TSX = join(ROOT, "src", "app", "error.tsx");
const GLOBAL_ERROR_TSX = join(ROOT, "src", "app", "global-error.tsx");
const OBS = join(ROOT, "src", "lib", "server", "observability.ts");

/**
 * Source with comments removed. The boundary files explain themselves at
 * length, and every one of those explanations names the identifiers the
 * contracts below look for — `retry`, `digest`, `console.error`, `globals.css`.
 * Asserting against the raw file would therefore pass on prose alone, so the
 * markers are matched against the code only.
 */
function codeOnly(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, "");
}
const REQ_LOG = join(ROOT, "src", "lib", "server", "requestLog.ts");

describe("Observability — request log formatter (R030)", () => {
  it("emits flat JSON with required keys", () => {
    const line = formatRequestLog(
      { method: "GET", path: "/portal/agency", status: 200, durationMs: 42 },
      1234,
    );
    const parsed = JSON.parse(line);
    assert.equal(parsed.t, "req");
    assert.equal(parsed.ts, 1234);
    assert.equal(parsed.method, "GET");
    assert.equal(parsed.path, "/portal/agency");
    assert.equal(parsed.status, 200);
    assert.equal(parsed.durationMs, 42);
  });

  it("includes optional tenancy fields when set", () => {
    const line = formatRequestLog({
      method: "post", path: "/api/x", status: 201, durationMs: 12,
      userId: "usr_1", agencyId: "ag_1", clientId: "cl_1",
    });
    const parsed = JSON.parse(line);
    assert.equal(parsed.method, "POST", "method uppercased");
    assert.equal(parsed.userId, "usr_1");
    assert.equal(parsed.agencyId, "ag_1");
    assert.equal(parsed.clientId, "cl_1");
  });

  it("omits tenancy keys when undefined (no nulls leaking through)", () => {
    const line = formatRequestLog({ method: "GET", path: "/x", status: 200, durationMs: 1 });
    const parsed = JSON.parse(line);
    assert.equal("userId" in parsed, false);
    assert.equal("agencyId" in parsed, false);
  });

  it("flattens extras onto the top-level payload", () => {
    const line = formatRequestLog({
      method: "GET", path: "/x", status: 200, durationMs: 1,
      extra: { region: "iad1", cached: true },
    });
    const parsed = JSON.parse(line);
    assert.equal(parsed.region, "iad1");
    assert.equal(parsed.cached, true);
  });
});

describe("Observability — skip rules (R030)", () => {
  it("skips /healthz + /healthz/full", () => {
    assert.equal(shouldSkipRequestLog("/healthz"), true);
    assert.equal(shouldSkipRequestLog("/healthz/full"), true);
  });

  it("skips /_next + /favicon.ico + asset suffixes", () => {
    assert.equal(shouldSkipRequestLog("/_next/static/chunks/main.js"), true);
    assert.equal(shouldSkipRequestLog("/favicon.ico"), true);
    assert.equal(shouldSkipRequestLog("/some/path.css"), true);
    assert.equal(shouldSkipRequestLog("/img/hero.webp"), true);
    assert.equal(shouldSkipRequestLog("/fonts/inter.woff2"), true);
  });

  it("does NOT skip portal / api routes", () => {
    assert.equal(shouldSkipRequestLog("/portal/agency"), false);
    assert.equal(shouldSkipRequestLog("/api/auth/login"), false);
    assert.equal(shouldSkipRequestLog("/healthz-but-not-really"), false);
  });
});

describe("Observability — /healthz/full route (R030, source-marker)", () => {
  it("file exists + GET returns 200/503 based on DB probe", () => {
    assert.equal(existsSync(HEALTHZ_FULL), true);
    const src = readFileSync(HEALTHZ_FULL, "utf8");
    assert.ok(src.includes("export async function GET"));
    // The route delegates the probe to the shared databaseStorageHealth().
    assert.ok(src.includes("databaseStorageHealth"));
    assert.ok(src.includes('"connected"'));
    assert.ok(src.includes('"down"'));
    assert.ok(src.includes('"untested"'));
    assert.ok(src.includes("const ok = probe.ok && (!isLiveProduction || readiness.ready)"));
    assert.ok(src.includes("status: ok ? 200 : 503"));
  });

  it("supports Postgres, Supabase, and an honest untested branch", () => {
    // These branches now live in the promoted, shared probe (used by both
    // healthz/full and Radar's Infra sweep).
    const src = readFileSync(DB_HEALTH, "utf8");
    assert.ok(src.includes('SELECT 1'));
    assert.ok(src.includes('"postgres"'));
    assert.ok(src.includes('"supabase"'));
    assert.ok(src.includes('from("app_datastores")'));
    assert.ok(src.match(/status:\s*"untested"/));
  });

  it("reports plugins count + uptime + sha + env", () => {
    const src = readFileSync(HEALTHZ_FULL, "utf8");
    assert.ok(src.includes("pluginInstalls"));
    assert.ok(src.includes("BOOT_AT"));
    assert.ok(src.includes("VERCEL_GIT_COMMIT_SHA"));
  });
});

describe("Observability — app/error.tsx wires Sentry (R030)", () => {
  it("error boundary exists + reports the digest and reset action", () => {
    assert.equal(existsSync(ERROR_TSX), true);
    const src = readFileSync(ERROR_TSX, "utf8");
    assert.ok(src.startsWith('"use client"'));
    assert.ok(src.includes("console.error"));
    assert.ok(src.includes("digest"));
    assert.ok(src.includes("reset"));
  });

  // #132: the boundary used to promise "We've logged the issue" after a bare
  // console.error. A browser-only render error still reaches no sink, so the
  // copy must branch on whether the failure actually came from the server.
  it("never claims a report it did not make", () => {
    const src = readFileSync(ERROR_TSX, "utf8");
    assert.equal(
      /logged the issue/i.test(src),
      false,
      "error.tsx must not claim the issue was logged when nothing captured it",
    );
    assert.ok(
      src.includes("describeErrorReporting"),
      "the reporting claim must be derived from the digest, not hard-coded copy",
    );
    assert.ok(src.includes("recorded this failure in the deployment logs"));
    assert.ok(src.includes("was not sent anywhere automatically"));
  });

  // #141: error.tsx used to call itself the "Top-level error boundary" and
  // export `GlobalError`, which is what let the missing root boundary go
  // unnoticed for so long. A React error boundary never wraps the layout
  // above it, so this file is segment-level and must say so.
  it("does not claim to be the root/global boundary", () => {
    const src = readFileSync(ERROR_TSX, "utf8");
    assert.equal(
      /Top-level error boundary/i.test(src),
      false,
      "error.tsx is a route-segment boundary; calling itself top-level hid the missing global-error.tsx",
    );
    assert.equal(
      /function GlobalError\b/.test(src),
      false,
      "the GlobalError name belongs to src/app/global-error.tsx, not to the segment boundary",
    );
    assert.ok(
      src.includes("global-error.tsx"),
      "error.tsx must point at the boundary that does catch root-layout failures",
    );
  });
});

// ─── #141: the root-layout boundary actually exists ────────────────────

describe("Observability — app/global-error.tsx is the root boundary (#141)", () => {
  it("exists as a client component (Next's builtin fallback no longer serves root failures)", () => {
    assert.equal(
      existsSync(GLOBAL_ERROR_TSX),
      true,
      "without src/app/global-error.tsx Next serves its own unbranded builtin document for root-layout failures",
    );
    const src = readFileSync(GLOBAL_ERROR_TSX, "utf8");
    assert.ok(src.startsWith('"use client"'), "error boundaries must be Client Components");
    assert.ok(/export default function \w+\(/.test(src), "the convention needs a default export");
  });

  // The file REPLACES the root layout when active, so the convention requires
  // it to render its own document. Omitting these renders nothing at all.
  it("renders its own <html>/<body> and does not depend on the root layout's styling", () => {
    const src = readFileSync(GLOBAL_ERROR_TSX, "utf8");
    assert.ok(src.includes("<html"), "global-error must define its own <html> tag");
    assert.ok(src.includes("<body"), "global-error must define its own <body> tag");
    // Comments name globals.css on purpose, so read the code only.
    const code = codeOnly(GLOBAL_ERROR_TSX);
    assert.equal(
      /globals\.css|className=/.test(code),
      false,
      "global styles/Tailwind may be exactly what failed — global-error must be inline-styled and self-contained",
    );
  });

  it("reports the digest and offers both a retry and a hard escape", () => {
    const code = codeOnly(GLOBAL_ERROR_TSX);
    assert.match(
      code,
      /console\.error\([^)]*error\.digest/,
      "the browser-side log must carry the digest — it is the only reference the user can quote",
    );
    assert.match(
      code,
      /\{\s*error\.digest\s*&&/,
      "the rendered fallback must show the digest, not only log it",
    );
    assert.match(code, /\bretry\b/, "Next 16 hands the root boundary a retry()");
    assert.match(
      code,
      /window\.location\.assign\(\s*["']\//,
      "the router shell is part of what failed, so the escape must be a hard document load",
    );
  });

  // Same honesty contract as the segment boundary, from the same helper: a
  // browser-only failure reached no sink, and the copy must not pretend it did.
  it("never claims a report it did not make", () => {
    const code = codeOnly(GLOBAL_ERROR_TSX);
    assert.match(
      code,
      /describeErrorReporting\(\s*error\.digest\s*\)/,
      "both boundaries must derive the reporting claim from the one shared helper, keyed on the digest",
    );
    // A forked copy of either sentence would drift away from error.tsx the
    // first time the honesty copy is corrected, so neither may be inlined here.
    const errorTsx = readFileSync(ERROR_TSX, "utf8");
    for (const claim of [
      "recorded this failure in the deployment logs",
      "was not sent anywhere automatically",
    ]) {
      assert.ok(errorTsx.includes(claim), `error.tsx no longer carries the "${claim}" branch`);
      assert.equal(
        code.includes(claim),
        false,
        "global-error.tsx must not fork the honesty copy — it has to come from describeErrorReporting()",
      );
    }
  });

  // It runs in the browser bundle; observability.ts is server-only and would
  // break the build (and leak the server graph) if pulled in here.
  it("does not import the server-only observability module", () => {
    const src = readFileSync(GLOBAL_ERROR_TSX, "utf8");
    assert.equal(
      /from\s+["'][^"']*server\/observability["']/.test(src),
      false,
      "src/lib/server/observability.ts is server-only and must not reach the client bundle",
    );
  });
});

// ─── #132: the server boundary is genuinely mounted ────────────────────

describe("Observability — src/instrumentation.ts is the mounted server boundary (#132)", () => {
  it("derives route, method and client tenancy from a failed request", () => {
    const crumb = describeRequestError(
      { path: "/api/portal/clients/acme-ltd/invoices?draft=1", method: "POST" },
      { routePath: "/api/portal/clients/[clientId]/invoices", routeType: "route", routerKind: "App Router" },
    );
    assert.equal(crumb.clientId, "acme-ltd");
    assert.equal(crumb.extra.route, "/api/portal/clients/[clientId]/invoices");
    assert.equal(crumb.extra.path, "/api/portal/clients/acme-ltd/invoices?draft=1");
    assert.equal(crumb.extra.method, "POST");
    assert.equal(crumb.extra.routeType, "route");
  });

  it("does not invent a tenant it cannot read, and keeps the portal scope", () => {
    const crumb = describeRequestError(
      { path: "/portal/agency/settings", method: "GET" },
      { routePath: "/portal/agency/settings", routeType: "render", renderSource: "server-rendering" },
    );
    assert.equal(crumb.clientId, undefined);
    assert.equal(crumb.agencyId, undefined);
    assert.equal(crumb.extra.portalScope, "agency");
    assert.equal(crumb.extra.renderSource, "server-rendering");
  });

  it("reports a caught server error through captureError (not a bare rethrow)", async () => {
    const previousEnv = process.env.NODE_ENV;
    const previousDsn = process.env.SENTRY_DSN;
    const errors: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => { errors.push(args); };
    try {
      delete process.env.SENTRY_DSN;
      process.env.NODE_ENV = "development";
      // Awaited on purpose: Next awaits this callback so the queued Sentry
      // event is flushed before a serverless runtime freezes the function.
      await onRequestError(
        new Error("boom from a route handler"),
        { path: "/api/portal/clients/acme-ltd/invoices", method: "POST", headers: {} },
        {
          routerKind: "App Router",
          routePath: "/api/portal/clients/[clientId]/invoices",
          routeType: "route",
          revalidateReason: undefined,
        },
      );
    } finally {
      console.error = originalError;
      if (previousEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousEnv;
      if (previousDsn === undefined) delete process.env.SENTRY_DSN;
      else process.env.SENTRY_DSN = previousDsn;
    }
    const captured = errors.find(args => args[0] === "[observability]");
    assert.ok(captured, "onRequestError must route the error into observability.captureError");
    assert.equal((captured?.[1] as Error).message, "boom from a route handler");
  });

  it("does not report Next's successful dynamic-render control flow as an app failure", async () => {
    const errors: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => { errors.push(args); };
    const controlFlow = Object.assign(new Error("Dynamic server usage"), {
      digest: "DYNAMIC_SERVER_USAGE",
    });
    try {
      assert.equal(isExpectedFrameworkControlFlow(controlFlow), true);
      assert.equal(isExpectedFrameworkControlFlow(new Error("real failure")), false);
      await onRequestError(
        controlFlow,
        { path: "/milesymedia/contact", method: "GET", headers: {} },
        {
          routerKind: "App Router",
          routePath: "/milesymedia/contact",
          routeType: "render",
          revalidateReason: undefined,
        },
      );
    } finally {
      console.error = originalError;
    }
    assert.equal(errors.some(args => args[0] === "[observability]"), false);
  });

  it("register() warns at boot when a DSN is set but nothing can deliver", async () => {
    const previousEnv = process.env.NODE_ENV;
    const previousDsn = process.env.SENTRY_DSN;
    const warnings: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => { warnings.push(args); };
    try {
      process.env.NODE_ENV = "development";
      process.env.SENTRY_DSN = "https://public@o0.ingest.sentry.io/0";
      // `register` is async since the capability probe became a Node-only
      // dynamic import (it must not reach the Edge bundle). Awaiting it is the
      // difference between observing the warning and racing past it.
      await register();
    } finally {
      console.warn = originalWarn;
      if (previousEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousEnv;
      if (previousDsn === undefined) delete process.env.SENTRY_DSN;
      else process.env.SENTRY_DSN = previousDsn;
    }
    if (isSentrySdkInstalled()) {
      // Once the optional SDK is installed there is nothing to warn about.
      assert.equal(warnings.some(args => String(args[0]).includes("is not installed")), false);
      return;
    }
    assert.ok(
      warnings.some(args => String(args[0]).includes("@sentry/nextjs is not installed")),
      "a DSN without the SDK must be announced, not silently swallowed",
    );
  });
});

describe("Observability — capability probe, not an environment string (#132)", () => {
  const DSN = { SENTRY_DSN: "https://public@o0.ingest.sentry.io/0" } as NodeJS.ProcessEnv;

  it("refuses to report ready when the DSN is set but the SDK is missing", () => {
    const capability = inspectObservabilityCapability(DSN, false);
    assert.equal(capability.dsnConfigured, true);
    assert.equal(capability.sdkState, "missing");
    assert.equal(capability.capturing, false);
    assert.equal(capability.status, "needs-setup");
    assert.ok(capability.summary.includes("no error is delivered"));
    assert.notEqual(capability.action, "No action needed.");
  });

  it("reports ready only when a DSN and the SDK are both present", () => {
    const capability = inspectObservabilityCapability(DSN, true);
    assert.equal(capability.capturing, true);
    assert.equal(capability.status, "ready");
  });

  it("stays optional — and honest about deployment logs — with no DSN", () => {
    const capability = inspectObservabilityCapability({}, false);
    assert.equal(capability.dsnConfigured, false);
    assert.equal(capability.status, "optional");
    assert.ok(capability.summary.includes("deployment logs"));
    assert.notEqual(capability.action, "No action needed.");
  });

  // The capability probe is only honest while it inspects the same DSN keys the
  // server loader initialises Sentry with. Reading NEXT_PUBLIC_SENTRY_DSN here
  // but only SENTRY_DSN there made the checklist say "captured and reported to
  // Sentry" for a deployment whose loader bailed out before importing anything.
  it("inspects the same DSN keys the server loader actually uses", () => {
    for (const env of [
      { SENTRY_DSN: "https://public@o0.ingest.sentry.io/0" },
      { NEXT_PUBLIC_SENTRY_DSN: "https://public@o0.ingest.sentry.io/0" },
      { SENTRY_DSN: "   " },
      {},
    ] as NodeJS.ProcessEnv[]) {
      assert.equal(
        hasObservabilityDsn(env),
        resolveSentryDsn(env) !== null,
        `capability probe and Sentry loader disagree for ${JSON.stringify(env)}`,
      );
    }
  });

  it("matches the repository's real dependency state", () => {
    // Documents today's truth: @sentry/nextjs is not installed, so a DSN
    // alone can never make this repository report captured errors.
    assert.equal(isSentrySdkInstalled(), existsSync(join(ROOT, "node_modules", "@sentry", "nextjs")));
  });
});

describe("Observability — Sentry lazy-load is no-throw without DSN (R030)", () => {
  it("observability.ts lazy-imports @sentry/nextjs + warns when missing", () => {
    const src = readFileSync(OBS, "utf8");
    assert.ok(src.includes('"@sentry/nextjs"'));
    assert.ok(src.includes("not installed"));
    assert.ok(src.includes("export function captureError"));
    assert.ok(src.includes("export function recordBreadcrumb"));
  });

  // src/instrumentation.ts put observability.ts inside the Next server build
  // graph for the first time. A literal `import("@sentry/nextjs")` is resolved
  // by webpack at build time, so while the optional package is uninstalled it
  // fails `next build` outright with "Module not found". The specifier must stay
  // opaque to the bundler for the optional-dependency contract to survive.
  it("keeps the optional Sentry import opaque to the bundler (#132)", () => {
    // Comments quote the broken form on purpose, so read the code only.
    const code = readFileSync(OBS, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^\s*\/\/.*$/gm, "");
    const src = readFileSync(OBS, "utf8");
    assert.equal(
      /import\(\s*["'`]@sentry\/nextjs/.test(code),
      false,
      "a literal dynamic-import specifier makes next build fail while @sentry/nextjs is uninstalled",
    );
    assert.ok(src.includes("webpackIgnore"), "webpack must be told to leave the specifier alone");
    assert.ok(src.includes("turbopackIgnore"), "turbopack must be told to leave the specifier alone");
  });

  it("requestLog.ts skips emit when NODE_ENV=test (smoke runs quiet)", () => {
    const src = readFileSync(REQ_LOG, "utf8");
    assert.ok(src.includes('process.env.NODE_ENV === "test"'));
  });
});
