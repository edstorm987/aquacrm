// The realm runtime cache has a ceiling, and it never drops unsaved work.
//
// `realmRuntimes` (src/server/storage.ts) was insert-only: every realm a warm
// process touched kept a fully parsed PortalState alive for the life of that
// process. With one live realm and a few sandboxes that was free.
//
// Ed, 2026-08-30, wants a WRITABLE sandbox per demo visitor — "its like there
// own sandbox ... i dont want to clog the database with it either but id want
// them to create portals customers projects". Per-visitor realms are what keeps
// their writes out of the 3.25 MB live document entirely. But a realm per
// visitor turns an insert-only cache into a leak with a queue feeding it: a
// ~250 KB document parses to roughly 1-3 MB of heap, so a warm instance would
// fall over in the low hundreds.
//
// The dangerous half of any eviction policy is evicting something dirty. These
// tests exist for that, not for the cap.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(ROOT, "src/server/storage.ts"), "utf8");

describe("the realm runtime cache is bounded", () => {
  it("has a cap at all", () => {
    assert.match(source, /const MAX_REALM_RUNTIMES = \d+/,
      "realmRuntimes is unbounded again — a realm per demo visitor is a memory leak");
  });

  it("never evicts a realm that still owes a write", () => {
    // All four conditions matter. A realm with a scheduled flush, a flush in
    // flight, queued patch operations, or a mutationVersion ahead of what was
    // persisted is holding data that exists NOWHERE else.
    const guard = source.slice(source.indexOf("function realmRuntimeIsEvictable"));
    const body = guard.slice(0, guard.indexOf("\n}"));
    for (const condition of [
      "flushTimer === null",
      "flushInFlight === null",
      "pendingPatchOperations.length === 0",
      "mutationVersion === runtime.persistedVersion",
    ]) {
      assert.ok(body.includes(condition),
        `eviction no longer checks ${condition}, so a realm can be dropped mid-write`);
    }
  });

  it("never evicts the live realm or the one being served", () => {
    const evict = source.slice(source.indexOf("function evictColdRealmRuntimes"));
    const body = evict.slice(0, evict.indexOf("\n}\n"));
    assert.match(body, /realmId === keepRealmId \|\| realmId === LIVE_DATA_REALM_ID/,
      "the active or live realm can now be evicted — the active one would re-hydrate mid-request");
    assert.match(body, /if \(!realmRuntimeIsEvictable\(runtime\)\) continue/,
      "eviction no longer skips dirty runtimes");
  });

  it("holds memory rather than dropping data when every realm is dirty", () => {
    // The tempting "if we still cannot get under the cap, drop the oldest
    // anyway" fallback trades a visitor's data for heap. It must not exist.
    const evict = source.slice(source.indexOf("function evictColdRealmRuntimes"));
    const body = evict.slice(0, evict.indexOf("\n}\n"));
    assert.doesNotMatch(body, /realmRuntimes\.delete\([^)]*\);[\s\S]{0,200}break/,
      "a force-drop fallback was added — that loses unsaved visitor data to save heap");
  });

  it("keeps the map in least-recently-used order", () => {
    // Map iteration is insertion order, so a cache HIT must re-insert or the
    // policy evicts by age-of-first-touch instead of by recency — which would
    // drop the busiest realm.
    const touch = source.slice(source.indexOf("function realmRuntime("));
    const body = touch.slice(0, touch.indexOf("\n}"));
    assert.match(body, /realmRuntimes\.delete\(valid\);\s*\n\s*realmRuntimes\.set\(valid, existing\);/,
      "a cache hit no longer refreshes recency, so eviction is by first touch not last use");
  });
});
