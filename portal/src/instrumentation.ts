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

/** Path shapes that carry a tenant id we can attach without guessing. */
const CLIENT_SCOPE = /^\/(?:api\/)?portal\/clients\/([^/?#]+)/;
const AGENCY_SCOPE = /^\/(?:api\/)?portal\/(agency|dev-team|dev-workspace|team|freelancer|customer|account)(?:\/|$)/;

/**
 * Derive the observability breadcrumb for a failed server request. Pure and
 * exported so the contract (route, method, tenancy) is testable without a
 * live server.
 */
export function describeRequestError(
  request: { path: string; method: string },
  context: { routerKind?: string; routePath?: string; routeType?: string; renderSource?: string },
): ObservabilityBreadcrumb & { extra: Record<string, unknown> } {
  const path = request.path ?? "";
  const clientId = CLIENT_SCOPE.exec(path)?.[1];
  const agencyScope = AGENCY_SCOPE.exec(path)?.[1];

  const extra: Record<string, unknown> = {
    // `routePath` is the canonical pattern (e.g. /portal/clients/[clientId]);
    // `path` is what the visitor actually requested. Keep both — grouping
    // needs the pattern, reproduction needs the request.
    route: context.routePath ?? path,
    path,
    method: request.method,
    routeType: context.routeType,
    routerKind: context.routerKind,
  };
  if (context.renderSource) extra.renderSource = context.renderSource;
  if (agencyScope) extra.portalScope = agencyScope;

  return clientId ? { clientId, extra } : { extra };
}

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
}

/**
 * Every server-side error Next catches lands here. Reports through the real
 * observability path (deployment log always; Sentry when installed and
 * configured) with the route and tenant context attached.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
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
