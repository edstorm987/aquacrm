# `src/app/portal/layout.tsx`

← [File index](../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** /portal/* root layout. Requires session; redirects to /login when missing. Per-scope chrome lives one layer down: agency in /portal/agency/layout.tsx, client in /portal/clients/[clientId]/layout.tsx, end-customer in /portal/customer/layout.tsx.

## Exports (1)

- `default async PortalLayout({ children }: { children: ReactNode })`

## Depends on (9)

- [`src/components/chrome/ClientWorkspaceTransition.tsx`](../../components/chrome/ClientWorkspaceTransition.md)
- [`src/components/chrome/CommandCenterTransition.tsx`](../../components/chrome/CommandCenterTransition.md)
- [`src/components/chrome/DevModeLoadIn.tsx`](../../components/chrome/DevModeLoadIn.md)
- [`src/components/chrome/DevModeSwitcher.tsx`](../../components/chrome/DevModeSwitcher.md)
- [`src/components/chrome/SmartWorkSessionMonitor.tsx`](../../components/chrome/SmartWorkSessionMonitor.md)
- [`src/lib/server/auth.ts`](../../lib/server/auth.md)
- [`src/server/storage.ts`](../../server/storage.md)
- [`src/server/types.ts`](../../server/types.md)
- [`src/server/users.ts`](../../server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

