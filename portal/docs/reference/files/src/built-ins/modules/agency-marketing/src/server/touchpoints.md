# `src/built-ins/modules/agency-marketing/src/server/touchpoints.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** TouchpointService — every contact attempt with a lead. R008 addition.  Storage layout: touchpoints/index           → string[] of touchpoint ids touchpoints/by-id/<id>      → Touchpoint touchpoints/by-lead/<lead>  → string[] of touchpoint ids

## Exports (2)

- `class TouchpointService`
    - `constructor(private agencyId: AgencyId, private storage: StoragePort, private activity: ActivityLogPort, private events: EventBusPort)`
    - `async list(filter: TouchpointFilter = {}): Promise<Touchpoint[]>`
    - `async get(id: string): Promise<Touchpoint | null>`
    - `async listForLead(leadId: string): Promise<Touchpoint[]>`
    - `async record(actor: UserId, input: CreateTouchpointInput): Promise<Touchpoint>`
    - `async onCrmLeadStatusChanged(args: { leadId: string; fromStatus?: string; toStatus: string; actor?: UserId; }): Promise<Touchpoint>`
- `class PerformanceService`
    - `constructor(private campaigns: CampaignService, private content: ContentCalendarService, private touchpoints: TouchpointService)`
    - `async summary(refNow: number, weeks = 12): Promise<PerformanceSummary>`

## Depends on (7)

- [`src/built-ins/modules/agency-marketing/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/agency-marketing/src/lib/ids.ts`](../lib/ids.md)
- [`src/built-ins/modules/agency-marketing/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/agency-marketing/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/agency-marketing/src/server/campaigns.ts`](./campaigns.md)
- [`src/built-ins/modules/agency-marketing/src/server/content.ts`](./content.md)
- [`src/built-ins/modules/agency-marketing/src/server/ports.ts`](./ports.md)

## Used by (1)

- [`src/built-ins/modules/agency-marketing/src/server/index.ts`](./index.md)

