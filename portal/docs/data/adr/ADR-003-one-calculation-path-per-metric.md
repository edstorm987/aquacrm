# ADR-003 — One calculation path per metric, registry as identity, dedup by parity

**Status:** accepted, 2026-08-30.

## Context

Nine-plus business quantities are computed in 2–4 places; two duplicates have
genuinely different semantics (a hardcoded 5-minute SLA vs the configured
guardrail; forms-vs-conversions numerators); `campaign-roas` collides in the
flat descriptor id space with different rounding on each side. Deleting the
"wrong" copies immediately would change numbers users see and break saved
custom-KPI definitions — the destructive rewrite this project forbids.

## Decision

1. `metricRegistry.ts` assigns every metric one `canonicalId`
   (`<kind>:<id>`) and names one `computedBy` authority; competing
   calculations are linked as `same-quantity` overlaps rather than deleted.
2. The existing collision is pinned (`KNOWN_DESCRIPTOR_ID_COLLISIONS`); any
   NEW bare-id collision fails the suite.
3. Golden boundary tests pin the current canonical behaviour (SLA boundary
   inclusive, 14-day staleness inclusive, decision denominators, even-count
   medians, >100% directional ratios, null-not-Infinity on zero spend).
4. Dedup happens in MIGRATION-PLAN Phase 7, one quantity at a time: golden
   parity first, then consumers move to the canonical path, then the
   duplicate retires. `formulaText` strings must state the real calculation
   (the `business-health` incident-blend omission is the cautionary case,
   fixed with this ADR).

## Consequences

- Dashboards keep today's numbers until a recorded, tested switch — no
  silent changes.
- The registry cannot rot: set equality against the defining source files is
  enforced, so "remove a competing calculation" shows up as a registry diff
  reviewers can see.
