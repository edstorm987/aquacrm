# `scripts/smoke-google-oauth.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Route-level smoke for Google OAuth activation (T1 — chapter `04-google-oauth-activation.md`). Pairs with the helper-level `smoke-auth-oauth.test.ts` which already covers buildAuthorizeUrl / verifyOAuthState / verifyIdToken.  This file exercises the start + callback ROUTES + secrets accessors + ENV_ALLOWLIST + .env.example + deploy.md, plus typed-secret accessors from `lib/server/secrets.ts`. Mocks every Google network call — no outbound HTTP.  Usage: npx tsx --test scripts/smoke-google-oauth.test.ts

_No exported symbols (side-effect / internal module)._

## Depends on (2)

- [`src/lib/server/env.ts`](../src/lib/server/env.md)
- [`src/lib/server/integrations/oauthGoogle.ts`](../src/lib/server/integrations/oauthGoogle.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

