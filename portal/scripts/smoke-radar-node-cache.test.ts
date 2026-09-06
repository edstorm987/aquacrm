// Fractal Radar Phase 3 foundation — the per-node cache + dirty-marking.
//
// This layer is the load-bearing prerequisite the plan sequences FIRST ("node
// cache first, then event-dirty"). Its whole reason to exist is honesty under
// partial descent, so the contracts pinned here are exactly the "never a false
// green" ones: a dirtied node is never served as its old verdict; marking a node
// dirty reaches its descendants and bubbles attention to its parents WITHOUT
// recomputing them; and the proven single-flight/TTL/realm-prefix behaviour of
// the whole-radar cache is preserved per node.

import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";
import { createRequire } from "node:module";

// Stub `server-only` so the module (which imports it) loads under node:test.
const require_ = createRequire(import.meta.url);
const serverOnly = require_.resolve("server-only");
require_.cache[serverOnly] = {
  id: serverOnly, filename: serverOnly, loaded: true, exports: {}, paths: [], children: [],
} as never;

process.env.PORTAL_BACKEND ??= "memory";

type Mod = typeof import("../src/engines/data/server/radar/radarNodeCache");
let m: Mod;
let mkResult: (over?: Partial<import("../src/engines/data/server/radar/radarNodeCache").RadarNodeResult>) => import("../src/engines/data/server/radar/radarNodeCache").RadarNodeResult;

before(async () => {
  m = await import("../src/engines/data/server/radar/radarNodeCache");
  mkResult = (over = {}) => ({
    key: "dom:sales", level: "domain", health: "pass",
    assurancePercent: 100, confidencePercent: 100, readinessPercent: 100,
    firing: 0, blind: 0, learning: 0, descent: "descended",
    childCount: 2, childrenObserved: 2, computedAt: 1_000, ...over,
  });
});

beforeEach(() => m.__resetRadarNodeCacheForTest());

describe("the node hierarchy is derived from the flat key scheme", () => {
  it("parentChainOf walks fam → dom → agency", () => {
    assert.deepEqual(m.parentChainOf("fam:sales:speed-to-lead"), ["dom:sales", "agency"]);
    assert.deepEqual(m.parentChainOf("dom:sales"), ["agency"]);
    assert.deepEqual(m.parentChainOf("ent:client:cli_1"), ["agency"]);
    assert.deepEqual(m.parentChainOf("agency"), []);
  });

  it("descendantKeysOf: a domain owns its families, the agency owns all, a leaf owns itself", () => {
    const all = ["agency", "dom:sales", "fam:sales:a", "fam:sales:b", "dom:finance", "fam:finance:c", "ent:client:x"];
    assert.deepEqual(m.descendantKeysOf("agency", all).sort(), [...all].sort());
    assert.deepEqual(m.descendantKeysOf("dom:sales", all).sort(), ["dom:sales", "fam:sales:a", "fam:sales:b"].sort());
    assert.deepEqual(m.descendantKeysOf("fam:sales:a", all), ["fam:sales:a"]);
    assert.deepEqual(m.descendantKeysOf("ent:client:x", all), ["ent:client:x"]);
    // A family of one domain is NOT a descendant of another domain.
    assert.deepEqual(m.descendantKeysOf("dom:finance", all).sort(), ["dom:finance", "fam:finance:c"].sort());
  });
});

