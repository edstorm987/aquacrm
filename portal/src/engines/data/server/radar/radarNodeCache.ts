import "server-only";

// Fractal Radar — Phase 3 foundation: the per-node cache + dirty-marking.
//
// The plan (docs/development/plans/fractal-radar-architecture.md §5/§6) sequences
// "node cache first, then event-dirty", because on the flat whole-agency
// `radarCache` (one entry per `realm:agency`) a per-node "mark dom:clients dirty"
// can only bust the whole agency. This module is that per-node layer: a cache
// keyed by node path under the same `${realmId}:${agencyId}` prefix, plus
// `markRadarDirty` which evicts a node and its descendants and bubbles a cheap
// `needsAttention` flag up the parent chain WITHOUT recomputing the parents — so
// the always-on top level can render "attention below" the instant a leaf flips.
//
// IT IS PURE INFRASTRUCTURE AND WIRED TO NOTHING YET. Phase 3 integration
// (radarTopSweep + the descent condition), Phase 5 (event-dirty from
// radarSeeding) and Phase 6 (targeted descent) consume it later, all flag-gated.
// Standing alone it changes no render, touches no storage, and cannot affect the
// working app; its correctness is unit-tested in isolation. The node contract adds
// NO new `RadarCheckStatus` value (the plan's hard constraint) — it reuses the
// existing status vocabulary and only adds descent bookkeeping around it.
//
// HONESTY (the "never a false green" contract): a node this layer has not yet
// re-descended is never served as its old `pass`. A dirty-but-unrechecked node is
// `stale-dirty` and reads recheck-pending (a `watch`-equivalent); an undescended
// clean node is `suppressed-clean` (which the caller's confidence formula caps
// below a full-confidence green); a node that could not descend for lack of
// evidence is `blocked-blind`. The cache stores these states; it never invents a
// green.

import type { RadarCheckStatus } from "@/engines/data/radar/businessRadar";
import { getActiveDataRealmId } from "@/server/dataRealm";

/** Descent bookkeeping states — the anti-"green-because-we-didn't-look" flags. */
export type RadarNodeDescent =
  | "descended"        // fully re-evaluated from evidence
  | "suppressed-clean" // top pre-scan clean, sub-checks not re-descended (confidence-capped)
  | "blocked-blind"    // could not descend for want of evidence → blind
  | "stale-dirty";     // an event marked it; last verdict retained but rendered recheck-pending

/**
 * One node's cached summary. Mirrors `RadarDomainSummary`'s three-axis shape and
 * adds the descent bookkeeping the cache needs. Additive — no new status enum.
 */
export interface RadarNodeResult {
  key: string;
  level: "agency" | "domain" | "family" | "entity" | "element";
  parentKey?: string;
  /** pass|critical|warning|watch|blind|learning|inactive — never invented green. */
  health: RadarCheckStatus;
  assurancePercent: number;
  confidencePercent: number;
  readinessPercent: number;
  firing: number;
  blind: number;
  learning: number;
  descent: RadarNodeDescent;
  childCount: number;
  childrenObserved: number;
  computedAt: number;
  evidenceCheckedAt?: number;
  dirtyAt?: number;
}

interface RadarNodeCacheEntry {
  expiresAt: number;
  value?: RadarNodeResult;
  pending?: Promise<RadarNodeResult>;
  /** Set by markRadarDirty. When `> value.computedAt`, the node is recheck-pending. */
  dirtyAt?: number;
  /** Bubbled up from a dirtied descendant; parent is NOT recomputed, only flagged. */
  needsAttentionBelow: boolean;
}

// One flat map, prefixed by realm+agency exactly like the whole-radar cache, so a
// safe-demo realm and the live realm never share node state.
const nodeCache = new Map<string, RadarNodeCacheEntry>();

function scope(agencyId: string): string {
  return `${getActiveDataRealmId()}:${agencyId}:`;
}

