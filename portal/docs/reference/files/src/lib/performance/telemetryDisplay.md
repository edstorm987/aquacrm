# `src/lib/performance/telemetryDisplay.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** Rendering telemetry counts honestly.  `summarizeAgencyWebsite` (and the per-property summaries built the same way) return raw counts: a site whose Aqua Tag has never reported yields `pageviews24h: 0`, indistinguishable from a live site that had a quiet day. Several panels then printed `String(summary.pageviews24h)` — so a brand new agency read "Views today: 0" sitting directly beside "Tag: Waiting". The screen knew the tag had never spoken and still stated a measurement.  This is the same rule Radar is already held to, and the same rule `commercialIntelligence.ts` encodes in its `number | null` pageviews: **unmeasured is "—", never 0.**  Widening `ClientTelemetrySummary` itself to `number | null` would ripple through Radar, Performance, Development and the client workspace at once, so the measuredness is applied at the display edge instead — one helper, one meaning, reusable by the next panel that needs it. The dash every honest surface in this codebase uses for "no reading".

## Exports (3)

- `UNMEASURED`
- `measuredCount(value: number, lastSeenAt: number | null | undefined): number | null`
- `measuredCountLabel(value: number, lastSeenAt: number | null | undefined): string`

## Used by (5)

- [`scripts/smoke-truthful-surfaces.test.ts`](../../../scripts/smoke-truthful-surfaces.test.md)
- [`src/app/portal/agency/development/website/_WebsiteWorkspace.tsx`](../../app/portal/agency/development/website/_WebsiteWorkspace.md)
- [`src/app/portal/agency/marketing/page.tsx`](../../app/portal/agency/marketing/page.md)
- [`src/app/portal/agency/performance/_PerformanceWorkspace.tsx`](../../app/portal/agency/performance/_PerformanceWorkspace.md)
- [`src/app/portal/clients/[clientId]/_ClientSystemsWorkspace.tsx`](../../app/portal/clients/[clientId]/_ClientSystemsWorkspace.md)

