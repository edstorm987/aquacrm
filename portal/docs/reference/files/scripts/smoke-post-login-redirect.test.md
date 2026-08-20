# `scripts/smoke-post-login-redirect.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** T1 R022 smoke — role-aware post-login redirect. Run via `npm run smoke:post-login-redirect` (tsx --test).  We don't import the resolver directly: it pulls `@/server/tenants` which carries a `server-only` shim that throws under tsx. Instead we verify the routing table via source-marker assertions plus structural wire-up of the three production call-sites (login, signup, magic/verify).

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

