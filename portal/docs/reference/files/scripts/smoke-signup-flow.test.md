# `scripts/smoke-signup-flow.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** T1 R020 smoke — account bootstrap + email verification HMAC. Run via `npm run smoke:signup-flow` (tsx --test).  We verify: - emailVerification HMAC roundtrip (sign → verify → payload match). - Tampered token fails signature check. - Expired token fails. - Single-use nonce store flips after markVerifyNonceUsed. - Standalone portal keeps public signup/demo surfaces removed while preserving the backend bootstrap + verification contracts.

_No exported symbols (side-effect / internal module)._

## Depends on (1)

- [`src/lib/server/emailVerification.ts`](../src/lib/server/emailVerification.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