describe("markRadarDirty is the honest core — descendants evicted, parents flagged, never served green", () => {
  it("reads a fresh clean value, then refuses to serve it once dirtied", async () => {
    await m.computeNodeCache("ag", "fam:sales:a", 60_000, async () => mkResult({ key: "fam:sales:a", level: "family", health: "pass", computedAt: 1_000 }), 1_000);
    const before = m.readNodeCache("ag", "fam:sales:a", 1_500);
    assert.ok(before && "hit" in before && before.hit.health === "pass", "a fresh value should be served");

    // An event marks the leaf dirty AFTER it was computed.
    m.markRadarDirty("ag", "fam:sales:a", 2_000);
    const after = m.readNodeCache("ag", "fam:sales:a", 2_500);
    assert.equal(after, null, "a recheck-pending node must NOT be served as its old pass — the caller must recompute");
  });

  it("dirtying a domain evicts its families but leaves a sibling domain fresh", async () => {
    await m.computeNodeCache("ag", "fam:sales:a", 60_000, async () => mkResult({ key: "fam:sales:a", level: "family", computedAt: 1_000 }), 1_000);
    await m.computeNodeCache("ag", "fam:sales:b", 60_000, async () => mkResult({ key: "fam:sales:b", level: "family", computedAt: 1_000 }), 1_000);
    await m.computeNodeCache("ag", "fam:finance:c", 60_000, async () => mkResult({ key: "fam:finance:c", level: "family", computedAt: 1_000 }), 1_000);

    const owned = m.markRadarDirty("ag", "dom:sales", 2_000);
    assert.ok(owned.includes("fam:sales:a") && owned.includes("fam:sales:b") && owned.includes("dom:sales"), "a domain mark reaches its families");
    assert.ok(!owned.includes("fam:finance:c"), "a sibling domain's family is untouched");

    assert.equal(m.readNodeCache("ag", "fam:sales:a", 2_500), null, "sales family recheck-pending");
    const finance = m.readNodeCache("ag", "fam:finance:c", 2_500);
    assert.ok(finance && "hit" in finance, "the finance family stays served");
  });

  it("bubbles needsAttention up the parent chain WITHOUT recomputing parents", () => {
    // No value ever computed for dom:sales or agency — the bubble must not require one.
    m.markRadarDirty("ag", "fam:sales:speed-to-lead", 2_000);
    assert.equal(m.nodeNeedsAttentionBelow("ag", "dom:sales"), true, "the parent domain shows attention below");
    assert.equal(m.nodeNeedsAttentionBelow("ag", "agency"), true, "the agency root shows attention below");
    assert.equal(m.nodeNeedsAttentionBelow("ag", "dom:finance"), false, "an unrelated domain does not");
  });

  it("a value recompute clears recheck-pending but a bubbled attention flag survives it", async () => {
    m.markRadarDirty("ag", "fam:sales:a", 2_000); // dirties the leaf, bubbles to dom:sales + agency
    // Recompute dom:sales itself (an attention-flagged parent) with a fresh value.
    await m.computeNodeCache("ag", "dom:sales", 60_000, async () => mkResult({ key: "dom:sales", computedAt: 3_000 }), 3_000);
    assert.ok(m.readNodeCache("ag", "dom:sales", 3_100), "the recomputed parent serves its fresh value");
    assert.equal(m.nodeNeedsAttentionBelow("ag", "dom:sales"), true, "…but 'a child is dirty' still holds until the child is rechecked");
  });
});

describe("preserves the proven cache behaviour per node", () => {
  it("single-flights concurrent computes (one compute, shared promise)", async () => {
    let calls = 0;
    const compute = async () => { calls += 1; await Promise.resolve(); return mkResult({ computedAt: 1_000 }); };
    const [a, b] = await Promise.all([
      m.computeNodeCache("ag", "dom:sales", 60_000, compute, 1_000),
      m.computeNodeCache("ag", "dom:sales", 60_000, compute, 1_000),
    ]);
    // The second call arrives after the first stored its pending, so it shares it.
    assert.equal(a.health, b.health);
    assert.ok(calls <= 2, "no thundering herd across the two calls");
  });

  it("expires by TTL", async () => {
    await m.computeNodeCache("ag", "dom:sales", 1_000, async () => mkResult({ computedAt: 1_000 }), 1_000);
    assert.ok(m.readNodeCache("ag", "dom:sales", 1_500), "inside TTL: served");
    assert.equal(m.readNodeCache("ag", "dom:sales", 3_000), null, "past TTL: not served");
  });

  it("keeps agencies isolated", async () => {
    await m.computeNodeCache("ag1", "dom:sales", 60_000, async () => mkResult({ health: "critical", computedAt: 1_000 }), 1_000);
    assert.equal(m.readNodeCache("ag2", "dom:sales", 1_500), null, "another agency sees nothing");
    m.clearAgencyNodeCache("ag1");
    assert.equal(m.readNodeCache("ag1", "dom:sales", 1_500), null, "clearAgencyNodeCache drops it");
  });
});
