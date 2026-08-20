import "server-only";

import { randomUUID } from "node:crypto";

import { logActivity } from "@/server/activity";
import { getAgencyWorkspaceSettings } from "@/server/agencySettings";
import { getState, mutate } from "@/server/storage";
import type { SharedKpiComparisonView } from "@/server/types";

/**
 * Shared saved KPI views — the agency-shared half of saved comparison views.
 *
 * Ed's decision was private AND shared. The private half lives in the browser
 * (`aqua:kpi-comparison-views:v1` in localStorage) and never leaves the
 * machine; this module persists the shared half into
 * `agencySettings.kpiSavedViews`, following the same agency-scoped settings
 * pattern as `kpiTargets` (`src/engines/data/server/kpi/kpiTargets.ts`). Plan overrides
 * are deliberately NOT part of a shared view — they are already server-shared
 * through the KPI targets store.
 */

const MODES: SharedKpiComparisonView["mode"][] = ["plan", "indexed", "change", "raw"];
const RANGES: SharedKpiComparisonView["range"][] = ["24h", "7d", "30d", "90d", "quarter", "ytd", "12m", "all", "custom"];
const MAX_VIEWS = 50;
const MAX_KPIS_PER_VIEW = 24;

export interface SaveSharedKpiViewInput {
  name: string;
  kpiIds: string[];
  mode?: string;
  range?: string;
  start?: string;
  end?: string;
}

/** The agency's shared saved KPI views, newest last (save order). */
export function listSharedKpiViews(agencyId: string): SharedKpiComparisonView[] {
  return getState().agencySettings[agencyId]?.kpiSavedViews ?? [];
}

function persist(agencyId: string, views: SharedKpiComparisonView[]): void {
  const fallback = getState().agencySettings[agencyId] ? null : getAgencyWorkspaceSettings(agencyId);
  mutate(state => {
    const row = state.agencySettings[agencyId];
    if (row) row.kpiSavedViews = views;
    else state.agencySettings[agencyId] = { ...fallback!, kpiSavedViews: views };
  });
}

/**
 * Save (or replace, by case-insensitive name — the same replace-on-same-name
 * semantics the private browser half applies) one shared view. Throws on a
 * missing name or an empty KPI selection.
 */
export function saveSharedKpiView(agencyId: string, input: SaveSharedKpiViewInput, opts: { actorUserId: string; now?: number }): SharedKpiComparisonView {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new Error("a shared view needs a name");
  const kpiIds = [...new Set(input.kpiIds.filter(id => typeof id === "string" && id.trim().length > 0).map(id => id.trim().slice(0, 140)))].slice(0, MAX_KPIS_PER_VIEW);
  if (!kpiIds.length) throw new Error("a shared view needs at least one KPI");
  const view: SharedKpiComparisonView = {
    id: `kv_${randomUUID()}`,
    name,
    kpiIds,
    mode: MODES.includes(input.mode as SharedKpiComparisonView["mode"]) ? input.mode as SharedKpiComparisonView["mode"] : "plan",
    range: RANGES.includes(input.range as SharedKpiComparisonView["range"]) ? input.range as SharedKpiComparisonView["range"] : "30d",
    start: cleanDate(input.start),
    end: cleanDate(input.end),
    createdAt: opts.now ?? Date.now(),
    createdBy: opts.actorUserId,
  };
  const kept = listSharedKpiViews(agencyId).filter(existing => existing.name.toLowerCase() !== name.toLowerCase());
  persist(agencyId, [...kept, view].slice(-MAX_VIEWS));
  logActivity({ agencyId, actorUserId: opts.actorUserId, category: "settings", action: "kpi.shared_view_saved", message: `Shared the KPI comparison view "${view.name}" with the workspace.` });
  return view;
}

/** Delete one shared view by id. Returns the remaining views. */
export function deleteSharedKpiView(agencyId: string, id: string, opts: { actorUserId: string }): SharedKpiComparisonView[] {
  const current = listSharedKpiViews(agencyId);
  const next = current.filter(view => view.id !== id);
  if (next.length !== current.length) {
    persist(agencyId, next);
    logActivity({ agencyId, actorUserId: opts.actorUserId, category: "settings", action: "kpi.shared_view_deleted", message: `Deleted the shared KPI comparison view ${id}.` });
  }
  return next;
}

function cleanDate(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : undefined;
}
