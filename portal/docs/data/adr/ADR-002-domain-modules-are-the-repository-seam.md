# ADR-002 — The existing server domain modules ARE the repository seam

**Status:** accepted, 2026-08-30.

## Context

The target architecture requires application code not to depend on storage
layout, so collections can extract from the PortalState blob into tables
without touching routes. One option was a new `repositories/` abstraction
layer wrapping `getState()/mutate()`.

## Decision

No new layer. The existing server domain modules (`server/tenants.ts`,
`persons.ts`, `users.ts`, `accessControl.ts`, …) are declared the repository
seam: they are already the only sanctioned readers/writers of their
collections ("every list/get MUST accept agencyId… there is no global list
helper"), routes already consume their exported functions, and the storage
backends are already abstracted beneath them. A parallel abstraction would
duplicate 40+ modules' surfaces for zero behavioural gain — exactly the
duplication `hazards-and-duplication.md` exists to prevent.

The contract this ADR adds: **a collection may change its storage layout only
behind its module's exported functions.** A module that still leaks raw
PortalState shape across its boundary gets tightened when (not before) its
slice migrates, with repository contract tests run against every supported
backend at that point.

## Consequences

- Extraction phases (MIGRATION-PLAN 1–6) are module-internal changes plus
  backfills; routes and UI stay untouched — the strangler requirement.
- No big-bang refactor risk now; the cost moves into each slice, where the
  parity tests already have to exist.
