import "server-only";

import { randomUUID } from "node:crypto";

import { canonicalKpiReference, tryCanonicalKpiReference } from "@/lib/data/metricRegistry";
import { logActivity } from "@/server/activity";
import { getState, mutate } from "@/server/storage";
import type { CustomKpiDefinition, CustomKpiOp } from "@/server/types";

/**
 * Custom-KPI store (Phase 6). Persists per-agency guided custom-KPI definitions
 * into `PortalState.customKpis`. The definitions only reference existing registry
 * metric ids + an op — they carry no formula code, so nothing here can compute
 * anything unsafe; the actual values are derived client-side by `computeCustomKpi`.
 */

const CUSTOM_OPS: CustomKpiOp[] = ["ratio", "rate", "sum", "diff"];

export function listCustomKpis(agencyId: string): CustomKpiDefinition[] {
  return migrateLegacyCustomKpiDefinitions(getState().customKpis?.[agencyId] ?? []);
}

/** Pure, deterministic read migration for definitions written before canonical KPI ids. */
export function migrateLegacyCustomKpiDefinitions(definitions: readonly CustomKpiDefinition[]): CustomKpiDefinition[] {
  return definitions.flatMap(definition => {
    const numeratorId = tryCanonicalKpiReference(definition.numeratorId, { mode: "legacy", allowDynamicKinds: ["evidence"] });
    const denominatorId = definition.denominatorId
      ? tryCanonicalKpiReference(definition.denominatorId, { mode: "legacy", allowDynamicKinds: ["evidence"] })
      : undefined;
    if (!numeratorId || (definition.denominatorId && !denominatorId)) return [];
    return [{ ...definition, numeratorId, denominatorId }];
  });
}

export interface CreateCustomKpiInput {
  label: string;
  numeratorId: string;
  denominatorId?: string;
  op: CustomKpiOp;
  category?: string;
  direction?: "higher" | "lower";
}

/** Create a custom KPI. Throws on an unknown op or a missing numerator id. */
export function createCustomKpi(agencyId: string, input: CreateCustomKpiInput, opts: { actorUserId: string; now?: number }): CustomKpiDefinition {
  const label = input.label.trim().slice(0, 80);
  if (!label) throw new Error("custom KPI label is required");
  if (!input.numeratorId) throw new Error("custom KPI numerator is required");
  if (!CUSTOM_OPS.includes(input.op)) throw new Error("unknown custom KPI op");
  const numeratorId = canonicalKpiReference(input.numeratorId, { allowDynamicKinds: ["evidence"] });
  const denominatorId = input.denominatorId?.trim()
    ? canonicalKpiReference(input.denominatorId, { allowDynamicKinds: ["evidence"] })
    : undefined;
  const definition: CustomKpiDefinition = {
    id: `ck_${randomUUID()}`,
    label,
    numeratorId,
    denominatorId,
    op: input.op,
    category: input.category?.trim().slice(0, 40) || undefined,
    direction: input.direction,
    createdAt: opts.now ?? Date.now(),
    createdBy: opts.actorUserId,
  };
  mutate(state => {
    if (!state.customKpis) state.customKpis = {};
    state.customKpis[agencyId] = [...migrateLegacyCustomKpiDefinitions(state.customKpis[agencyId] ?? []), definition];
  });
  logActivity({ agencyId, actorUserId: opts.actorUserId, category: "settings", action: "kpi.custom_created", message: `Created custom KPI "${definition.label}".` });
  return definition;
}

/** Delete a custom KPI by id. */
export function deleteCustomKpi(agencyId: string, id: string, opts: { actorUserId: string }): CustomKpiDefinition[] {
  mutate(state => {
    if (!state.customKpis) state.customKpis = {};
    state.customKpis[agencyId] = migrateLegacyCustomKpiDefinitions(state.customKpis[agencyId] ?? []).filter(item => item.id !== id);
  });
  logActivity({ agencyId, actorUserId: opts.actorUserId, category: "settings", action: "kpi.custom_deleted", message: `Deleted custom KPI ${id}.` });
  return listCustomKpis(agencyId);
}
