# `src/lib/server/auth/magicLink.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** Magic-link sign-in for end-customers. R9. (No `import "server-only"` — same rationale as oauthGoogle.ts: smoke imports this directly; the in-memory nonce store + HMAC signing only take effect when actually called.)  Token shape:    base64url(JSON({email, clientId, agencyId, exp, nonce})) "." HMAC TTL:            15 minutes Single-use:     nonce stored in an in-memory Set with TTL expiry. Replay = "already used" reject. (v1 limitation: single-process — prod multi-instance needs shared storage; documented.)  Email delivery: T2 R10's email-sender plugin owns the actual SMTP. Foundation calls a registered delivery function (`registerMagicLinkDelivery`). When unset (e.g. dev with the plugin not installed), the URL is logged to the server console so a developer can copy/paste it.

## Exports (10)

- `interface MagicLinkPayload (5 members)`
- `signMagicToken(input: Omit<MagicLinkPayload, "exp" | "nonce">): { token: string; payload: MagicLinkPayload; }`
- `verifyMagicToken(token: string): { ok: true; payload: MagicLinkPayload } | { ok: false; error: string }`
- `async consumeMagicNonce(nonce: string, expSec: number): Promise<boolean>`
- `isUsed(nonce: string): boolean`
- `markUsed(nonce: string, exp: number): void`
- `_clearUsedForTests(): void`
- `interface MagicLinkDelivery (1 members)`
- `registerMagicLinkDelivery(fn: MagicLinkDelivery | null): void`
- `async deliverMagicLink(input: { email: string; clientId: string; agencyId: string; magicUrl: string; }): Promise<{ delivered: boolean; via: "email-sender" | "resend" | "console" }>`

## Depends on (2)

- [`src/lib/server/auth/nonceStore.ts`](./nonceStore.md)
- [`src/lib/server/email/transactionalEmail.ts`](../email/transactionalEmail.md)

## Used by (4)

- [`scripts/smoke-auth-magic.test.ts`](../../../../scripts/smoke-auth-magic.test.md)
- [`src/app/api/auth/magic/request/route.ts`](../../../app/api/auth/magic/request/route.md)
- [`src/app/api/auth/magic/verify/route.ts`](../../../app/api/auth/magic/verify/route.md)
- [`src/app/api/tenants/customer-portal-control/route.ts`](../../../app/api/tenants/customer-portal-control/route.md)

