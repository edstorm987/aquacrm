# `src/built-ins/modules/agency-marketing/src/server/reports.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Reports: campaignSnapshot + leadFunnel.

## Exports (1)

- `class ReportService`
    - `constructor(private agencyId: AgencyId, private campaigns: CampaignService, private leads: LeadService)`
    - `async campaignSnapshot(args: { from: number; to: number }): Promise<CampaignSnapshot>`
    - `async leadFunnel(args: { from: number; to: number }): Promise<LeadFunnel>`
    - `async campaignLeadStats(campaignId: string): Promise<{ total: number; converted: number; conversionRate: number }>`

## Depends on (4)

- [`src/built-ins/modules/agency-marketing/src/lib/domain.ts`](../lib/domain.md)
- [`src/built-ins/modules/agency-marketing/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/agency-marketing/src/server/campaigns.ts`](./campaigns.md)
- [`src/built-ins/modules/agency-marketing/src/server/leads.ts`](./leads.md)

## Used by (1)

- [`src/built-ins/modules/agency-marketing/src/server/index.ts`](./index.md)

