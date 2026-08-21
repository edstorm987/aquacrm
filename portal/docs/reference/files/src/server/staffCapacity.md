# `src/server/staffCapacity.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (6)

- `interface StaffCapacitySignal (8 members)`
- `interface StaffCapacityHealth (9 members)`
- `interface StaffCapacitySnapshot (6 members)`
- `capacityAreaLabel(areaId: string): string`
- `shapeStaffCapacity(teamChecks: BusinessRadarCheck[], domain: RadarDomainSummary | null): StaffCapacitySnapshot`
- `async staffCapacitySnapshot(agencyId: string, now = Date.now()): Promise<StaffCapacitySnapshot>`

## Depends on (2)

- [`src/engines/data/radar/businessRadar.ts`](../engines/data/radar/businessRadar.md)
- [`src/engines/data/server/radar/businessIssueRadar.ts`](../engines/data/server/radar/businessIssueRadar.md)

## Used by (2)

- [`src/app/portal/agency/people/_PeopleCommand.tsx`](../app/portal/agency/people/_PeopleCommand.md)
- [`src/app/portal/agency/people/page.tsx`](../app/portal/agency/people/page.md)

