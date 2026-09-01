# ADR-004 — Metadata bags are governed and shrunk by namespace, not banned

**Status:** accepted, 2026-08-30.

## Context

`Client.metadata` and its siblings carry 124 distinct keys, including whole
subsystems (the telemetry event stream, payment plans, portal provisioning,
invoice facts). Banning the bag outright would force a big-bang typed-schema
rewrite across hundreds of call sites; leaving it ungoverned keeps growing
undefined contracts with no owner, sensitivity class or deletion behaviour.

## Decision

Every key is contracted in `metadataContracts.ts` (carrier, namespace, type,
sensitivity, owner), and `smoke-metadata-contracts.test.ts` scans the source
tree both ways: an uncatalogued key in code fails, and a catalogued key
nothing touches fails (minus an explicit stored-data allowlist). The
**namespace is the migration unit**: telemetry and finance extract first
(MIGRATION-PLAN Phase 5), contact points with the people slice (Phase 2);
`bespoke` keys survive as a small, named, typed-at-read set.

Versioning: the catalogue itself is version-controlled and test-pinned;
per-key `since`/schema-version stamps are added when a namespace's first
migration needs them, not speculatively.

## Consequences

- The escape hatch closes going forward at zero migration cost today.
- The erasure sweep gains a mechanical PII checklist
  (`personalMetadataKeys()`), pinned so reclassification cannot silently
  drop a key from the sweep.
