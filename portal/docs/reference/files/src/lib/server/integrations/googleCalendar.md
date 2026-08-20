# `src/lib/server/integrations/googleCalendar.ts`

← [File index](../../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (13)

- `type CommandCalendarConnectionView`
- `interface CommandCalendarIntegrationSnapshot (4 members)`
- `readGoogleCalendarConfig(redirectFallback?: string): GoogleCalendarConfig | null`
- `getCommandCalendarIntegrationSnapshot(agencyId: string, ownerUserId: string): CommandCalendarIntegrationSnapshot`
- `buildGoogleCalendarAuthorizeUrl(config: GoogleCalendarConfig, input: { agencyId: string; userId: string; returnUrl?: string; secret: string }): string`
- `verifyGoogleCalendarState(state: string, secret: string): { ok: true; value: OAuthState } | { ok: false; error: string }`
- `async connectGoogleCalendarAccount(input: { agencyId: string; ownerUserId: string; code: string; config: GoogleCalendarConfig; fetchImpl?: typeof fetch; }): Promise<CommandCalendarIntegrationSnapshot>`
- `async syncGoogleCalendars(agencyId: string, ownerUserId: string, connectionId?: string): Promise<CommandCalendarIntegrationSnapshot>`
- `async createGoogleCalendarEvent(input: { agencyId: string; ownerUserId: string; sourceId: string; title: string; notes?: string; startsAt: number; endsAt?: number; allDay: boolean; fetchImpl?: typeof fetch; }): Promise<CommandCalendarInteg…`
- `async syncGoogleCalendarConnection(agencyId: string, ownerUserId: string, connectionId: string, deps: { config: GoogleCalendarConfig; fetchImpl?: typeof fetch }): Promise<void>`
- `updateCommandCalendarSourceSelection(agencyId: string, ownerUserId: string, selectedSourceIds: string[]): CommandCalendarIntegrationSnapshot`
- `disconnectGoogleCalendar(agencyId: string, ownerUserId: string, connectionId: string): boolean`
- `normaliseGoogleEvent(item: GoogleEventItem, connection: CommandCalendarConnection, source: CommandCalendarSource, now = Date.now()): CommandCalendarExternalEvent | null`

## Depends on (5)

- [`src/lib/server/calendarVault.ts`](../calendarVault.md)
- [`src/lib/server/integrations/oauthGoogle.ts`](./oauthGoogle.md)
- [`src/server/activity.ts`](../../../server/activity.md)
- [`src/server/storage.ts`](../../../server/storage.md)
- [`src/server/types.ts`](../../../server/types.md)

## Used by (8)

- [`scripts/smoke-google-command-calendar.test.ts`](../../../../scripts/smoke-google-command-calendar.test.md)
- [`src/app/api/portal/calendar/connections/route.ts`](../../../app/api/portal/calendar/connections/route.md)
- [`src/app/api/portal/calendar/google/callback/route.ts`](../../../app/api/portal/calendar/google/callback/route.md)
- [`src/app/api/portal/calendar/google/events/route.ts`](../../../app/api/portal/calendar/google/events/route.md)
- [`src/app/api/portal/calendar/google/start/route.ts`](../../../app/api/portal/calendar/google/start/route.md)
- [`src/app/api/portal/calendar/sync/route.ts`](../../../app/api/portal/calendar/sync/route.md)
- [`src/app/portal/agency/actions/_ActionsPage.tsx`](../../../app/portal/agency/actions/_ActionsPage.md)
- [`src/app/portal/agency/page.tsx`](../../../app/portal/agency/page.md)

