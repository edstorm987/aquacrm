// Fractal Radar — Phase 1: the node-tree PROJECTION.
//
// A pure, read-only reduction of the fully-computed `BusinessIssueRadar` into the
// hierarchical node tree the fractal design describes (docs/development/plans/
// fractal-radar-architecture.md §2/§3): agency → domain → signal-family, plus a
// parallel monitored-entity spine. It computes NOTHING new and touches no hot
// path — it only re-shapes checks the radar already produced, so it is safe to
// add ahead of the descent/caching/event phases.
//
// Why this exists now (Phase 1): it proves the tree can be derived from existing
// `BusinessRadarCheck` fields (`domain`/`familyId`/`entity`) with zero catalog or
// registry edits, and gives a drill-down surface a stable shape to render — the
// foundation the later phases (per-node cache, fault pre-scan, event-dirty) build
// on. It deliberately does NOT wire itself into `BusinessIssueRadar` output yet;
// a consumer calls `projectRadarNodeTree(radar)` when it needs the tree.
//
// HONESTY (the "never a false green" contract): a node's `health` is the worst
// SEVERITY among its checks, with `blind`/`learning` ranked BELOW `pass` — so a
// family whose only checks are blind reads `blind`, never `pass`. Blind and
// learning counts are always carried separately, and the confidence axis discounts
// them, so an unproven node can never present as a full-confidence green. Domain
// nodes reuse the authoritative `RadarDomainSummary` (`radar.domains`); family and
// entity nodes derive assurance/confidence with the SAME formulas
// `summarizeRadarChecks` uses (radarCheckEngine.ts), so the numbers are consistent
// across levels. Readiness (which needs per-domain source coverage) is authoritative
// on domain nodes only and left undefined on family/entity nodes rather than invented.

import type {
  AdvisorDomain,
  BusinessIssueRadar,
  BusinessRadarCheck,
  RadarCheckStatus,
  RadarEntityType,
} from "./businessRadar";

export type RadarNodeLevel = "agency" | "domain" | "family" | "entity";

export interface RadarNodeCounts {
  total: number;
  passed: number;
  /** critical + warning */
  firing: number;
  watch: number;
  blind: number;
  learning: number;
  inactive: number;
}

export interface RadarNode {
  /** Stable path key: `agency` | `dom:<domain>` | `fam:<domain>:<familyId>` | `ent:<type>:<id>`. */
  key: string;
  level: RadarNodeLevel;
  /** Parent path key, or null for the agency root. */
  parentKey: string | null;
  label: string;
  domain?: AdvisorDomain;
  entityType?: RadarEntityType;
  /** Worst severity among this node's checks; blind/learning rank below pass (honest rollup). */
  health: RadarCheckStatus;
  counts: RadarNodeCounts;
  /** passed+firing over applicable (non-inactive) checks — health backed by a real verdict. */
  assurancePercent: number;
  /** (assured + watch*0.6 + learning*0.25) / applicable — discounts unproven checks. */
  confidencePercent: number;
  /** Setup/instrumentation completeness. Authoritative on DOMAIN nodes only (needs source coverage). */
  readinessPercent?: number;
  /** Child node keys (domains under agency; families under a domain). */
  childKeys: string[];
  /** Ids of the leaf checks that roll up into this node. */
  checkIds: string[];
}

// Worst-first. A node with any critical is critical; with none of
// critical/warning/watch but a pass is pass; only blind ⇒ blind (never pass).
const SEVERITY_ORDER: readonly RadarCheckStatus[] = [
  "critical", "warning", "watch", "pass", "learning", "blind", "inactive",
];

function rollUpHealth(checks: readonly BusinessRadarCheck[]): RadarCheckStatus {
  for (const status of SEVERITY_ORDER) {
    if (checks.some(check => check.status === status)) return status;
  }
  return "inactive";
}

function countChecks(checks: readonly BusinessRadarCheck[]): RadarNodeCounts {
  const by = (status: RadarCheckStatus) => checks.filter(check => check.status === status).length;
  return {
    total: checks.length,
    passed: by("pass"),
    firing: by("critical") + by("warning"),
    watch: by("watch"),
    blind: by("blind"),
    learning: by("learning"),
    inactive: by("inactive"),
  };
}

// Same shape as summarizeRadarChecks (radarCheckEngine.ts): assurance = assured /
// applicable; confidence discounts watch (0.6) and learning (0.25). Kept in lockstep
// so family/entity numbers read consistently with the authoritative domain summaries.
function assuranceConfidence(counts: RadarNodeCounts): { assurancePercent: number; confidencePercent: number } {
  const applicable = counts.total - counts.inactive;
  const assured = counts.passed + counts.firing;
  if (applicable <= 0) return { assurancePercent: 0, confidencePercent: 0 };
  return {
    assurancePercent: Math.round((assured / applicable) * 100),
    confidencePercent: Math.round(((assured + counts.watch * 0.6 + counts.learning * 0.25) / applicable) * 100),
  };
}

const domKey = (domain: AdvisorDomain) => `dom:${domain}`;
const famKey = (domain: AdvisorDomain, familyId: string) => `fam:${domain}:${familyId}`;
const entKey = (type: RadarEntityType, id: string) => `ent:${type}:${id}`;

/**
 * Reduce a fully-computed radar into the fractal node tree.
 *
 * Returns a FLAT list of nodes (each with `parentKey`/`childKeys`), agency root
 * first, then domains, their families, then the parallel entity spine. Pure — same
 * radar in, same tree out; it never mutates the radar or reads outside it.
 */
