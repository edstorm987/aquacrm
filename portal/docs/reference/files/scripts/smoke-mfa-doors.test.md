# `scripts/smoke-mfa-doors.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** The OTHER doors into `lk_session_v1` — and what each one proves.  The password door got its MFA gate on 2026-08-20 (`smoke-mfa.test.ts`). This file pins the rest of the contract:  1. The magic-link verify and the Google OAuth callback — single-factor flows with nowhere to type a code — REFUSE to mint the app session for an account whose Supabase identity has a verified second factor, and refuse too when enrolment cannot be checked at all. A side door that opens whenever the check is down is not closed. 2. Every minted session carries `aal` — which assurance level that sign-in actually proved — so the rest of the app can gate sensitive actions on "proved two factors", not "was issued at all".  Everything drives the REAL exported route handlers in-process against a stub Supabase admin API, because the thing that has to be true is not a shape in a source file — it is that no cookie comes back.

_No exported symbols (side-effect / internal module)._

## Depends on (9)

- [`src/app/api/auth/magic/verify/route.ts`](../src/app/api/auth/magic/verify/route.md)
- [`src/app/api/auth/oauth/google/callback/route.ts`](../src/app/api/auth/oauth/google/callback/route.md)
- [`src/lib/server/auth/auth.ts`](../src/lib/server/auth/auth.md)
- [`src/lib/server/auth/magicLink.ts`](../src/lib/server/auth/magicLink.md)
- [`src/lib/server/auth/mfa.ts`](../src/lib/server/auth/mfa.md)
- [`src/lib/server/integrations/oauthGoogle.ts`](../src/lib/server/integrations/oauthGoogle.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/tenants.ts`](../src/server/tenants.md)
- [`src/server/users.ts`](../src/server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

