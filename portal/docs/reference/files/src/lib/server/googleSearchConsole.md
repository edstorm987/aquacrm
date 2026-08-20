# `src/lib/server/googleSearchConsole.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (2)

- `async testGoogleSearchConsole(values: Record<string, string>, fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<string>`
- `async fetchGoogleSearchConsoleEvents(values: Record<string, string>, options: { startDate: string; endDate: string; rowLimit?: number; fetchImpl?: typeof fetch; signal?: AbortSignal; }): Promise<PerformanceEvent[]>`

## Depends on (1)

- [`src/lib/performanceAnalytics.ts`](../performanceAnalytics.md)

## Used by (2)

- [`src/app/api/portal/performance/search-console/route.ts`](../../app/api/portal/performance/search-console/route.md)
- [`src/lib/server/integrationConnections.ts`](./integrationConnections.md)

