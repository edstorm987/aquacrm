# `src/lib/radarCoverageRegistry.ts`

← [File index](../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (5)

- `interface RadarCoverageTemplate (6 members)`
- `RADAR_COVERAGE_TEMPLATES: Record<RadarCoverageEntityType | "generic", RadarCoverageTemplate>`
- `coverageTemplateFor(type: string): RadarCoverageTemplate`
- `interface RadarCoverageInputEntity (4 members)`
- `resolveRadarCoverage(entities: readonly RadarCoverageInputEntity[]): RadarCoverageManifest`

## Depends on (1)

- [`src/lib/businessRadar.ts`](./businessRadar.md)

## Used by (2)

- [`scripts/smoke-radar-coverage-seeding.test.ts`](../../scripts/smoke-radar-coverage-seeding.test.md)
- [`src/lib/server/businessIssueRadar.ts`](./server/businessIssueRadar.md)

