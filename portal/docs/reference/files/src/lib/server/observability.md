# `src/lib/server/observability.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (8)

- `interface ObservabilityBreadcrumb (5 members)`
- `type ApiHandler`
- `captureError(err: unknown, breadcrumb?: ObservabilityBreadcrumb): void`
- `recordBreadcrumb(message: string, data?: Record<string, unknown>): void`
- `withApiObservability(handler: ApiHandler, options: { route: string; /** Optional resolver — runs against (req, ctx) to derive tenancy. */ resolveBreadcrumb?: (req: Request, ctx?: unknown) => ObservabilityBreadcrumb | undefined; }): ApiHand…`
- `setSessionScope(breadcrumb: ObservabilityBreadcrumb): void`
- `isObservabilityConfigured(): boolean`
- `async flushObservability(timeoutMs = 2000): Promise<void>`

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