function fullKey(agencyId: string, nodeKey: string): string {
  return `${scope(agencyId)}${nodeKey}`;
}

/**
 * The structural ancestor chain of a node key, nearest parent first, up to (and
 * including) `agency`. The flat key scheme encodes the hierarchy:
 *   `fam:<d>:<f>` → `dom:<d>` → `agency`
 *   `dom:<d>`     → `agency`
 *   `ent:<t>:<id>`→ `agency`   (Phase-1 entity spine hangs off the root)
 *   `agency`      → (root, no ancestors)
 * Cross-cutting rollups (a client also touching `dom:clients`/`dom:company`) are
 * NOT modelled here — the event map (§5 Tier A) dirties those keys explicitly, and
 * each then bubbles its own structural chain.
 */
export function parentChainOf(nodeKey: string): string[] {
  if (nodeKey === "agency") return [];
  if (nodeKey.startsWith("dom:")) return ["agency"];
  if (nodeKey.startsWith("ent:")) return ["agency"];
  const fam = /^fam:([^:]+):/.exec(nodeKey);
  if (fam) return [`dom:${fam[1]}`, "agency"];
  // Unknown shape: treat as hanging off the root rather than guessing a parent.
  return ["agency"];
}

/**
 * Which of `candidateKeys` are `nodeKey` itself or a descendant of it. A domain
 * owns its families (`fam:<d>:*`); the agency owns everything; a family or entity
 * is a leaf in the current (pre-element) model, owning only itself.
 */
export function descendantKeysOf(nodeKey: string, candidateKeys: Iterable<string>): string[] {
  if (nodeKey === "agency") return [...candidateKeys];
  if (nodeKey.startsWith("dom:")) {
    const domain = nodeKey.slice("dom:".length);
    const famPrefix = `fam:${domain}:`;
    return [...candidateKeys].filter(key => key === nodeKey || key.startsWith(famPrefix));
  }
  return [...candidateKeys].filter(key => key === nodeKey);
}

/** True when this node has an event-marked recheck outstanding (never served green). */
export function isNodeRecheckPending(entry: RadarNodeCacheEntry): boolean {
  return entry.dirtyAt !== undefined
    && (entry.value === undefined || entry.dirtyAt > entry.value.computedAt);
}

/**
 * Mark a node dirty after an event (or a recheck flip). Evicts the node's own
 * computed value and every descendant's, records `dirtyAt`, and bubbles a cheap
 * `needsAttentionBelow` flag up the structural parent chain WITHOUT recomputing
 * the parents. The node keeps `stale-dirty` semantics: any read before the recheck
 * lands renders it recheck-pending (a `watch`-equivalent), never its old green.
 * Returns the set of node keys (unscoped) whose cached value was evicted.
 */
export function markRadarDirty(agencyId: string, nodeKey: string, now = Date.now()): string[] {
  const prefix = scope(agencyId);
  const owned = new Set<string>();
  // Descendant set is computed over the CURRENTLY-cached node keys in this scope.
  const scopedNodeKeys: string[] = [];
  for (const key of nodeCache.keys()) {
    if (key.startsWith(prefix)) scopedNodeKeys.push(key.slice(prefix.length));
  }
  // The dirtied node must be dirtied even if nothing is cached for it yet.
  for (const descendant of descendantKeysOf(nodeKey, new Set([nodeKey, ...scopedNodeKeys]))) {
    owned.add(descendant);
    const full = `${prefix}${descendant}`;
    const existing = nodeCache.get(full);
    if (existing) {
      // Keep the last verdict (stale-dirty) but drop any in-flight compute and
      // stamp dirtyAt so reads see recheck-pending, not a fresh green.
      existing.pending = undefined;
      existing.dirtyAt = now;
      if (existing.value) existing.value = { ...existing.value, descent: "stale-dirty", dirtyAt: now };
    } else {
      nodeCache.set(full, { expiresAt: now, dirtyAt: now, needsAttentionBelow: false });
    }
  }
  // Bubble attention up the parents of the dirtied node — flag only, no recompute.
  for (const ancestor of parentChainOf(nodeKey)) {
    const full = `${prefix}${ancestor}`;
    const existing = nodeCache.get(full);
    if (existing) existing.needsAttentionBelow = true;
    else nodeCache.set(full, { expiresAt: now, needsAttentionBelow: true });
  }
  return [...owned];
}

