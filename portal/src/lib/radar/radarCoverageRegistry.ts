import type {
  AdvisorDomain,
  RadarCoverageEntityType,
  RadarCoverageManifest,
  RadarCoverageManifestEntry,
} from "@/lib/radar/businessRadar";

/**
 * Radar coverage registry + seeder (radar upgrade Stage 6, Part E).
 *
 * A declarative **detector-pack template per entity type** plus a **generic
 * fallback**, so every monitorable entity resolves to a radar pack — nothing is
 * silently un-watched. Formalises what client-radar already derives ad-hoc
 * (per-`product:*` / per-`property:*` packs, and an unknown product → a generic
 * pack) into one place that *guarantees* coverage, and gives the watchdog a
 * manifest to prove seeding worked.
 *
 * This is the resolution/proof layer — it does not itself build checks (the
 * client-radar and observation builders still produce the actual checks). It
 * answers: "does every active entity of a covered type have a pack?"
 */

export interface RadarCoverageTemplate {
  entityType: RadarCoverageEntityType | "generic";
  packId: string;
  label: string;
  /** Domains this entity type's checks land in. */
  domains: AdvisorDomain[];
  /** Nominal number of checks a fresh instance seeds with (honest floor). */
  checkFloor: number;
  detail: string;
}

export const RADAR_COVERAGE_TEMPLATES: Record<RadarCoverageEntityType | "generic", RadarCoverageTemplate> = {
  client: {
    entityType: "client",
    packId: "client-core",
    label: "Client core",
    domains: ["clients", "delivery", "finance"],
    checkFloor: 5,
    detail: "Service assignment, payment position, contact freshness, portal readiness and open requests for one client.",
  },
  product: {
    entityType: "product",
    packId: "product",
    label: "Product delivery",
    domains: ["delivery", "development", "marketing"],
    checkFloor: 3,
    detail: "Workspace, progress and deliverable coverage for one assigned product.",
  },
  property: {
    entityType: "property",
    packId: "property",
    label: "Property telemetry",
    domains: ["development", "systems"],
    checkFloor: 4,
    detail: "Tag telemetry, production errors, load performance and an active probe for one website/property.",
  },
  integration: {
    entityType: "integration",
    packId: "integration",
    label: "Integration health",
    domains: ["systems"],
    checkFloor: 3,
    detail: "Connection, record flow and failure state for one installed module or integration.",
  },
  "portal-connection": {
    entityType: "portal-connection",
    packId: "portal-connection",
    label: "Portal connection",
    domains: ["systems"],
    checkFloor: 3,
    detail: "Link status and heartbeat freshness for one client software connection.",
  },
  "trading-company": {
    entityType: "trading-company",
    packId: "trading-company",
    label: "Trading company",
    domains: ["company"],
    checkFloor: 3,
    detail: "Operating records, ownership and governance for one configured trading company.",
  },
  generic: {
    entityType: "generic",
    packId: "generic",
    label: "Generic coverage",
    domains: ["systems"],
    checkFloor: 3,
    detail: "Fallback pack (connection · freshness · integrity) for any monitorable entity without a bespoke template.",
  },
};

const ENTITY_TYPES: RadarCoverageEntityType[] = ["client", "product", "property", "integration", "portal-connection", "trading-company"];

/** Resolve an entity type to its template, falling back to the generic pack. */
export function coverageTemplateFor(type: string): RadarCoverageTemplate {
  return (RADAR_COVERAGE_TEMPLATES as Record<string, RadarCoverageTemplate>)[type] ?? RADAR_COVERAGE_TEMPLATES.generic;
}

export interface RadarCoverageInputEntity {
  /** Widened to string so an unknown type falls to the generic pack rather than erroring. */
  type: RadarCoverageEntityType | string;
  id: string;
  label: string;
  /** True once real evidence has accrued; otherwise the entity is `calibrating`. */
  active?: boolean;
}

/**
 * Resolve every entity to its pack, producing the coverage manifest the watchdog
 * uses to prove seeding worked. Unknown types resolve to the generic fallback
 * (never a gap); a `gap` only appears if an entity is missing an id/type.
 */
export function resolveRadarCoverage(entities: readonly RadarCoverageInputEntity[]): RadarCoverageManifest {
  const byType = Object.fromEntries(ENTITY_TYPES.map(type => [type, 0])) as Record<RadarCoverageEntityType, number>;
  const entries: RadarCoverageManifestEntry[] = [];
  let gaps = 0;
  for (const entity of entities) {
    if (!entity.id || !entity.type) {
      gaps += 1;
      continue;
    }
    const known = ENTITY_TYPES.includes(entity.type as RadarCoverageEntityType);
    const template = coverageTemplateFor(entity.type);
    const resolvedType = (known ? entity.type : "generic") as RadarCoverageEntityType;
    if (known) byType[entity.type as RadarCoverageEntityType] += 1;
    entries.push({
      type: resolvedType,
      id: entity.id,
      label: entity.label,
      packId: template.packId,
      template: known ? "bespoke" : "fallback",
      state: entity.active ? "active" : "calibrating",
    });
  }
  return {
    entries,
    covered: entries.filter(entry => entry.template === "bespoke").length,
    fallback: entries.filter(entry => entry.template === "fallback").length,
    gaps,
    calibrating: entries.filter(entry => entry.state === "calibrating").length,
    byType,
  };
}
