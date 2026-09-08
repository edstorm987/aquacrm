// Next.js instrumentation hook — the single server-side observability
// mount point (issue #132).
//
// Before this file existed, `observability.ts` and its `captureError()` /
// `withApiObservability()` helpers had zero production callers: nothing in
// the app ever reported a server error anywhere except an ad-hoc
// `console.error`, while the launch checklist and the global error boundary
// both claimed monitoring was active.
//
// Next 16 calls `onRequestError` for every server-side error it catches —
// App Router renders, route handlers, server actions and the proxy layer
// (`node_modules/next/dist/server/instrumentation/types.d.ts`). Mounting
// here instruments all ~245 `route.ts` files plus every server render at
// once, instead of hand-wrapping each handler. `withApiObservability`
// remains available for individual routes that want their own label or a
// tenancy resolver.
//
// The Sentry SDK is optional: `captureError` always writes the trace to the
// deployment log and additionally reports to Sentry when `SENTRY_DSN` is set
// AND `@sentry/nextjs` is installed. Nothing here claims more than that.

import type { Instrumentation } from "next/types";
import {
  captureError,
  flushObservability,
  isExpectedFrameworkControlFlow,
  recordBreadcrumb,
  type ObservabilityBreadcrumb,
} from "@/lib/server/observability";
// NOT a static import. Next loads this file in BOTH the Node and Edge
// runtimes, and `observabilityCapability` resolves the optional Sentry package
// with `node:module` + `node:path`, neither of which exists on Edge. A static
// import therefore pulled Node builtins into the Edge instrumentation bundle,
// which failed to compile — and a broken edge bundle answers 404 for routes
// that are perfectly healthy in source (the browser matrix caught
// `/api/portal/chrome/layout` and both telephony endpoints 404ing across every
// viewport for exactly this reason). It is loaded below, on Node only.