/** Whether a node currently carries a bubbled "attention below" flag. */
export function nodeNeedsAttentionBelow(agencyId: string, nodeKey: string): boolean {
  return nodeCache.get(fullKey(agencyId, nodeKey))?.needsAttentionBelow ?? false;
}

/**
 * Read a node's cached result, honouring single-flight, TTL and the recheck-pending
 * contract. Returns:
 *   - `pending` when a compute is in flight (concurrent callers share it),
 *   - `null` when there is no fresh, non-dirty value to serve (the caller must
 *     descend/recompute — the cache never fabricates a value or serves a
 *     recheck-pending node as its old verdict),
 *   - the cached `RadarNodeResult` when it is fresh and not recheck-pending.
 */
export function readNodeCache(
  agencyId: string,
  nodeKey: string,
  now = Date.now(),
): { hit: RadarNodeResult } | { pending: Promise<RadarNodeResult> } | null {
  const entry = nodeCache.get(fullKey(agencyId, nodeKey));
  if (!entry) return null;
  if (entry.pending) return { pending: entry.pending };
  if (isNodeRecheckPending(entry)) return null;
  if (entry.value && entry.expiresAt > now) return { hit: entry.value };
  return null;
}

/**
 * Store (or single-flight) a node computation. Preserves the proven whole-radar
 * cache shape: an in-flight `pending` is shared by concurrent callers, the fresh
 * value is written on resolve only if this entry is still the current one, and a
 * bubbled `needsAttentionBelow` flag survives a value write (the recompute answers
 * "am I red", the bubble answers "is a child red" — different questions).
 */
export function computeNodeCache(
  agencyId: string,
  nodeKey: string,
  ttlMs: number,
  compute: () => Promise<RadarNodeResult>,
  now = Date.now(),
): Promise<RadarNodeResult> {
  const full = fullKey(agencyId, nodeKey);
  const prior = nodeCache.get(full);
  const entry: RadarNodeCacheEntry = {
    expiresAt: now + ttlMs,
    needsAttentionBelow: prior?.needsAttentionBelow ?? false,
  };
  const pending = compute()
    .then(value => {
      const current = nodeCache.get(full);
      if (current === entry) {
        nodeCache.set(full, {
          value,
          // Freshness is measured from the `now` the value describes, not from
          // when the async compute happened to resolve — deterministic, and a
          // value "as of now" is honestly stale `ttlMs` after `now`.
          expiresAt: now + ttlMs,
          needsAttentionBelow: current.needsAttentionBelow,
          // The recompute clears the recheck-pending state it was answering.
          dirtyAt: current.dirtyAt !== undefined && current.dirtyAt > value.computedAt ? current.dirtyAt : undefined,
        });
      }
      return value;
    })
    .catch(error => {
      if (nodeCache.get(full) === entry) nodeCache.delete(full);
      throw error;
    });
  entry.pending = pending;
  nodeCache.set(full, entry);
  return pending;
}

/** Drop every node entry for an agency (the whole-agency backstop). */
export function clearAgencyNodeCache(agencyId: string): void {
  const prefix = scope(agencyId);
  for (const key of nodeCache.keys()) {
    if (key.startsWith(prefix)) nodeCache.delete(key);
  }
}

/** Test-only: wipe the entire node cache across every realm/agency. */
export function __resetRadarNodeCacheForTest(): void {
  nodeCache.clear();
}
