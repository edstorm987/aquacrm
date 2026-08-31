// Observability capability probe (issue #132).
//
// A `SENTRY_DSN` string in the environment is NOT proof that anything
// reaches Sentry. `observability.ts` loads `@sentry/nextjs` lazily and
// treats it as an optional dependency: when the package is not installed
// the dynamic import fails, the loader warns once, and every capture
// silently becomes a no-op. Production readiness therefore has to report
// the *capability* (DSN + a loadable SDK), not the presence of an
// environment variable — otherwise "Error monitoring: ready" claims a
// delivery that never happens.
//
// This module deliberately carries no `server-only` marker, for the same
// reason `requestLog.ts` does not: `productionReadiness.ts` imports it and
// is itself driven from plain Node scripts (`scripts/launch-audit.ts`) and
// from smoke tests that run without the `react-server` condition.

import { createRequire } from "node:module";
import { join } from "node:path";

/** Whether the optional `@sentry/nextjs` package can actually be resolved. */
export type ObservabilitySdkState = "installed" | "missing";

export interface ObservabilityCapability {
  /** SENTRY_DSN or NEXT_PUBLIC_SENTRY_DSN is set. */
  dsnConfigured: boolean;
  sdkState: ObservabilitySdkState;
  /** True only when a DSN is set AND the SDK is installed. */
  capturing: boolean;
  /** Readiness status for the launch checklist. */
  status: "ready" | "needs-setup" | "optional";
  /** Honest one-line statement of what is (not) happening. */
  summary: string;
  /** How the gap is dealt with. Never "no action needed" while a gap exists. */
  action: string;
}

const SENTRY_PACKAGE = "@sentry/nextjs";

/**
 * Resolve the optional Sentry SDK without importing it. Returns false when
 * the package is absent — the conservative answer, and the one that makes
 * readiness ask for setup rather than claim delivery.
 */
let sdkResolution: boolean | null = null;

export function isSentrySdkInstalled(): boolean {
  // Memoised: `inspectProductionReadiness()` runs on every `/healthz/full`
  // request and on every agency-settings render, and a failing `resolve()`
  // walks (and throws from) the whole node_modules chain twice. Installing a
  // package requires a redeploy, so the answer cannot change under a live
  // process.
  if (sdkResolution !== null) return sdkResolution;
  const candidates: string[] = [];
  try {
    candidates.push(import.meta.url);
  } catch {
    /* no ESM meta in this compilation target — fall through to cwd */
  }
  candidates.push(join(process.cwd(), "package.json"));
  for (const from of candidates) {
    try {
      createRequire(from).resolve(SENTRY_PACKAGE);
      sdkResolution = true;
      return true;
    } catch {
      /* try the next anchor */
    }
  }
  sdkResolution = false;
  return false;
}

/**
 * Whether a DSN is configured at all. Exported so the smoke can pin that this
 * probe and `observability.resolveSentryDsn()` — the value the server loader
 * actually initialises Sentry with — read the same keys. If they diverge the
 * checklist starts claiming a delivery the loader never attempts.
 */
export function hasObservabilityDsn(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.SENTRY_DSN?.trim()) || Boolean(env.NEXT_PUBLIC_SENTRY_DSN?.trim());
}

const dsnOf = hasObservabilityDsn;

/**
 * Report whether externally reported error monitoring is genuinely wired.
 *
 * `sdkInstalled` is injectable so callers (and the smoke) can describe both
 * sides of the contract without touching the module resolver.
 */
export function inspectObservabilityCapability(
  env: NodeJS.ProcessEnv = process.env,
  sdkInstalled: boolean = isSentrySdkInstalled(),
): ObservabilityCapability {
  const dsnConfigured = dsnOf(env);
  const sdkState: ObservabilitySdkState = sdkInstalled ? "installed" : "missing";

  if (dsnConfigured && sdkInstalled) {
    return {
      dsnConfigured,
      sdkState,
      capturing: true,
      status: "ready",
      summary: "Server errors are captured and reported to Sentry.",
      action: "No action needed.",
    };
  }

  if (dsnConfigured) {
    return {
      dsnConfigured,
      sdkState,
      capturing: false,
      status: "needs-setup",
      summary: `A Sentry DSN is set but ${SENTRY_PACKAGE} is not installed, so no error is delivered to Sentry.`,
      action: `Install ${SENTRY_PACKAGE} and redeploy, or remove the DSN so the checklist stops implying external reporting.`,
    };
  }

  return {
    dsnConfigured,
    sdkState,
    capturing: false,
    status: "optional",
    summary: "Server errors are written to the deployment logs; no external error reporting is connected.",
    action: "Connect Sentry before launch for faster incident diagnosis.",
  };
}
