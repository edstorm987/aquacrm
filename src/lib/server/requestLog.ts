// Request log helper (T1 R030 — chapter `04-observability.md`).
//
// Lightweight JSON-line stdout logger for HTTP requests. Designed to
// be called from route handlers (or wrapped via `withRequestLog`)
// rather than running as a Next.js middleware on every request — the
// project's existing middleware.ts is matcher-scoped to `/embed/...`
// and broadening it would log every static asset and healthcheck.
// Mass instrumentation is deferred to incremental adoption.
//
// Output shape:
//   {"t":"req","ts":<epoch-ms>,"method":"GET","path":"/portal/agency",
//    "status":200,"durationMs":42,"userId":"usr_…","agencyId":"agency_…"}
//
// One JSON object per stdout line so log aggregators (Vercel Logs /
// Datadog / Loki) parse cleanly. Skips configured high-volume paths
// so the default invocation doesn't drown the channel.
//
// No `server-only` shim so the smoke can drive shape under tsx --test.

const SKIP_PATHS = ["/healthz", "/_next", "/favicon"];
const SKIP_SUFFIXES = [".css", ".js", ".mjs", ".map", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico", ".woff", ".woff2", ".ttf"];

export interface RequestLogEntry {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  userId?: string;
  agencyId?: string;
  clientId?: string;
  // Free-form metadata. Stringified per-key so the JSON line stays flat.
  extra?: Record<string, string | number | boolean | null>;
}

export function shouldSkipRequestLog(path: string): boolean {
  for (const p of SKIP_PATHS) {
    if (path === p || path.startsWith(p + "/")) return true;
  }
  for (const s of SKIP_SUFFIXES) {
    if (path.endsWith(s)) return true;
  }
  return false;
}

export function formatRequestLog(entry: RequestLogEntry, now = Date.now()): string {
  const payload: Record<string, unknown> = {
    t: "req",
    ts: now,
    method: entry.method.toUpperCase(),
    path: entry.path,
    status: entry.status,
    durationMs: entry.durationMs,
  };
  if (entry.userId) payload.userId = entry.userId;
  if (entry.agencyId) payload.agencyId = entry.agencyId;
  if (entry.clientId) payload.clientId = entry.clientId;
  if (entry.extra) {
    for (const [k, v] of Object.entries(entry.extra)) {
      payload[k] = v;
    }
  }
  return JSON.stringify(payload);
}

export function logRequest(entry: RequestLogEntry): void {
  if (shouldSkipRequestLog(entry.path)) return;
  if (process.env.NODE_ENV === "test") return; // smoke runs quiet
  // eslint-disable-next-line no-console
  console.log(formatRequestLog(entry));
}

// Wrapper for route handlers that want one-line auto-instrumentation.
// Caller resolves tenancy via the supplied tagger; handler returns a
// Response. Skipped paths still execute the handler but don't log.
type Handler = (req: Request, ctx?: unknown) => Promise<Response>;
type Tag = Pick<RequestLogEntry, "userId" | "agencyId" | "clientId">;
type TagFn = (req: Request, ctx?: unknown) => Tag | undefined;

export function withRequestLog(
  handler: Handler,
  opts: { route?: string; tag?: TagFn } = {},
): Handler {
  return async (req: Request, ctx?: unknown) => {
    const start = Date.now();
    const url = new URL(req.url);
    const path = opts.route ?? url.pathname;
    let res: Response | null = null;
    let status = 500;
    try {
      res = await handler(req, ctx);
      status = res.status;
      return res;
    } finally {
      const tag = opts.tag ? safeTag(opts.tag, req, ctx) : undefined;
      logRequest({
        method: req.method,
        path,
        status,
        durationMs: Date.now() - start,
        ...(tag ?? {}),
      });
    }
  };
}

function safeTag(tag: TagFn, req: Request, ctx: unknown): Tag | undefined {
  try {
    return tag(req, ctx);
  } catch {
    return undefined;
  }
}
