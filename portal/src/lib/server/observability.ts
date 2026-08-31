import "server-only";
// Server-side observability wrapper.
//
// Captures uncaught errors → Sentry. Records request-level metrics
// (duration, status code) on every API route via `withApiObservability`.
// Per-tenant breadcrumb tagging — every captured event picks up
// `agencyId` + `clientId` + `userId` + `pluginId` from the active
// scope.
//
// Sentry is loaded LAZILY via `import("@sentry/nextjs")`, gated on
// `process.env.SENTRY_DSN`. When the env is unset the dynamic import
// is skipped and every helper here is a no-op — no error if the npm
// dep isn't installed. Production deploys add `@sentry/nextjs` to
// `04-the-final-portal/portal/package.json` and set `SENTRY_DSN` +
// `SENTRY_ENVIRONMENT` in Vercel project env. See chapter
// `04-deployment-domains-observability.md` §"Observability wiring".
//
// Vercel Analytics is opt-in client-side via `@vercel/analytics` and
// lives outside this module — Vercel auto-injects scripts when the
// dashboard toggle is on; nothing to do here.
//
// MOUNT POINT: `src/instrumentation.ts` is the single server-side caller
// (Next's `onRequestError` covers every App Router render, route handler,
// server action and proxy error at once — see issue #132). Individual
// routes do not need `withApiObservability`; it stays available for the
// handlers that want per-route labels and tenancy resolution.

import { inspectObservabilityCapability } from "./observabilityCapability";

export {
  inspectObservabilityCapability,
  isSentrySdkInstalled,
  type ObservabilityCapability,
  type ObservabilitySdkState,
} from "./observabilityCapability";

// ─── Types ─────────────────────────────────────────────────────────────

export interface ObservabilityBreadcrumb {
  agencyId?: string;
  clientId?: string;
  userId?: string;
  pluginId?: string;
  /** Free-form extras the caller wants on the event payload. */
  extra?: Record<string, unknown>;
}

export type ApiHandler = (req: Request, ctx?: unknown) => Promise<Response>;

interface SentryShape {
  init?: (options: Record<string, unknown>) => void;
  captureException?: (e: unknown, hint?: { extra?: Record<string, unknown> }) => void;
  addBreadcrumb?: (b: { category?: string; message?: string; data?: Record<string, unknown> }) => void;
  setTag?: (key: string, value: string) => void;
  setUser?: (user: { id?: string } | null) => void;
  withScope?: (fn: (scope: SentryShape) => void) => void;
  setExtras?: (extras: Record<string, unknown>) => void;
}

// ─── Lazy Sentry loader ────────────────────────────────────────────────

let sentryPromise: Promise<SentryShape | null> | null = null;
let initialized = false;

/**
 * The DSN this module will actually initialise Sentry with.
 *
 * Both `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` count — they are the two keys
 * the launch checklist advertises (`productionReadiness.ts` → `envKeys`) and
 * the two `observabilityCapability.ts` inspects. Reading only the first here
 * would let the checklist report "Server errors are captured and reported to
 * Sentry" for a `NEXT_PUBLIC_SENTRY_DSN`-only deployment while this loader
 * bailed out and delivered nothing — exactly the false delivery claim #132
 * exists to remove. Exported so the smoke can pin that agreement.
 */
export function resolveSentryDsn(env: NodeJS.ProcessEnv = process.env): string | null {
  const dsn = env.SENTRY_DSN?.trim() || env.NEXT_PUBLIC_SENTRY_DSN?.trim();
  return dsn ? dsn : null;
}

function getDsn(): string | null {
  return resolveSentryDsn();
}

// The optional SDK is resolved at RUNTIME, never at build time. `@sentry/nextjs`
// is deliberately absent from package.json; while this module had no production
// caller a bare `import("@sentry/nextjs")` cost nothing, but `src/instrumentation.ts`
// now pulls it into the Next server build graph, where webpack resolves a literal
// specifier eagerly and fails the whole build with "Module not found: Can't
// resolve '@sentry/nextjs'". Keeping the specifier in a variable behind the
// bundler-ignore hints leaves the import native, so it simply rejects at runtime
// when the package is missing — which is the optional-dependency contract below.
const SENTRY_MODULE = "@sentry/nextjs";

async function loadSentry(): Promise<SentryShape | null> {
  const dsn = getDsn();
  if (!dsn) return null;
  if (sentryPromise) return sentryPromise;
  sentryPromise = (async () => {
    try {
      const mod = (await import(
        /* webpackIgnore: true */ /* turbopackIgnore: true */ SENTRY_MODULE
      )) as unknown as SentryShape;
      if (!initialized) {
        initialized = true;
        mod.init?.({
          dsn,
          environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
          tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0"),
        });
      }
      return mod;
    } catch (e) {
      // @sentry/nextjs not installed yet — production deploys add it
      // when activating Sentry. Log once so the absence is visible in
      // server logs without crashing.
      if (process.env.NODE_ENV !== "test") {
        console.warn(
          "[observability] SENTRY_DSN set but @sentry/nextjs not installed:",
          e instanceof Error ? e.message : e,
        );
      }
      return null;
    }
  })();
  return sentryPromise;
}

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Capture an exception with a per-tenant breadcrumb. Always returns
 * synchronously; the Sentry call is best-effort and runs on the next
 * microtask. Safe to invoke before Sentry is loaded.
 */
