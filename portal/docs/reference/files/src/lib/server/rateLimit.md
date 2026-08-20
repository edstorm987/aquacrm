# `src/lib/server/rateLimit.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (9)

- `interface RateLimitOpts (3 members)`
- `interface RateLimitResult (4 members)`
- `rateLimit({ key, max, windowMs }: RateLimitOpts): RateLimitResult`
- `isLoginLocked(input: { ip: string; email: string }): { locked: boolean; retryAfterSec: number }`
- `recordLoginFailure(input: { ip: string; email: string }): { lockedNow: boolean }`
- `recordLoginSuccess(input: { ip: string; email: string }): void`
- `interface SweepStats (4 members)`
- `async sweepExpired(): Promise<SweepStats>`
- `clientIpFromHeaders(headers: Headers): string`

## Used by (17)

- [`scripts/smoke-mfa.test.ts`](../../../scripts/smoke-mfa.test.md)
- [`src/app/api/assistant/route.ts`](../../app/api/assistant/route.md)
- [`src/app/api/auth/end-customer/signup/route.ts`](../../app/api/auth/end-customer/signup/route.md)
- [`src/app/api/auth/login/route.ts`](../../app/api/auth/login/route.md)
- [`src/app/api/auth/magic/request/route.ts`](../../app/api/auth/magic/request/route.md)
- [`src/app/api/auth/password/request-reset/route.ts`](../../app/api/auth/password/request-reset/route.md)
- [`src/app/api/auth/signup/route.ts`](../../app/api/auth/signup/route.md)
- [`src/app/api/internal/sweep/route.ts`](../../app/api/internal/sweep/route.md)
- [`src/app/api/portal/advisor/skills/route.ts`](../../app/api/portal/advisor/skills/route.md)
- [`src/app/api/portal/connections/accept/route.ts`](../../app/api/portal/connections/accept/route.md)
- [`src/app/api/portal/connections/request-code/route.ts`](../../app/api/portal/connections/request-code/route.md)
- [`src/app/api/public/brand-enquiry/route.ts`](../../app/api/public/brand-enquiry/route.md)
- [`src/app/api/public/careers/route.ts`](../../app/api/public/careers/route.md)
- [`src/app/api/public/contact/route.ts`](../../app/api/public/contact/route.md)
- [`src/app/api/public/form-capture/route.ts`](../../app/api/public/form-capture/route.md)
- [`src/app/api/telemetry/collect/route.ts`](../../app/api/telemetry/collect/route.md)
- [`src/lib/server/assistants/externalAssistantApi.ts`](./assistants/externalAssistantApi.md)

