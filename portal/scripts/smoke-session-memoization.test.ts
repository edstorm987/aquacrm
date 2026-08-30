// Perf tripwire — per-request session memoization.
//
// Ed's audit finding: one navigation renders layout + page + nested server
// components, and every one of them calls `getSession()` (directly or via
// `requireSession`/`requireRole`/`getCurrentUser`). Un-memoized, each call
// re-ran the full resolution — cookie verify, the authoritative-user lookup
// inside `resolveFreshSessionUser`, and Supabase `auth.getUser()` — so a
// single request paid for the same network and state work several times over.
//
// The fix is React's `cache()` around `getSession`: within ONE RSC render
// every caller shares one resolution. That is exactly the safe scope — the
// cookie jar cannot change mid-request, the next request gets a fresh cache,
// so revocation/rotation still land on the very next navigation, and outside
// an RSC render `cache()` is a pass-through (API routes and tests keep
// per-call behaviour). These are source assertions because the guarantee is
// structural: a later refactor that quietly unwraps `getSession` would
// reintroduce the repeated work with zero functional test failing.
//
// `getSessionFromRequest()` must stay UN-wrapped. It takes an explicit
// request (proxy/middleware/API surfaces with no RSC cache scope) and its
// contract is per-call resolution of whatever request it is handed —
// memoizing it would at best do nothing and at worst pin one request's
// session onto another wherever a cache scope did exist.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "..");
const AUTH = join(ROOT, "src/lib/server/auth/auth.ts");
const source = readFileSync(AUTH, "utf8");

test("auth.ts imports cache from react for per-request memoization", () => {
  assert.match(
    source,
    /import \{ cache \} from "react";/,
    "auth.ts must import React's cache() — it is what dedupes getSession within one RSC render",
  );
});

test("getSession is wrapped in React cache()", () => {
  assert.match(
    source,
    /export const getSession = cache\(\s*async \(\): Promise<SessionPayload \| null>/,
    "getSession must be the cache()-wrapped zero-arg resolver — unwrapping it re-runs " +
      "Supabase auth.getUser() and resolveFreshSessionUser once per caller per request",
  );
});

test("getSessionFromRequest is NOT memoized", () => {
  // The explicit-request path must remain a plain function: it serves
  // proxy/middleware/API callers outside any RSC cache scope, one
  // resolution per call, keyed by nothing but the request it is handed.
  assert.match(
    source,
    /export async function getSessionFromRequest\(req: NextRequest\)/,
    "getSessionFromRequest must stay a plain per-call function",
  );
  assert.doesNotMatch(
    source,
    /getSessionFromRequest\s*=\s*cache\(/,
    "getSessionFromRequest must never be wrapped in cache()",
  );
});

test("the session resolution pipeline still runs inside the memoized scope", () => {
  // The point of the memo is that ONE run per request still does the full
  // job: freshness/revocation via sessionFromToken → resolveFreshSessionUser,
  // then the Supabase identity cross-check. Pin that the cached body still
  // reaches both, so the dedup can never quietly become a skip.
  const body = source.slice(source.indexOf("export const getSession = cache("));
  const cachedBody = body.slice(0, body.indexOf("});") + 3);
  assert.match(cachedBody, /sessionFromToken\(/, "cached getSession must still verify + freshness-check the cookie");
  assert.match(cachedBody, /getAuthenticatedSupabaseUser\(\)/, "cached getSession must still cross-check Supabase identity");
});