/** Path shape that carries a tenant id we can attach without guessing. */
const CLIENT_SCOPE = /^\/(?:api\/)?portal\/clients\/([^/?#]+)/;

/**
 * Derive the observability breadcrumb for a failed server request. Pure and
 * exported so the contract (route, method, tenancy) is testable without a
 * live server.
 *
 * PRIVACY: this carries ONLY the canonical route PATTERN, the method and the
 * client route parameter (a tenancy id). It deliberately does NOT carry the raw
 * request path — which holds ids and query values — and never falls back to it
 * when Next supplies no pattern. The observability sanitiser
 * (`buildSafeErrorContext`) validates every field again before it can reach a
 * log or Sentry.
 */
export function describeRequestError(
  request: { path: string; method: string },
  context: { routerKind?: string; routePath?: string; routeType?: string; renderSource?: string },
): ObservabilityBreadcrumb & { extra: Record<string, unknown> } {
  const path = request.path ?? "";
  const clientId = CLIENT_SCOPE.exec(path)?.[1];

  const extra: Record<string, unknown> = {
    route: context.routePath, // pattern only; undefined (dropped) if Next has none
    method: request.method,
  };

  return clientId ? { clientId, extra } : { extra };
}

/**
 * Next uses this error as control flow while deciding that a route must be
 * rendered dynamically. The request is not failing, and reporting it would
 * turn every successful production build into a page of false alerts.
 */
/**
 * Called once per server runtime start. Warms the optional Sentry loader so
 * `init()` happens at boot rather than inside the first failing request, and
 * makes a mis-configured monitoring setup (DSN set, SDK absent) visible in
 * the boot log instead of silently swallowing every later capture.
 */
export async function register(): Promise<void> {
  // Edge has no `node:module`, so the capability probe cannot run there — and
  // must not even be bundled there. On Edge the breadcrumb still records, with
  // the capability reported as unknown rather than guessed at.
  //
  // The test is "is this EDGE", not "is this not nodejs". Next sets
  // NEXT_RUNTIME to "nodejs" or "edge"; OUTSIDE Next it is undefined, which a
  // `!== "nodejs"` check would have wrongly treated as Edge — skipping the
  // probe in every plain Node process, the smoke suite included, so a DSN set
  // without the SDK would have gone unannounced.
  if (process.env.NEXT_RUNTIME === "edge") {
    recordBreadcrumb("server.start", {
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
      sentry: "unknown-on-edge",
    });
    return;
  }

  // Everything below is Node-only and must be DEAD-CODE-ELIMINATED from the Edge
  // instrumentation bundle (#190). An early `return` on Edge is a *runtime* guard
  // only: webpack still compiles the code that follows it for the Edge layer, and
  // the radar probe scheduler statically reaches the plugin registry →
  // `emailSenderFoundation` → Nodemailer, whose bare `require('stream')` cannot
  // resolve for Edge — so `next dev --webpack` (the verification lane) failed to
  // compile. Wrapping the Node-only work in `process.env.NEXT_RUNTIME !== "edge"`
  // fixes it three ways at once, because Next inlines `NEXT_RUNTIME` per bundle:
  //   • Edge bundle:  `"edge" !== "edge"` → `if (false)` → webpack drops the whole
  //     block AND its dynamic imports, so the Node-only graph never compiles for Edge.
  //   • Node bundle:  `"nodejs" !== "edge"` → runs, exactly as before.
  //   • Plain Node (tests/scripts, NEXT_RUNTIME undefined): `undefined !== "edge"`
  //     → runs. A `=== "nodejs"` guard would wrongly SKIP these, silencing the
  //     observability probe the smoke suite exercises (see the note above).
  if (process.env.NEXT_RUNTIME !== "edge") {
    // FAIL-CLOSED BOOT (assume-breach containment, 2026-09-08). The startup
    // environment self-check existed since T1 R029 but had ZERO callers — the
    // "fail-closed boot" was dead code, so a production deploy with a missing
    // or dev-sentinel PORTAL_SESSION_SECRET, or portal security switched off,
    // booted and served. It now runs first, before anything else warms: in
    // production it THROWS (Next aborts the server start), in dev it warns.
    // Deliberately NOT wrapped in try/catch — a production boot with a broken
    // security environment must die, loudly.
    const { runStartupEnvCheck } = await import("@/lib/server/env");
    runStartupEnvCheck();

    const { inspectObservabilityCapability } = await import("@/lib/server/observabilityCapability");
    const capability = inspectObservabilityCapability();
    if (capability.dsnConfigured && !capability.capturing && process.env.NODE_ENV !== "test") {
      // eslint-disable-next-line no-console
      console.warn(`[observability] ${capability.summary} ${capability.action}`);
    }
    recordBreadcrumb("server.start", {
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
      sentry: capability.capturing ? "reporting" : "logs-only",
    });

    // Radar probe self-scheduler (issues #170). A no-op unless this is the single
    // persistent instance AND `RADAR_PROBE_INTERVAL_MINUTES` is set — so it stays
    // off in every serverless/build/test process. Its own errors must never break
    // the server boot, so it is isolated in its own try/catch.
    try {
      const { startProbeSchedulerIfEnabled } = await import("@/engines/data/server/radar/probeSchedule");
      startProbeSchedulerIfEnabled();
    } catch (error) {
      recordBreadcrumb("server.start", { radarProbeScheduler: `failed:${error instanceof Error ? error.message : String(error)}` });
    }
  }
}

/**
 * Every server-side error Next catches lands here. Reports through the real
 * observability path (deployment log always; Sentry when installed and
 * configured) with the route and tenant context attached.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (isExpectedFrameworkControlFlow(error)) return;
  captureError(error, describeRequestError(request, context));
  // `captureError` hands the event to Sentry on a later microtask and returns
  // immediately. On a serverless runtime the function can be frozen the moment
  // this callback resolves, so the queued event would never leave the process —
  // and the checklist would still be claiming it was "reported to Sentry". Next
  // awaits the promise we return, so flush here. `flushObservability` resolves
  // straight away (and never throws) when no DSN is set or the optional SDK is
  // absent, so the log-only path is unaffected.
  await flushObservability();
};
