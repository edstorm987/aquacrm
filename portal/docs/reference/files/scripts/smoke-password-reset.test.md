# `scripts/smoke-password-reset.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** T1 R038 smoke — forgotten-password flow. Run via `npm run smoke:password-reset` (tsx --test).  Mix of pure-runtime checks (passwordReset.ts + nonceStore.ts have no `import "server-only"` shim — they're explicitly importable from smokes) plus source-marker checks for the route handlers, pages, and login-page wiring (their dependency graphs reach into server-only files like users.ts/storage.ts which tsx --test can't load).  Coverage: - HMAC token roundtrip preserves payload (sign → verify). - Tampered token rejected (invalid signature). - Malformed token (no dot) rejected. - Expired token rejected (forged exp in the past, valid sig). - Single-use enforced — consumeResetNonce flips on second call. - Distinct nonce kind 'password-reset' wired into NonceKind union (chapter #138 extension). - Lib + routes + pages + login-link source markers (10 file structure tests including the no-leak assertion on request-reset and the sessionRev/setUserPassword + redirect on reset).

_No exported symbols (side-effect / internal module)._

## Depends on (2)

- [`src/lib/server/auth/nonceStore.ts`](../src/lib/server/auth/nonceStore.md)
- [`src/lib/server/auth/passwordReset.ts`](../src/lib/server/auth/passwordReset.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

