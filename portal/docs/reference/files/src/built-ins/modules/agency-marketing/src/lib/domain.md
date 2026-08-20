# `src/built-ins/modules/agency-marketing/src/lib/domain.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Agency-marketing domain. Persisted under per-install plugin storage.  Scope: per-agency. All three entities carry `agencyId`. No `clientId` field on Campaign/Lead/EmailTemplate — marketing is the agency's own outbound activity to drive new client acquisition + nurture.

## Exports (52)

- `type CampaignChannel`
- `type CampaignStatus`
- `type CampaignKpi`
- `type Currency`
- `interface Campaign (16 members)`
- `interface CreateCampaignInput (10 members)`
- `interface UpdateCampaignPatch (12 members)`
- `type MarketingAssetKind`
- `type MarketingAssetStatus`
- `type FunnelFormat`
- `type FunnelStepKind`
- `interface FunnelStep (6 members)`
- `interface FunnelWorkspaceConfig (18 members)`
- `interface MarketingAsset (21 members)`
- `interface CreateMarketingAssetInput (17 members)`
- `type UpdateMarketingAssetPatch`
- `MARKETING_CUSTOMER_PROFILES_KEY`
- `type MarketingCustomerProfileStatus`
- `type MarketingAudienceType`
- `type MarketingCustomerProfilePriority`
- `type MarketingEvidenceConfidence`
- `interface MarketingCustomerProfile (36 members)`
- `interface CreateMarketingCustomerProfileInput (32 members)`
- `type UpdateMarketingCustomerProfilePatch`
- `type LeadSource`
- `type LeadStatus`
- `interface LeadContactNote (3 members)`
- `interface Lead (14 members)`
- `interface CreateLeadInput (7 members)`
- `interface UpdateLeadPatch (7 members)`
- `type EmailTemplateCategory`
- `type EmailTemplateStatus`
- `interface EmailTemplate (11 members)`
- `interface CreateTemplateInput (5 members)`
- `interface UpdateTemplatePatch (6 members)`
- `interface CampaignFilter (3 members)`
- `interface LeadFilter (4 members)`
- `interface TemplateFilter (2 members)`
- `interface CampaignSnapshot (6 members)`
- `interface LeadFunnel (11 members)`
- `type ContentItemStatus`
- `interface ContentItem (12 members)`
- `interface CreateContentItemInput (7 members)`
- `interface UpdateContentItemPatch (7 members)`
- `interface ContentItemFilter (5 members)`
- `interface CalendarBucket (2 members)`
- `interface CalendarWindow (4 members)`
- `type TouchpointType`
- `interface Touchpoint (10 members)`
- `interface CreateTouchpointInput (7 members)`
- `interface TouchpointFilter (6 members)`
- `interface PerformanceSummary (7 members)`

## Depends on (1)

- [`src/built-ins/modules/agency-marketing/src/lib/tenancy.ts`](./tenancy.md)

## Used by (16)

- [`scripts/smoke-customer-profile-scope.test.ts`](../../../../../../scripts/smoke-customer-profile-scope.test.md)
- [`src/app/portal/agency/marketing/_CustomerProfilesWorkspace.tsx`](../../../../../app/portal/agency/marketing/_CustomerProfilesWorkspace.md)
- [`src/app/portal/agency/marketing/_FunnelsWorkspace.tsx`](../../../../../app/portal/agency/marketing/_FunnelsWorkspace.md)
- [`src/app/portal/agency/marketing/page.tsx`](../../../../../app/portal/agency/marketing/page.md)
- [`src/app/portal/agency/you-deserve-it/page.tsx`](../../../../../app/portal/agency/you-deserve-it/page.md)
- [`src/built-ins/modules/agency-marketing/src/api/handlers-customer-profiles.ts`](../api/handlers-customer-profiles.md)
- [`src/built-ins/modules/agency-marketing/src/api/handlers-r008.ts`](../api/handlers-r008.md)
- [`src/built-ins/modules/agency-marketing/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/agency-marketing/src/server/campaigns.ts`](../server/campaigns.md)
- [`src/built-ins/modules/agency-marketing/src/server/content.ts`](../server/content.md)
- [`src/built-ins/modules/agency-marketing/src/server/leads.ts`](../server/leads.md)
- [`src/built-ins/modules/agency-marketing/src/server/reports.ts`](../server/reports.md)
- [`src/built-ins/modules/agency-marketing/src/server/templates.ts`](../server/templates.md)
- [`src/built-ins/modules/agency-marketing/src/server/touchpoints.ts`](../server/touchpoints.md)
- [`src/lib/customerProfileScope.ts`](../../../../../lib/customerProfileScope.md)
- [`src/lib/server/commandIntelligence.ts`](../../../../../lib/server/commandIntelligence.md)