export function captureError(err: unknown, breadcrumb?: ObservabilityBreadcrumb): void {
  // Always console.error so dev + Vercel Function logs see the trace
  // even when Sentry isn't configured. Sentry capture is additive.
  if (process.env.NODE_ENV !== "test") {
    console.error("[observability]", err);
  }
  void loadSentry().then((s) => {
    if (!s) return;
    s.withScope?.((scope) => {
      applyBreadcrumb(scope, breadcrumb);
      scope.captureException?.(err);
    });
  });
}

/**
 * Drop a breadcrumb on the active Sentry scope. Useful for tracing
 * request lifecycle without raising an error. No-op when Sentry isn't
 * loaded.
 */
export function recordBreadcrumb(message: string, data?: Record<string, unknown>): void {
  void loadSentry().then((s) => {
    s?.addBreadcrumb?.({ category: "aqua", message, data });
  });
}

/**
 * Wrap an API route handler with timing + error capture. The wrapper:
 *   - Reads tenancy from the request URL + caller-supplied breadcrumb
 *     resolver and tags the Sentry scope before invoking the handler.
 *   - Captures any thrown error and re-throws (so the route's own
 *     error handling still runs).
 *   - Records duration + status as a breadcrumb on completion.
 *
 * `route` is a free-form label so events can be grouped by route
 * surface (e.g. "/api/portal/domains/attach"). Pass it explicitly —
 * Next.js doesn't reliably surface the canonical pathname inside a
 * route handler at module-load time.
 */
export function withApiObservability(
  handler: ApiHandler,
  options: {
    route: string;
    /** Optional resolver — runs against (req, ctx) to derive tenancy. */
    resolveBreadcrumb?: (req: Request, ctx?: unknown) => ObservabilityBreadcrumb | undefined;
  },
): ApiHandler {
  return async (req: Request, ctx?: unknown): Promise<Response> => {
    const start = Date.now();
    const breadcrumb = safeResolve(options.resolveBreadcrumb, req, ctx);
    let response: Response | null = null;
    try {
      response = await handler(req, ctx);
      return response;
    } catch (err) {
      captureError(err, {
        ...breadcrumb,
        extra: { ...(breadcrumb?.extra ?? {}), route: options.route, method: req.method },
      });
      throw err;
    } finally {
      const duration = Date.now() - start;
      const status = response?.status ?? 500;
      recordBreadcrumb(`api.${req.method.toLowerCase()} ${options.route}`, {
        duration_ms: duration,
        status,
        agencyId: breadcrumb?.agencyId,
        clientId: breadcrumb?.clientId,
        pluginId: breadcrumb?.pluginId,
      });
    }
  };
}

/**
 * Set the active session on the Sentry global scope. Useful to call
 * once at request entry (e.g. in middleware-equivalent code) so
 * subsequent captures in the same request inherit the tenancy without
 * threading a breadcrumb arg through.
 */
export function setSessionScope(breadcrumb: ObservabilityBreadcrumb): void {
  void loadSentry().then((s) => {
    if (!s) return;
    s.withScope?.((scope) => applyBreadcrumb(scope, breadcrumb));
    if (breadcrumb.userId) s.setUser?.({ id: breadcrumb.userId });
    if (breadcrumb.agencyId) s.setTag?.("agencyId", breadcrumb.agencyId);
    if (breadcrumb.clientId) s.setTag?.("clientId", breadcrumb.clientId);
    if (breadcrumb.pluginId) s.setTag?.("pluginId", breadcrumb.pluginId);
  });
}

/**
 * Returns true only when external error reporting can actually deliver —
 * a DSN is configured AND `@sentry/nextjs` resolves. A DSN on its own is
 * not evidence: the lazy import below returns `null` when the optional
 * package is absent and every capture becomes a silent no-op.
 */
export function isObservabilityConfigured(): boolean {
  return inspectObservabilityCapability().capturing;
}

// ─── Internals ─────────────────────────────────────────────────────────

function safeResolve(
  fn: ((req: Request, ctx?: unknown) => ObservabilityBreadcrumb | undefined) | undefined,
  req: Request,
  ctx: unknown,
): ObservabilityBreadcrumb | undefined {
  if (!fn) return undefined;
  try {
    return fn(req, ctx);
  } catch {
    return undefined;
  }
}

function applyBreadcrumb(scope: SentryShape, breadcrumb?: ObservabilityBreadcrumb): void {
  if (!breadcrumb) return;
  if (breadcrumb.userId) scope.setUser?.({ id: breadcrumb.userId });
  if (breadcrumb.agencyId) scope.setTag?.("agencyId", breadcrumb.agencyId);
  if (breadcrumb.clientId) scope.setTag?.("clientId", breadcrumb.clientId);
  if (breadcrumb.pluginId) scope.setTag?.("pluginId", breadcrumb.pluginId);
  if (breadcrumb.extra) scope.setExtras?.(breadcrumb.extra);
}

/**
 * Flush queued Sentry events on shutdown / serverless invocation end.
 * Vercel functions don't always run lifecycle hooks so callers should
 * `await flushObservability()` before returning a response when the
 * captured event must reach Sentry before the function freezes.
 */
export async function flushObservability(timeoutMs = 2000): Promise<void> {
  const s = await loadSentry();
  // @sentry/nextjs exposes flush() at the module level; we keep it
  // duck-typed so the optional-dep contract holds.
  const flushFn = (s as unknown as { flush?: (t?: number) => Promise<boolean> } | null)?.flush;
  if (typeof flushFn === "function") {
    try {
      await flushFn(timeoutMs);
    } catch {
      /* swallow — flush is best-effort */
    }
  }
}
