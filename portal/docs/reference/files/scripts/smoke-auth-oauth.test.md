# `scripts/smoke-auth-oauth.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Mock-smoke for the foundation Google-OAuth helpers. Verifies state signing/verification, authorize-URL shape, and tokeninfo verification (success + audience mismatch + expired). No real Google calls.  Usage: npx tsx --test scripts/smoke-auth-oauth.test.ts

_No exported symbols (side-effect / internal module)._

## Depends on (1)

- [`src/lib/server/integrations/oauthGoogle.ts`](../src/lib/server/integrations/oauthGoogle.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

