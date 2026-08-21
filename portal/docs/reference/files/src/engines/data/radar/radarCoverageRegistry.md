# `src/engines/data/radar/radarCoverageRegistry.ts`

← [File index](../../../../../files-index.md) · Area: Other

_No file-level doc-comment. Purpose inferred from its path (Other) and its exports below._

## Exports (5)

- `interface RadarCoverageTemplate (6 members)`
- `RADAR_COVERAGE_TEMPLATES: Record<RadarCoverageEntityType | "generic", RadarCoverageTemplate>`
- `coverageTemplateFor(type: string): RadarCoverageTemplate`
- `interface RadarCoverageInputEntity (4 members)`
- `resolveRadarCoverage(entities: readonly RadarCoverageInputEntity[]): RadarCoverageManifest`

## Depends on (1)

- [`src/engines/data/radar/businessRadar.ts`](./businessRadar.md)

## Used by (2)

- [`scripts/smoke-radar-coverage-seeding.test.ts`](../../../../scripts/smoke-radar-coverage-seeding.test.md)
- [`src/engines/data/server/radar/businessIssueRadar.ts`](../server/radar/businessIssueRadar.md)

