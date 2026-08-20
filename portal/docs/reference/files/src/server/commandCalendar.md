# `src/server/commandCalendar.ts`

← [File index](../../../files-index.md) · Area: State layer — src/server/

_No file-level doc-comment. Purpose inferred from its path (State layer — src/server/) and its exports below._

## Exports (6)

- `interface CommandCalendarEntryInput (11 members)`
- `listCommandCalendarEntries(agencyId: string, ownerUserId: string): CommandCalendarEntry[]`
- `listAgencyCommandCalendarEntries(agencyId: string): CommandCalendarEntry[]`
- `createCommandCalendarEntry(agencyId: string, ownerUserId: string, input: CommandCalendarEntryInput): CommandCalendarEntry`
- `updateCommandCalendarEntry(agencyId: string, ownerUserId: string, id: string, input: CommandCalendarEntryInput): CommandCalendarEntry | null`
- `deleteCommandCalendarEntry(agencyId: string, ownerUserId: string, id: string): boolean`

## Depends on (3)

- [`src/server/activity.ts`](./activity.md)
- [`src/server/storage.ts`](./storage.md)
- [`src/server/types.ts`](./types.md)

## Used by (6)

- [`src/app/api/portal/calendar/route.ts`](../app/api/portal/calendar/route.md)
- [`src/app/portal/agency/actions/_ActionsPage.tsx`](../app/portal/agency/actions/_ActionsPage.md)
- [`src/app/portal/agency/page.tsx`](../app/portal/agency/page.md)
- [`src/lib/server/businessIssueRadar.ts`](../lib/server/businessIssueRadar.md)
- [`src/lib/server/operationalAlerts.ts`](../lib/server/operationalAlerts.md)
- [`src/lib/server/radarSourceInspection.ts`](../lib/server/radarSourceInspection.md)

