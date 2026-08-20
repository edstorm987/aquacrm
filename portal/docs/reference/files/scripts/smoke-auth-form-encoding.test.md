# `scripts/smoke-auth-form-encoding.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** P2 smoke — published-site Login block: native form POST into the JSON-only sign-in route (issues.md #14).  Behavioural: drives the REAL exported POST handler of `/api/auth/login` in-process with `NextRequest` (no dev server), per the runtime-verify convention. A stub Supabase HTTP server stands in for `signInWithPassword` so the success path can be exercised end-to-end without touching the live project.  What is proven here: 1. a form-encoded POST 303-redirects (it used to be a 400 JSON blob); 2. the JSON contract every portal fetch caller depends on is byte-for-byte unchanged — same status, same keys, same values; 3. a failed form login comes back to the SAME-ORIGIN referring page, never to an attacker-supplied origin and never to the portal /login when the visitor came from a client site; 4. nothing about the attempt (email, password, error text) is ever put in the redirect URL; 5. the rate limiter still counts form posts — the content-type branch is after the limiter, not around it.

_No exported symbols (side-effect / internal module)._

## Depends on (5)

- [`src/app/api/auth/login/route.ts`](../src/app/api/auth/login/route.md)
- [`src/lib/server/auth/auth.ts`](../src/lib/server/auth/auth.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/tenants.ts`](../src/server/tenants.md)
- [`src/server/users.ts`](../src/server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

