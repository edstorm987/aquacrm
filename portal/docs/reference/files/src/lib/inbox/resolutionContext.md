# `src/lib/inbox/resolutionContext.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** Resolution context — the "why am I here?" carried across a Resolve click. Pressing Resolve navigates you somewhere else entirely. By the time the page loads, the reason is off-screen: you are looking at a record with no memory of the alert that sent you. This encodes the intent in the URL so the destination can state what you came to do, point at the exact control that does it, and — when the job takes more than one step — show where you are in the sequence. Deliberately URL-carried rather than held in memory: a Resolve link must survive a full page load, a refresh, a bookmark and a shared link.

## Exports (15)

- `RESOLUTION_PARAM`
- `RESOLUTION_FOCUS_PARAM`
- `RESOLUTION_STEP_PARAM`
- `RESOLUTION_RECORD_PARAM`
- `RESOLUTION_FOCUSES`
- `type ResolutionFocus`
- `isResolutionFocus(value: unknown): value is ResolutionFocus`
- `interface ResolutionIntent (4 members)`
- `withResolutionContext(href: string, intent: ResolutionIntent): string`
- `interface ResolutionStep (6 members)`
- `interface ResolutionPlan (3 members)`
- `interface ResolutionProgress (4 members)`
- `resolutionProgress(plan: ResolutionPlan | null): ResolutionProgress`
- `interface ResolutionCopy (2 members)`
- `resolutionCopy(focus: ResolutionFocus | undefined, subject?: string): ResolutionCopy`

## Used by (14)

- [`scripts/smoke-attention-controls.test.ts`](../../../scripts/smoke-attention-controls.test.md)
- [`scripts/smoke-resolution-app-wide.test.ts`](../../../scripts/smoke-resolution-app-wide.test.md)
- [`scripts/smoke-resolution-context.test.ts`](../../../scripts/smoke-resolution-context.test.md)
- [`scripts/smoke-resolution-explain.test.ts`](../../../scripts/smoke-resolution-explain.test.md)
- [`scripts/smoke-resolution-spotlight.test.ts`](../../../scripts/smoke-resolution-spotlight.test.md)
- [`src/app/portal/agency/actions/_ActionsPage.tsx`](../../app/portal/agency/actions/_ActionsPage.md)
- [`src/components/attention/ResolutionBanner.tsx`](../../components/attention/ResolutionBanner.md)
- [`src/components/attention/ResolutionSpotlight.tsx`](../../components/attention/ResolutionSpotlight.md)
- [`src/components/attention/TaskChecklist.tsx`](../../components/attention/TaskChecklist.md)
- [`src/lib/inbox/resolutionFocus.ts`](./resolutionFocus.md)
- [`src/lib/intelligence/operationalAttention.ts`](../intelligence/operationalAttention.md)
- [`src/lib/server/inbox/operationalAlerts.ts`](../server/inbox/operationalAlerts.md)
- [`src/lib/server/resolutionPlans.ts`](../server/resolutionPlans.md)
- [`src/lib/tasks/taskTemplates.ts`](../tasks/taskTemplates.md)

