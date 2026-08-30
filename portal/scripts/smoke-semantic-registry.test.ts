// The semantic registry's enforcement half.
//
// The registry (`lib/data/semanticRegistry.ts`) is only worth having if it
// cannot drift from the system it describes. These tests make the two
// load-bearing claims mechanical:
//
//   1. EVERY PortalState collection is classified — a new collection cannot
//      ship without a declared owner entity, plane and note. The comparison
//      is exact set equality against `createEmptyPortalState()` (plus the
//      one optional key `parseBlob` carries), so a retired collection cannot
//      linger here either.
//   2. The registry is internally coherent: unique ids, resolvable
//      relationships, and retention documented wherever personal data is
//      classified.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PORTAL_STATE_COVERAGE,
  SEMANTIC_DISTINCTIONS,
  SEMANTIC_ENTITIES,
  semanticEntityIds,
} from "../src/lib/data/semanticRegistry";
import { createEmptyPortalState } from "../src/server/storage";

/** Optional PortalState keys that `parseBlob` round-trips but `empty()` omits. */
const OPTIONAL_STATE_KEYS = ["radarInfraHealth"] as const;

test("every PortalState collection is classified in the semantic registry — exactly", () => {
  const stateKeys = new Set(Object.keys(createEmptyPortalState()));
  for (const key of OPTIONAL_STATE_KEYS) stateKeys.add(key);
  const coverageKeys = new Set(Object.keys(PORTAL_STATE_COVERAGE));

  const unclassified = [...stateKeys].filter(key => !coverageKeys.has(key)).sort();
  const stale = [...coverageKeys].filter(key => !stateKeys.has(key)).sort();

  assert.deepEqual(
    unclassified,
    [],
    `PortalState collections with no semantic classification: ${unclassified.join(", ")}. ` +
      "Add each to PORTAL_STATE_COVERAGE with its owning entity, plane and note.",
  );
  assert.deepEqual(
    stale,
    [],
    `PORTAL_STATE_COVERAGE names collections PortalState no longer has: ${stale.join(", ")}.`,
  );
});

test("entity ids are unique and every referenced entity exists", () => {
  const ids = semanticEntityIds();
  assert.equal(new Set(ids).size, ids.length, "duplicate semantic entity id");

  const known = new Set(ids);
  for (const entity of SEMANTIC_ENTITIES) {
    for (const relationship of entity.relationships) {
      assert.ok(
        known.has(relationship.to),
        `${entity.id} relates to unknown entity "${relationship.to}" via ${relationship.via}`,
      );
    }
  }
  for (const [key, classification] of Object.entries(PORTAL_STATE_COVERAGE)) {
    if (classification.entity) {
      assert.ok(known.has(classification.entity), `coverage for "${key}" names unknown entity "${classification.entity}"`);
    }
  }
  for (const distinction of SEMANTIC_DISTINCTIONS) {
    assert.ok(known.has(distinction.a), `distinction names unknown entity "${distinction.a}"`);
    assert.ok(known.has(distinction.b), `distinction names unknown entity "${distinction.b}"`);
  }
});

test("personal data always states its retention and tenancy", () => {
  for (const entity of SEMANTIC_ENTITIES) {
    assert.ok(entity.definition.trim().length >= 20, `${entity.id}: definition too thin to be canonical`);
    assert.ok(entity.retention.trim().length > 0, `${entity.id}: retention must be stated`);
    if (["personal", "sensitive-personal", "credential"].includes(entity.sensitivity)) {
      assert.notEqual(
        entity.retention.trim().toLowerCase(),
        "n/a — code-defined.",
        `${entity.id} carries ${entity.sensitivity} data and must state real retention behaviour`,
      );
      // integrationEvent is the one deliberate exception: webhook payloads
      // arrive BEFORE tenant resolution (inbox_webhook_events has no agency
      // column), are service-role-only by grant, and are retention-pruned.
      // Anything else carrying personal data must be tenant-scoped.
      assert.ok(
        entity.tenancy !== "global" || entity.id === "integrationEvent",
        `${entity.id}: ${entity.sensitivity} data should not be tenancy-global`,
      );
    }
  }
});

test("every entity declares where its truth lives and how records originate", () => {
  for (const entity of SEMANTIC_ENTITIES) {
    assert.ok(entity.sourceOfTruth.trim().length > 0, `${entity.id}: sourceOfTruth missing`);
    assert.ok(entity.provenance.trim().length > 0, `${entity.id}: provenance missing`);
    assert.ok(entity.idRule.trim().length > 0, `${entity.id}: idRule missing`);
  }
});
