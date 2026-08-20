# `src/lib/server/auth/nonceStore.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** Durable HMAC nonce store (T1 R028 — chapter `04-durable-nonce-store.md`).  Replaces the per-module in-memory Set used by magicLink.ts + emailVerification.ts. Multi-instance deploys lose security guarantees with in-memory single-process state — a magic-link nonce consumed on instance A could be replayed against instance B. This module provides a single nonceStore with two adapters:  - Postgres adapter: when `PORTAL_BACKEND === "postgres"` OR `DATABASE_URL` is set. Lazily ensures the `nonces` table on first call. `consumeNonce` is atomic: `INSERT … ON CONFLICT DO NOTHING RETURNING token` returns a row iff this was the first consumption — second call returns no row, we report false ("already used"). - Memory adapter: dev / test default. Map<token, expiresAt> with the same single-use semantics.  `kind` discriminates which surface owns the nonce so an analytics query can split usage. Today we use `magic-link` / `email-verify` / `csrf` (csrf future-reserved — current CSRF tokens are stateless HMAC).  `gcExpiredNonces()` is called from rateLimit.ts `sweepExpired()` (R021) so the existing diagnostic + Founder-gated /api/internal/sweep route picks up nonce GC for free.  NOTE: deliberately omits `server-only` so the smoke can drive the memory adapter under tsx --test. The Postgres adapter lazy-imports `pg` on first call.

## Exports (5)

- `type NonceKind`
- `interface NonceStore (4 members)`
- `getNonceStore(): NonceStore`
- `async _swapStoreForTests(adapter: NonceStore | null): Promise<void>`
- `_createMemoryAdapterForTests(): NonceStore`

## Used by (3)

- [`scripts/smoke-durable-nonce-store.test.ts`](../../../scripts/smoke-durable-nonce-store.test.md)
- [`scripts/smoke-password-reset.test.ts`](../../../scripts/smoke-password-reset.test.md)
- [`src/lib/server/auth/magicLink.ts`](./magicLink.md)

