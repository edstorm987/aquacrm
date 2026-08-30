# ADR-001 — The semantic layer lives in code, enforced by tests

**Status:** accepted, 2026-08-30.

## Context

AquaCRM had selective semantics: excellent doc comments in `types.ts`, module
headers stating boundaries (persons vs people), and prose chapters — but no
single registry, and nothing failed when a new collection, metric or metadata
key shipped without declared ownership, tenancy or sensitivity. Prose-only
semantic layers rot; the repo's own history shows docs drifting from source
("the DDL does not exist" incident, 2026-08-20).

## Decision

The authoritative semantic layer is three pure, client-safe TypeScript
modules — `semanticRegistry.ts`, `metricRegistry.ts`,
`metadataContracts.ts` — each paired with a smoke test that mechanically ties
it to the code it describes: exact set-equality against
`createEmptyPortalState()`, id extraction from the metric-defining source
files, and a source-tree scan for metadata key accesses. Markdown under
`docs/data/` is a generated-quality prose view; where they disagree, the
registry wins.

## Consequences

- A new collection/metric/metadata key cannot ship unclassified — the suite
  fails with instructions naming the one place to add it.
- The registries never restate formulas or types (no second source of
  truth): they add what code cannot carry (definitions, grain, tenancy,
  sensitivity, retention, overlap links) and *point at* the authority.
- Cost: touching those surfaces means one extra registry entry per change.
  Accepted — that is the governance working.
