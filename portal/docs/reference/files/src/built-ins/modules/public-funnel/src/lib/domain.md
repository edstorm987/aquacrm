# `src/built-ins/modules/public-funnel/src/lib/domain.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Public-funnel domain.

## Exports (12)

- `type LeadSource`
- `LEAD_SOURCES: readonly LeadSource[]`
- `interface HCSlot (5 members)`
- `interface LeadCapture (7 members)`
- `interface CaptureHcInput (3 members)`
- `interface CaptureToolInput (5 members)`
- `interface CaptureResult (4 members)`
- `interface MeContext (4 members)`
- `type HcScoreBucket`
- `bucketHcSlot(slot?: HCSlot): HcScoreBucket | undefined`
- `canonEmail(raw: string): string`
- `isPlausibleEmail(raw: string): boolean`

## Depends on (1)

- [`src/built-ins/modules/public-funnel/src/lib/tenancy.ts`](./tenancy.md)

## Used by (3)

- [`src/built-ins/modules/public-funnel/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/public-funnel/src/server/index.ts`](../server/index.md)
- [`src/built-ins/modules/public-funnel/src/server/services.ts`](../server/services.md)

