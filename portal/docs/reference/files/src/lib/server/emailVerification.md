# `src/lib/server/auth/emailVerification.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** Email-verification HMAC token helper. R020. (No `import "server-only"` — same rationale as magicLink.ts: smoke imports this directly; the in-memory nonce store + HMAC signing only take effect when actually called.)  Token shape:    base64url(JSON({userId, email, exp, nonce})) "." HMAC TTL:            24 hours (longer than magic-link's 15 min — users may verify later; v1 doesn't gate portal access on it). Single-use:     nonce stored in an in-memory Set with TTL expiry. Replay = "already used" reject. Same v1 single-process limitation as magic-link; documented for R+1 alongside RLS multi-instance hardening.

## Exports (6)

- `interface VerifyEmailPayload (4 members)`
- `signVerifyEmailToken(input: { userId: string; email: string }): { token: string; payload: VerifyEmailPayload; }`
- `verifyVerifyEmailToken(token: string): { ok: true; payload: VerifyEmailPayload } | { ok: false; error: string }`
- `async consumeVerifyNonce(nonce: string, expSec: number): Promise<boolean>`
- `isVerifyNonceUsed(nonce: string): boolean`
- `markVerifyNonceUsed(nonce: string, exp: number): void`

## Used by (3)

- [`scripts/smoke-signup-flow.test.ts`](../../../scripts/smoke-signup-flow.test.md)
- [`src/app/api/auth/signup/route.ts`](../../app/api/auth/signup/route.md)
- [`src/app/api/auth/verify-email/route.ts`](../../app/api/auth/verify-email/route.md)

