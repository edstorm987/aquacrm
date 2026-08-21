# `src/lib/enquiries/leadTiming.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (7)

- `LEAD_WAIT_THRESHOLDS`
- `interface LeadTimingInput (9 members)`
- `type LeadWaitTone`
- `interface LeadTimingSnapshot (12 members)`
- `leadTimingSnapshot(lead: LeadTimingInput, referenceNow = Date.now()): LeadTimingSnapshot`
- `formatElapsed(milliseconds: number): string`
- `averageElapsed(values: Array<number | undefined>): number | undefined`

## Used by (10)

- [`scripts/smoke-lead-wait-tracing.test.ts`](../../../scripts/smoke-lead-wait-tracing.test.md)
- [`src/app/portal/agency/assistant/AssistantWorkspace.tsx`](../../app/portal/agency/assistant/AssistantWorkspace.md)
- [`src/app/portal/agency/inbox/_EnquiryDetailCard.tsx`](../../app/portal/agency/inbox/_EnquiryDetailCard.md)
- [`src/app/portal/agency/inbox/_MasterInbox.tsx`](../../app/portal/agency/inbox/_MasterInbox.md)
- [`src/app/portal/agency/inbox/_SocialInboxWorkspace.tsx`](../../app/portal/agency/inbox/_SocialInboxWorkspace.md)
- [`src/app/portal/agency/inbox/_UnifiedInboxWorkspace.tsx`](../../app/portal/agency/inbox/_UnifiedInboxWorkspace.md)
- [`src/app/portal/agency/leads-pipeline/contacts/_ContactsWorkspace.tsx`](../../app/portal/agency/leads-pipeline/contacts/_ContactsWorkspace.md)
- [`src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx`](../../app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.md)
- [`src/app/portal/agency/pipelines/[slug]/_ScoutingCommand.tsx`](../../app/portal/agency/pipelines/[slug]/_ScoutingCommand.md)
- [`src/engines/data/server/radar/businessIssueRadar.ts`](../../engines/data/server/radar/businessIssueRadar.md)

