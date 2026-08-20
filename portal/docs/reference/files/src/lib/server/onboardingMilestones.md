# `src/lib/server/onboardingMilestones.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (9)

- `interface Milestone (2 members)`
- `interface MilestoneState (3 members)`
- `type OnboardingProgressMap`
- `AQUA_PHASE_ORDER: ClientStage[]`
- `AQUA_MILESTONES: Record<ClientStage, Milestone[]>`
- `isAquaStage(stage: ClientStage): boolean`
- `getMilestoneState(client: Client, phaseStage: ClientStage): MilestoneState[]`
- `isPhaseComplete(client: Client, phaseStage: ClientStage): boolean`
- `tickMilestone(current: OnboardingProgressMap | undefined, phaseStage: ClientStage, milestoneId: string, done: boolean): OnboardingProgressMap`

## Depends on (1)

- [`src/server/types.ts`](../../server/types.md)

## Used by (2)

- [`src/app/api/tenants/onboarding-tick/route.ts`](../../app/api/tenants/onboarding-tick/route.md)
- [`src/app/portal/clients/[clientId]/page.tsx`](../../app/portal/clients/[clientId]/page.md)

