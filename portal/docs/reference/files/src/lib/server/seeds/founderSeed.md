# `src/lib/server/seeds/founderSeed.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (9)

- `FOUNDER_AGENCY_SLUG`
- `DEFAULT_FOUNDER_EMAIL`
- `DEFAULT_FOUNDER_AGENCY_NAME`
- `FOUNDER_NAME`
- `FOUNDER_USERNAME`
- `FOUNDER_EMAIL`
- `checkFounderPolicy(input: { email: string; password: string | undefined; nodeEnv: string | undefined; }): PolicyCheck`
- `seedFounder(): Promise<void>`
- `_resetFounderSeedForTests(): void`

## Depends on (6)

- [`src/built-ins/runtime/_runtime.ts`](../../../built-ins/runtime/_runtime.md)
- [`src/lib/shared/internalWorkspace.ts`](../../shared/internalWorkspace.md)
- [`src/server/agencyBootstrap.ts`](../../../server/agencyBootstrap.md)
- [`src/server/storage.ts`](../../../server/storage.md)
- [`src/server/tenants.ts`](../../../server/tenants.md)
- [`src/server/users.ts`](../../../server/users.md)

## Used by (6)

- [`src/app/api/auth/login/route.ts`](../../../app/api/auth/login/route.md)
- [`src/app/api/auth/signup/route.ts`](../../../app/api/auth/signup/route.md)
- [`src/app/api/public/brand-enquiry/route.ts`](../../../app/api/public/brand-enquiry/route.md)
- [`src/app/api/public/careers/route.ts`](../../../app/api/public/careers/route.md)
- [`src/app/api/public/contact/route.ts`](../../../app/api/public/contact/route.md)
- [`src/lib/server/radar/radarSourceInspection.ts`](../radar/radarSourceInspection.md)

