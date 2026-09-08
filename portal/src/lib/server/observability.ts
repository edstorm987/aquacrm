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
export function isExpectedFrameworkControlFlow(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "digest" in error
    && (error as { digest?: unknown }).digest === "DYNAMIC_SERVER_USAGE";
}

/**
 * A correlation id for one captured error. Prefers the framework `digest` — the
 * value the client-facing error boundary (`app/error.tsx`) already shows a user —
 * so a user's "error id" ties straight to the server log and the Sentry event.
 * Falls back to a random id (Web Crypto, available on both Node and Edge — never a
 * static `node:crypto` import, which would break the Edge instrumentation bundle).
 */
export function correlationIdFor(err: unknown): string {
  const digest = typeof err === "object" && err !== null && "digest" in err
    ? String((err as { digest?: unknown }).digest ?? "").trim()
    : "";
  if (digest) return digest;
  try {
    const id = globalThis.crypto?.randomUUID?.();
    if (id) return id;
  } catch { /* fall through to a timestamped id */ }
  return `err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The allowlist of fields observability may emit as structured metadata — for the
 * production console line AND for the Sentry event context (tags/extras).
 *
 * Everything NOT on this list is deliberately excluded because it can carry
 * customer data, tokens or credentials: the raw error MESSAGE and STACK, the
 * actual request PATH, QUERY strings, request/response BODIES, headers, cookies,
 * and any free-form caller `extra`. This is the single sanitisation/redaction
 * boundary; nothing else is assumed safe. (The exception's own message/stack is
 * still sent to Sentry via `captureException` — Sentry is the designated,
 * access-controlled home for it, where the operator configures PII scrubbing.)
 */
export interface SafeErrorContext {
  errorId?: string;
  /** Error class/classification only — validated to a simple identifier. */
  name?: string;
  /** Canonical route PATTERN only — never the actual path or query string. */
  route?: string;
  method?: string;
  agencyId?: string;
  clientId?: string;
  pluginId?: string;
  /** Internal pseudonymous user id — Sentry user context only, not the console. */
  userId?: string;
}

// Shape validators. A value that does not match is DROPPED, so a caller cannot
// smuggle an email, bearer token, card number or query string through a field.
const SAFE_IDENTIFIER = /^[A-Za-z0-9_.:$-]{1,80}$/;
const SAFE_ROUTE = /^\/[A-Za-z0-9/_.:$()[\]-]{0,200}$/;
const SAFE_METHOD = /^[A-Z]{3,7}$/;

function safeName(err: unknown): string {
  const name = err instanceof Error ? err.name : typeof err;
  return typeof name === "string" && SAFE_IDENTIFIER.test(name) ? name : "Error";
}
function safeId(value: unknown): string | undefined {
  return typeof value === "string" && SAFE_IDENTIFIER.test(value) ? value : undefined;
}
function safeMethod(value: unknown): string | undefined {
  return typeof value === "string" && SAFE_METHOD.test(value) ? value : undefined;
}
function safeRoute(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  // Strip any query/fragment BEFORE validating — query values are the highest-risk
  // leak (emails, tokens) — then keep only a bounded, path-shaped remainder.
  const pathOnly = value.split("?")[0].split("#")[0];
  return SAFE_ROUTE.test(pathOnly) ? pathOnly : undefined;
}

/**
 * Reduce a captured error + breadcrumb to ONLY the allowlisted, shape-validated
 * fields of `SafeErrorContext`. Pure and exported so the redaction boundary is
 * directly testable. This is the ONLY thing permitted to become structured log
 * output or Sentry context.
 */
export function buildSafeErrorContext(
  err: unknown,
  breadcrumb: ObservabilityBreadcrumb | undefined,
  errorId?: string,
): SafeErrorContext {
  const extra = breadcrumb?.extra ?? {};
  return {
    errorId,
    name: safeName(err),
    route: safeRoute(extra.route),
    method: safeMethod(extra.method),
    agencyId: safeId(breadcrumb?.agencyId),
    clientId: safeId(breadcrumb?.clientId),
    pluginId: safeId(breadcrumb?.pluginId),
    userId: safeId(breadcrumb?.userId),
  };
}

/** The production console payload: the safe context (minus user id) plus a level. */
function safeLogPayload(safe: SafeErrorContext): Record<string, unknown> {
  return {
    level: "error",
    errorId: safe.errorId,
    name: safe.name,
    route: safe.route,
    method: safe.method,
    agencyId: safe.agencyId,
    clientId: safe.clientId,
    pluginId: safe.pluginId,
  };
}

/**
 * Capture an exception with a per-tenant breadcrumb. Returns the correlation id
 * (also attached to the Sentry event and printed in the log) so a caller can
 * surface it to the user or thread it onward. Synchronous; the Sentry call is
 * best-effort on the next microtask.
 *
 * Logging is environment-gated:
 *   - PRODUCTION → the allowlisted `safeLogPayload` ONLY. The raw error object,
 *     its message/stack, the request path, query values and any free-form extra
 *     are never printed to the deployment log.
 *   - LOCAL/DEV (not test) → the full error + stack, for debugging, plus the same
 *     safe payload. Never runs in production.
 *   - test → nothing.
 */
export function captureError(err: unknown, breadcrumb?: ObservabilityBreadcrumb): string {
  const errorId = correlationIdFor(err);
  const safe = buildSafeErrorContext(err, breadcrumb, errorId);
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === "production") {
    console.error("[observability]", JSON.stringify(safeLogPayload(safe)));
  } else if (nodeEnv !== "test") {
    console.error("[observability]", err, JSON.stringify(safeLogPayload(safe)));
  }
  void loadSentry().then((s) => {
    if (!s) return;
    s.withScope?.((scope) => {
      // Only the allowlisted context reaches the Sentry scope — never the raw
      // path or free extras. The exception itself carries its message/stack.
      applySafeScope(scope, safe);
      scope.captureException?.(err);
    });
  });
  return errorId;
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
        agencyId: breadcrumb?.agencyId,
        clientId: breadcrumb?.clientId,
        pluginId: breadcrumb?.pluginId,
        userId: breadcrumb?.userId,
        // Only the route label + method — never the resolver's raw `extra`.
        extra: { route: options.route, method: req.method },
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
  // Sanitise before anything reaches Sentry — only validated tenancy ids, never
  // the raw breadcrumb or its `extra`.
  const safe = buildSafeErrorContext(undefined, breadcrumb);
  void loadSentry().then((s) => {
    if (!s) return;
    s.withScope?.((scope) => applySafeScope(scope, safe));
    if (safe.userId) s.setUser?.({ id: safe.userId });
    if (safe.agencyId) s.setTag?.("agencyId", safe.agencyId);
    if (safe.clientId) s.setTag?.("clientId", safe.clientId);
    if (safe.pluginId) s.setTag?.("pluginId", safe.pluginId);
  });
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

/**
 * Apply ONLY the allowlisted, shape-validated context to a Sentry scope. It never
 * calls `setExtras(breadcrumb.extra)` with a raw caller object — the previous
 * behaviour, which leaked the request path and any free-form extra into every
 * event. The exception's message/stack still arrives via `captureException`.
 */
function applySafeScope(scope: SentryShape, safe: SafeErrorContext): void {
  if (safe.userId) scope.setUser?.({ id: safe.userId });
  if (safe.agencyId) scope.setTag?.("agencyId", safe.agencyId);
  if (safe.clientId) scope.setTag?.("clientId", safe.clientId);
  if (safe.pluginId) scope.setTag?.("pluginId", safe.pluginId);
  scope.setExtras?.({
    errorId: safe.errorId,
    errorName: safe.name,
    route: safe.route,
    method: safe.method,
  });
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
