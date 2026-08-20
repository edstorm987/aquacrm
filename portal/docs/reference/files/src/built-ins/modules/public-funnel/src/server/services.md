# `src/built-ins/modules/public-funnel/src/server/services.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Public-funnel service.  Storage layout (single agency-scoped install — gated to the master "Milesy Media" agencyId until `scopePolicy: "global"` lands): captures/index             → string[] of capture ids captures/by-id/<id>        → LeadCapture captures/by-email/<email>  → string[] of capture ids (canonical lowercased email key)

## Exports (3)

- `class FunnelInputError`
    - `constructor(message: string)`
- `interface FunnelDeps (6 members)`
- `class FunnelService`
    - `constructor(deps: FunnelDeps)`
    - `async captureHcCompletion(input: CaptureHcInput): Promise<CaptureResult>`
    - `async captureToolCompletion(input: CaptureToolInput): Promise<CaptureResult>`
    - `async eraseForAddresses(addresses: readonly string[]): Promise<number>`
    - `async listByEmail(email: string): Promise<LeadCapture[]>`
    - `async list(filter: { source?: LeadSource } = {}): Promise<LeadCapture[]>`
    - `async meContext(leadUserId: UserId): Promise<MeContext | null>`

## Depends on (5)

- [`src/built-ins/modules/public-funnel/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/public-funnel/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/public-funnel/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/public-funnel/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/public-funnel/src/server/ports.ts`](./ports.md)

## Used by (2)

- [`src/built-ins/modules/public-funnel/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/public-funnel/src/server/index.ts`](./index.md)

