# `src/components/resource-tools/shared.ts`

← [File index](../../../../files-index.md) · Area: Components — src/components/

**What it is:** T4 R002 — shared helpers for the three real resource tools (seo-audit, site-speed, accessibility-audit). Honest audit primitives only — no fabricated benchmarks, A-F bands not numeric percentages (chapter #68 honesty contract).

## Exports (7)

- `type Band`
- `bandFromCount(passes: number, total: number): Band`
- `bandLabel(b: Band): string`
- `normaliseUrl(raw: string): string | null`
- `interface FetchAttempt (7 members)`
- `async attemptFetch(url: string): Promise<FetchAttempt>`
- `interface CheckResult (4 members)`

## Used by (3)

- [`src/components/resource-tools/AccessibilityAuditTool.tsx`](./AccessibilityAuditTool.md)
- [`src/components/resource-tools/SeoAuditTool.tsx`](./SeoAuditTool.md)
- [`src/components/resource-tools/SiteSpeedTool.tsx`](./SiteSpeedTool.md)

