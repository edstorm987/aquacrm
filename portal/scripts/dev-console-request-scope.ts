// A real Next request scope, for tests.
//
// The Dev Console's gates are `requireRole([...AGENCY_ROLES])` followed by
// `devDocsAccessible(session)`, and `requireRole` reaches for `cookies()` from
// `next/headers`. Outside a request scope that throws, so every gated route
// handler and every `_Section` body in `src/app/portal/dev-team/` was
// untestable in-process — which is precisely why the audit found seven section
// bodies and a founder-gated write route with no behavioural coverage of the
// gate at all.
//
// Rather than weaken a route to `getSessionFromRequest` (which would drop the
// Supabase identity cross-check `getSession` performs — a gate, not a
// formality), this enters Next's OWN async-local stores with a request-shaped
// store. `cookies()` and `headers()` then resolve exactly as they do in a live
// request, and the gate under test is the real one.
//
// Scope: test support only. Nothing in src/ imports this.

import { AsyncLocalStorage } from "node:async_hooks";

// Next's async-local-storage module refuses to construct unless the runtime
// exposes AsyncLocalStorage globally (edge parity). Node does not, so hand it
// the real one before anything from next/ is loaded.
(globalThis as unknown as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= AsyncLocalStorage;

/**
 * The session cookie's name, read from the one source of truth so a rename
 * cannot silently 401 every test here.
 *
 * Imported LAZILY on purpose: a static import of `auth` pulls in `next/server`,
 * whose async-local-storage module is evaluated before the assignment above and
 * refuses to construct. Import order is load-bearing in this file.
 */
async function sessionCookieName(): Promise<string> {
  return (await import("../src/lib/server/auth")).SESSION_COOKIE_NAME;
}

interface CookieEntry { name: string; value: string }

function cookieJar(entries: Record<string, string>) {
  const list: CookieEntry[] = Object.entries(entries).map(([name, value]) => ({ name, value }));
  return {
    get: (name: string) => list.find(entry => entry.name === name),
    getAll: () => list,
    has: (name: string) => list.some(entry => entry.name === name),
    size: list.length,
    [Symbol.iterator]: function* () { yield* list; },
  };
}

/**
 * Run `fn` as though it were inside a request carrying these cookies.
 *
 * `route` only shows up in Next's own error messages; nothing under test reads
 * it. `host` feeds `headers()` for surfaces that derive an origin.
 */
export async function withRequestScope<T>(
  cookies: Record<string, string>,
  fn: () => Promise<T>,
  options: { route?: string; host?: string } = {},
): Promise<T> {
  const workUnit = await import("next/dist/server/app-render/work-unit-async-storage.external.js") as unknown as
    { workUnitAsyncStorage: AsyncLocalStorage<unknown> };
  const work = await import("next/dist/server/app-render/work-async-storage.external.js") as unknown as
    { workAsyncStorage: AsyncLocalStorage<unknown> };

  const jar = cookieJar(cookies);
  const requestStore = {
    type: "request",
    phase: "action",
    implicitTags: { tags: [], expirations: [] },
    cookies: jar,
    mutableCookies: jar,
    userspaceMutableCookies: jar,
    headers: new Headers({ host: options.host ?? "localhost:3000" }),
    url: { pathname: "/", search: "" },
    rootParams: {},
  };
  const workStore = {
    route: options.route ?? "/test",
    forceStatic: false,
    dynamicShouldError: false,
    isStaticGeneration: false,
    forceDynamic: true,
    fallbackRouteParams: null,
  };

  return work.workAsyncStorage.run(workStore, () =>
    workUnit.workUnitAsyncStorage.run(requestStore, fn),
  ) as Promise<T>;
}

/** The same, with a session cookie already in place. */
export async function withSession<T>(
  token: string,
  fn: () => Promise<T>,
  options?: { route?: string; host?: string },
): Promise<T> {
  return withRequestScope({ [await sessionCookieName()]: token }, fn, options);
}

/**
 * Run with Dev Mode's env guards satisfied, then restore them.
 *
 * Must await `fn()` before restoring: the env would otherwise pop back the
 * moment the callback first suspends, and a later awaited handler would see Dev
 * Mode disabled.
 */
export async function withDevMode<T>(fn: () => Promise<T>): Promise<T> {
  const saved = {
    dev: process.env.PORTAL_DEV_MODE,
    node: process.env.NODE_ENV,
    vercel: process.env.VERCEL_ENV,
  };
  process.env.PORTAL_DEV_MODE = "true";
  if (process.env.NODE_ENV === "production") process.env.NODE_ENV = "test";
  delete process.env.VERCEL_ENV;
  try {
    return await fn();
  } finally {
    restoreEnv("PORTAL_DEV_MODE", saved.dev);
    restoreEnv("NODE_ENV", saved.node);
    restoreEnv("VERCEL_ENV", saved.vercel);
  }
}

export function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

/** Next's `notFound()` throws this; a 404 gate is proven by catching it. */
export function isNextNotFound(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404");
}

/** …and `redirect()` throws this. */
export function isNextRedirect(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}
