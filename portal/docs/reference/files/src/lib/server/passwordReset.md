# `src/lib/server/passwordReset.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** Password-reset HMAC token helper. T1 R038 — chapter #160. Mirrors emailVerification.ts (#117 signup flow) with a distinct kind so a forgotten-password token can't be replayed against the email-verify surface and vice-versa.  Token shape:    base64url(JSON({userId, email, exp, nonce})) "." HMAC TTL:            24 hours — comfortable inbox-latency window; longer than magic-link (15 min) since users may walk away before clicking through. Single-use:     atomic via the durable nonce store (chapter #138 — `consumeNonce(nonce, "password-reset", ttlMs)`). The `password-reset` kind is added alongside the existing `magic-link` / `email-verify` / `csrf` set.  No `import "server-only"` — same rationale as emailVerification.ts: the smoke imports this directly; HMAC + nonce store only take effect when actually called.

## Exports (4)

- `interface PasswordResetPayload (4 members)`
- `signPasswordResetToken(input: { userId: string; email: string }): { token: string; payload: PasswordResetPayload; }`
- `verifyPasswordResetToken(token: string): { ok: true; payload: PasswordResetPayload } | { ok: false; error: string }`
- `async consumeResetNonce(nonce: string, expSec: number): Promise<boolean>`

## Used by (3)

- [`scripts/smoke-password-reset.test.ts`](../../../scripts/smoke-password-reset.test.md)
- [`src/app/api/auth/password/request-reset/route.ts`](../../app/api/auth/password/request-reset/route.md)
- [`src/app/api/auth/password/reset/route.ts`](../../app/api/auth/password/reset/route.md)

