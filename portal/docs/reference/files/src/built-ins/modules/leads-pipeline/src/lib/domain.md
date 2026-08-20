# `src/built-ins/modules/leads-pipeline/src/lib/domain.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Domain types for the leads-pipeline plugin.  `Lead` and `Contact` are sibling records. A `Lead` is a marketing intake row (someone we want to convert); a `Contact` is the broader person record — `type: "lead"` mirrors the lead, `"customer"` after promotion (Pipeline-card moved to a "Won" column), `"vendor"` for supplier rolodex use. Promotion lifts the lead row to a Contact (idempotent on canonical email) and stamps `lastContactedAt`.  `LeadCard` is the thin projection T1's `PipelineCard` discriminated union accepts as `kind: "lead"` snapshot data — same shape as the `LeadSnapshot` declared in the foundation's pipelines.ts (R034).  All emails are stored in canonical (lowercased+trimmed) form so the CSV-import idempotency check + AudienceFilter resolution stay O(1).

## Exports (63)

- `type CustomFieldType`
- `type CustomFieldValue`
- `type CommercialPartyKind`
- `type BillingCadence`
- `type CommercialDocumentStatus`
- `type CommercialPaymentMethod`
- `type MeetingMode`
- `type MeetingStatus`
- `type MeetingAttemptChannel`
- `type MeetingAttemptOutcome`
- `LEAD_RELATIONSHIP_CATEGORIES`
- `type LeadRelationshipCategory`
- `LEAD_RELATIONSHIP_CATEGORY_LABELS: Record<LeadRelationshipCategory, string>`
- `isLeadRelationshipCategory(value: unknown): value is LeadRelationshipCategory`
- `inferLeadRelationshipCategory(value: { relationshipCategory?: unknown; source?: string; tags?: string[]; }): LeadRelationshipCategory`
- `interface MeetingAttempt (5 members)`
- `interface SalesPresentation (3 members)`
- `interface CommercialLineItem (3 members)`
- `interface CommercialPayment (6 members)`
- `interface CommercialPack (38 members)`
- `interface SaveCommercialPackInput (20 members)`
- `interface CustomFieldDefinition (6 members)`
- `type ProspectStatus`
- `type ProspectQualificationState`
- `type ProspectOutreachChannel`
- `type ProspectOutreachOutcome`
- `type ProspectInspectionCheck`
- `type ProspectFollowUpStatus`
- `interface ProspectOutreachAttempt (8 members)`
- `interface ProspectNote (4 members)`
- `interface ProspectFollowUp (9 members)`
- `interface Prospect (35 members)`
- `interface CreateProspectInput (25 members)`
- `interface UpdateProspectPatch (27 members)`
- `interface RecordProspectOutreachInput (6 members)`
- `interface ScheduleProspectFollowUpInput (3 members)`
- `interface ResolveProspectFollowUpInput (3 members)`
- `type LeadJourneyEventType`
- `interface LeadJourneyEvent (13 members)`
- `interface Lead (51 members)`
- `interface CreateLeadInput (14 members)`
- `interface UpdateLeadPatch (35 members)`
- `interface LeadFilter (5 members)`
- `interface LeadCard (5 members)`
- `projectLeadCard(lead: Lead): LeadCard`
- `type ContactType`
- `interface Contact (41 members)`
- `interface CreateContactInput (34 members)`
- `interface UpdateContactPatch (28 members)`
- `interface ContactFilter (3 members)`
- `type CampaignStatus`
- `type CampaignChannel`
- `type CampaignKind`
- `type CampaignPlacement`
- `interface CampaignCreativeAsset (5 members)`
- `interface CampaignCreative (14 members)`
- `interface CampaignStep (7 members)`
- `interface AudienceFilter (5 members)`
- `interface Campaign (30 members)`
- `interface CreateCampaignInput (21 members)`
- `interface UpdateCampaignPatch (22 members)`
- `interface CsvImportResult (4 members)`
- `CSV_COLUMN_VARIANTS: Record<string, "email" | "name" | "phone" | "company" | "tags" | "source" | "notes" | "website" | "address" | "googleMapsUrl" | "niche">`

## Depends on (1)

- [`src/built-ins/modules/leads-pipeline/src/lib/tenancy.ts`](./tenancy.md)

## Used by (21)

- [`scripts/smoke-client-match.test.ts`](../../../../../../scripts/smoke-client-match.test.md)
- [`scripts/smoke-commercial-intelligence.test.ts`](../../../../../../scripts/smoke-commercial-intelligence.test.md)
- [`scripts/smoke-lead-relationship-categories.test.ts`](../../../../../../scripts/smoke-lead-relationship-categories.test.md)
- [`scripts/smoke-lead-wait-tracing.test.ts`](../../../../../../scripts/smoke-lead-wait-tracing.test.md)
- [`src/app/portal/agency/leads-pipeline/contacts/_ContactsWorkspace.tsx`](../../../../../app/portal/agency/leads-pipeline/contacts/_ContactsWorkspace.md)
- [`src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx`](../../../../../app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.md)
- [`src/app/portal/clients/_PeopleHub.tsx`](../../../../../app/portal/clients/_PeopleHub.md)
- [`src/app/portal/clients/page.tsx`](../../../../../app/portal/clients/page.md)
- [`src/built-ins/modules/leads-pipeline/src/__smoke__/leads-pipeline.test.ts`](../__smoke__/leads-pipeline.test.md)
- [`src/built-ins/modules/leads-pipeline/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/leads-pipeline/src/lib/clientMatch.ts`](./clientMatch.md)
- [`src/built-ins/modules/leads-pipeline/src/pages/ContactsPage.tsx`](../pages/ContactsPage.md)
- [`src/built-ins/modules/leads-pipeline/src/server/campaigns.ts`](../server/campaigns.md)
- [`src/built-ins/modules/leads-pipeline/src/server/commercial.ts`](../server/commercial.md)
- [`src/built-ins/modules/leads-pipeline/src/server/contacts.ts`](../server/contacts.md)
- [`src/built-ins/modules/leads-pipeline/src/server/csv.ts`](../server/csv.md)
- [`src/built-ins/modules/leads-pipeline/src/server/index.ts`](../server/index.md)
- [`src/built-ins/modules/leads-pipeline/src/server/leads.ts`](../server/leads.md)
- [`src/built-ins/modules/leads-pipeline/src/server/prospects.ts`](../server/prospects.md)
- [`src/lib/commercialIntelligence.ts`](../../../../../lib/commercialIntelligence.md)
- [`src/lib/server/commandIntelligence.ts`](../../../../../lib/server/commandIntelligence.md)

