# `src/lib/inbox/resolutionEvidence.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** The actual records that tripped a check, pulled in rather than linked to. "Evidence" that navigates you to a list and leaves you to find the row is barely better than no button: on a long list the thing you were sent to see has scrolled off, and you end up reconstructing why the alert fired at all. So the records come to the alert. Enough of each one to decide without leaving, and a link for when you do want the full thing.

## Exports (6)

- `interface EvidenceField (3 members)`
- `interface EvidenceSeriesPoint (3 members)`
- `interface EvidenceSeries (5 members)`
- `interface EvidenceRecord (6 members)`
- `interface EvidenceStep (3 members)`
- `interface ResolutionEvidence (5 members)`

## Used by (5)

- [`src/components/attention/EvidenceCard.tsx`](../../components/attention/EvidenceCard.md)
- [`src/components/attention/MetricSparkline.tsx`](../../components/attention/MetricSparkline.md)
- [`src/lib/advisor/advisorActions.ts`](../advisor/advisorActions.md)
- [`src/lib/inbox/evidenceSteps.ts`](./evidenceSteps.md)
- [`src/lib/server/resolutionPlans.ts`](../server/resolutionPlans.md)

