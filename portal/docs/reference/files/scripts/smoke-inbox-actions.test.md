# `scripts/smoke-inbox-actions.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Inbox + Actions unification smoke.  Pins the merged contract from docs/development/plans/inbox-actions-unification.md: • the Master Inbox tab bar carries an "Actions" tab (view="actions") that renders a server-rendered slot; • inbox/page.tsx feeds that slot with the real AgencyActionsPage; • the sidebar has ONE "Inbox & actions" item, not a separate Actions row; • the old /portal/agency/actions route redirects onto the inbox tab so the many existing links across the app still land correctly.

_No exported symbols (side-effect / internal module)._

## Depends on (1)

- [`src/lib/chrome/sidebarLayout.ts`](../src/lib/chrome/sidebarLayout.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