/**
 * Attach the fractal node tree to a radar as `radar.nodes` — but only when `enabled`.
 * This is the flag-gated "expose on the output" step of fractal Phase 1: with the flag off
 * the radar is returned untouched (zero cost, zero risk to the working app); with it on, the
 * pure projection is attached for the fractal read surface to consume. Kept a tiny pure helper
 * so the flag contract is unit-testable without running the whole radar build.
 */
export function withRadarNodeTree(radar: BusinessIssueRadar, enabled: boolean): BusinessIssueRadar {
  if (!enabled) return radar;
  return { ...radar, nodes: projectRadarNodeTree(radar) };
}

/**
 * Whether the fractal node tree should be attached to radar output. Off unless the
 * `RADAR_NODES_ENABLED` env flag is exactly "true", so production is unchanged until the
 * fractal read surface (Phase 6) is built and the flag is flipped.
 */
export function radarNodesEnabled(): boolean {
  return process.env.RADAR_NODES_ENABLED === "true";
}

export function projectRadarNodeTree(radar: BusinessIssueRadar): RadarNode[] {
  const checks = radar.checks;
  const nodes: RadarNode[] = [];

  // ── Families (L2): group checks by domain + familyId. ────────────────────
  const familyKeysByDomain = new Map<AdvisorDomain, string[]>();
  const familyGroups = new Map<string, BusinessRadarCheck[]>();
  for (const check of checks) {
    const key = famKey(check.domain, check.familyId);
    (familyGroups.get(key) ?? familyGroups.set(key, []).get(key)!).push(check);
  }
  const familyNodes: RadarNode[] = [];
  for (const [key, famChecks] of familyGroups) {
    const first = famChecks[0]!;
    const counts = countChecks(famChecks);
    familyNodes.push({
      key,
      level: "family",
      parentKey: domKey(first.domain),
      label: first.familyLabel || first.familyId,
      domain: first.domain,
      health: rollUpHealth(famChecks),
      counts,
      ...assuranceConfidence(counts),
      childKeys: [],
      checkIds: famChecks.map(check => check.id),
    });
    const list = familyKeysByDomain.get(first.domain) ?? [];
    list.push(key);
    familyKeysByDomain.set(first.domain, list);
  }

  // ── Domains (L1): authoritative from radar.domains (RadarDomainSummary). ──
  const checksByDomain = new Map<AdvisorDomain, BusinessRadarCheck[]>();
  for (const check of checks) {
    (checksByDomain.get(check.domain) ?? checksByDomain.set(check.domain, []).get(check.domain)!).push(check);
  }
  const domainNodes: RadarNode[] = [];
  for (const summary of radar.domains) {
    const domChecks = checksByDomain.get(summary.domain) ?? [];
    domainNodes.push({
      key: domKey(summary.domain),
      level: "domain",
      parentKey: "agency",
      label: summary.domain,
      domain: summary.domain,
      health: rollUpHealth(domChecks),
      counts: {
        total: summary.totalChecks,
        passed: summary.passedChecks,
        firing: summary.firingChecks,
        watch: summary.watchChecks,
        blind: summary.blindChecks,
        learning: summary.learningChecks,
        inactive: summary.inactiveChecks,
      },
      assurancePercent: summary.assurancePercent,
      confidencePercent: summary.confidencePercent,
      readinessPercent: summary.readinessPercent,
      childKeys: familyKeysByDomain.get(summary.domain) ?? [],
      checkIds: domChecks.map(check => check.id),
    });
  }

  // ── Entity spine (parallel): group checks that name an entity. ───────────
  const entityGroups = new Map<string, { type: RadarEntityType; id: string; label: string; checks: BusinessRadarCheck[] }>();
  for (const check of checks) {
    if (!check.entity) continue;
    const key = entKey(check.entity.type, check.entity.id);
    const bucket = entityGroups.get(key)
      ?? entityGroups.set(key, { type: check.entity.type, id: check.entity.id, label: check.entity.label, checks: [] }).get(key)!;
    bucket.checks.push(check);
  }
  const entityNodes: RadarNode[] = [];
  for (const [key, bucket] of entityGroups) {
    const counts = countChecks(bucket.checks);
    entityNodes.push({
      key,
      level: "entity",
      parentKey: "agency",
      label: bucket.label,
      entityType: bucket.type,
      health: rollUpHealth(bucket.checks),
      counts,
      ...assuranceConfidence(counts),
      childKeys: [],
      checkIds: bucket.checks.map(check => check.id),
    });
  }

  // ── Agency root (L0): from the radar summary; domains are its children. ───
  const agency: RadarNode = {
    key: "agency",
    level: "agency",
    parentKey: null,
    label: "Agency",
    health: rollUpHealth(checks),
    counts: {
      total: radar.summary.totalChecks,
      passed: radar.summary.passedChecks,
      firing: radar.summary.firingChecks,
      watch: radar.summary.watchChecks,
      blind: radar.summary.blindChecks,
      learning: radar.summary.learningChecks,
      inactive: radar.summary.inactiveChecks,
    },
    assurancePercent: radar.summary.assurancePercent,
    ...(() => {
      const { confidencePercent } = assuranceConfidence({
        total: radar.summary.totalChecks,
        passed: radar.summary.passedChecks,
        firing: radar.summary.firingChecks,
        watch: radar.summary.watchChecks,
        blind: radar.summary.blindChecks,
        learning: radar.summary.learningChecks,
        inactive: radar.summary.inactiveChecks,
      });
      return { confidencePercent };
    })(),
    childKeys: domainNodes.map(node => node.key),
    checkIds: [],
  };

  nodes.push(agency, ...domainNodes, ...familyNodes, ...entityNodes);
  return nodes;
}

/** Index the flat node list by key, for O(1) parent/child walks by a consumer. */
export function indexRadarNodes(nodes: readonly RadarNode[]): Map<string, RadarNode> {
  return new Map(nodes.map(node => [node.key, node]));
}
