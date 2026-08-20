# `src/lib/server/devConsoleStatus.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (11)

- `ACTIVE_WORKER_WINDOW_MS`
- `interface DevConsoleBadge (4 members)`
- `interface DevConsoleFinding (5 members)`
- `interface DevConsoleBlocker (2 members)`
- `interface DevConsoleWorker (5 members)`
- `interface DevConsoleCore (2 members)`
- `interface DevConsoleStatus (2 members)`
- `devConsoleCore(now = Date.now()): Promise<DevConsoleCore>`
- `async devConsoleBadge(now = Date.now()): Promise<DevConsoleBadge>`
- `invalidateDevConsoleBadge(): void`
- `devConsoleStatus(now = Date.now()): Promise<DevConsoleStatus>`

## Depends on (3)

- [`src/lib/server/devDocs.ts`](./devDocs.md)
- [`src/lib/server/devTeamFindings.ts`](./devTeamFindings.md)
- [`src/lib/server/devTeamWorkers.ts`](./devTeamWorkers.md)

## Used by (5)

- [`scripts/smoke-dev-console-topbar.test.ts`](../../../scripts/smoke-dev-console-topbar.test.md)
- [`src/app/api/portal/dev-team/console/route.ts`](../../app/api/portal/dev-team/console/route.md)
- [`src/components/chrome/DevConsoleButton.tsx`](../../components/chrome/DevConsoleButton.md)
- [`src/components/chrome/DevConsoleControl.tsx`](../../components/chrome/DevConsoleControl.md)
- [`src/components/chrome/DevConsolePanel.tsx`](../../components/chrome/DevConsolePanel.md)

