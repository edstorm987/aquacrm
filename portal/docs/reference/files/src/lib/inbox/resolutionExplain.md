# `src/lib/inbox/resolutionExplain.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** What to show when there is nothing to press. Plenty of alerts cannot be resolved on screen: chasing a client for a decision, renewing insurance, waiting for somebody to sign in. Pointing a ring at a control that does not exist is worse than saying nothing, and "complete the action on this page" is a lie when the action happens off-system. So for those, give the operator what they actually need to act: why it fired, what the evidence is, and — most importantly — the observable thing that will make it stop firing. Without that last part an alert with no button reads as broken, and gets dismissed rather than dealt with.

## Exports (7)

- `interface ResolutionRecordLink (2 members)`
- `type ResolutionKind`
- `interface ResolutionExplain (9 members)`
- `resolutionKindOf(alert: { id: string; kind?: ResolutionKind; clearsWhen?: string; }): { clearsWhen?: string; kind: ResolutionKind }`
- `clearanceFor(alertId: string): { clearsWhen?: string; kind: ResolutionKind }`
- `plainMeaningFor(title: string, detail: string, evidence = ""): { plainMeaning?: string; weakEvidence?: string; }`
- `alertAge(occurredAt: number, now: number): string`

## Used by (13)

- [`scripts/smoke-alert-classification.test.ts`](../../../scripts/smoke-alert-classification.test.md)
- [`scripts/smoke-every-action-classified.test.ts`](../../../scripts/smoke-every-action-classified.test.md)
- [`scripts/smoke-radar-evidence.test.ts`](../../../scripts/smoke-radar-evidence.test.md)
- [`scripts/smoke-resolution-explain.test.ts`](../../../scripts/smoke-resolution-explain.test.md)
- [`src/app/portal/agency/actions/_ActionsWorkspace.tsx`](../../app/portal/agency/actions/_ActionsWorkspace.md)
- [`src/components/attention/AttentionControls.tsx`](../../components/attention/AttentionControls.md)
- [`src/components/attention/DeferralNote.tsx`](../../components/attention/DeferralNote.md)
- [`src/components/attention/ResolutionBanner.tsx`](../../components/attention/ResolutionBanner.md)
- [`src/lib/advisor/advisorActions.ts`](../advisor/advisorActions.md)
- [`src/lib/inbox/resolutionFocus.ts`](./resolutionFocus.md)
- [`src/lib/intelligence/businessRecommendedActions.ts`](../intelligence/businessRecommendedActions.md)
- [`src/lib/intelligence/operationalAttention.ts`](../intelligence/operationalAttention.md)
- [`src/lib/server/resolutionPlans.ts`](../server/resolutionPlans.md)

