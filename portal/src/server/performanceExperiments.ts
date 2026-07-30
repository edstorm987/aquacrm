import "server-only";

import crypto from "node:crypto";
import { logActivity } from "./activity";
import { getState, mutate } from "./storage";
import type {
  PerformanceExperiment,
  PerformanceExperimentStatus,
  PerformanceExperimentVariant,
} from "./types";

export interface PerformanceExperimentInput {
  clientId?: string;
  propertyId?: string;
  name: string;
  hypothesis?: string;
  primaryMetric?: string;
  status?: PerformanceExperimentStatus;
  variants?: Array<Partial<PerformanceExperimentVariant>>;
}

export function listPerformanceExperiments(agencyId: string, clientId?: string): PerformanceExperiment[] {
  return Object.values(getState().performanceExperiments)
    .filter(item => item.agencyId === agencyId && (clientId === undefined || item.clientId === clientId))
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export function createPerformanceExperiment(
  agencyId: string,
  input: PerformanceExperimentInput,
  actorUserId: string,
): PerformanceExperiment {
  const name = clean(input.name, 160);
  if (!name) throw new Error("Experiment name required.");
  const now = Date.now();
  const status = cleanStatus(input.status);
  const experiment: PerformanceExperiment = {
    id: `exp_${crypto.randomBytes(8).toString("hex")}`,
    agencyId,
    clientId: clean(input.clientId, 120) || undefined,
    propertyId: clean(input.propertyId, 120) || undefined,
    name,
    hypothesis: clean(input.hypothesis, 1_000) || undefined,
    primaryMetric: clean(input.primaryMetric, 120) || "Form conversions",
    status,
    variants: cleanVariants(input.variants),
    startedAt: status === "running" ? now : undefined,
    createdBy: actorUserId,
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => { state.performanceExperiments[experiment.id] = experiment; });
  logActivity({
    agencyId,
    clientId: experiment.clientId,
    actorUserId,
    category: "marketing",
    action: "performance.experiment_created",
    message: `Created split test “${experiment.name}”.`,
    metadata: { experimentId: experiment.id },
  });
  return experiment;
}

export function updatePerformanceExperiment(
  agencyId: string,
  id: string,
  patch: Partial<PerformanceExperimentInput>,
  actorUserId: string,
): PerformanceExperiment | null {
  const current = getState().performanceExperiments[id];
  if (!current || current.agencyId !== agencyId) return null;
  const status = patch.status ? cleanStatus(patch.status) : current.status;
  const now = Date.now();
  const updated: PerformanceExperiment = {
    ...current,
    name: patch.name === undefined ? current.name : clean(patch.name, 160) || current.name,
    hypothesis: patch.hypothesis === undefined ? current.hypothesis : clean(patch.hypothesis, 1_000) || undefined,
    primaryMetric: patch.primaryMetric === undefined ? current.primaryMetric : clean(patch.primaryMetric, 120) || current.primaryMetric,
    propertyId: patch.propertyId === undefined ? current.propertyId : clean(patch.propertyId, 120) || undefined,
    status,
    variants: patch.variants === undefined ? current.variants : cleanVariants(patch.variants),
    startedAt: status === "running" ? current.startedAt ?? now : current.startedAt,
    endedAt: status === "complete" ? current.endedAt ?? now : undefined,
    updatedAt: now,
  };
  mutate(state => { state.performanceExperiments[id] = updated; });
  logActivity({
    agencyId,
    clientId: updated.clientId,
    actorUserId,
    category: "marketing",
    action: "performance.experiment_updated",
    message: `Updated split test “${updated.name}”.`,
    metadata: { experimentId: id, status },
  });
  return updated;
}

export function deletePerformanceExperiment(agencyId: string, id: string): boolean {
  const current = getState().performanceExperiments[id];
  if (!current || current.agencyId !== agencyId) return false;
  mutate(state => { delete state.performanceExperiments[id]; });
  return true;
}

function cleanVariants(value?: Array<Partial<PerformanceExperimentVariant>>): PerformanceExperimentVariant[] {
  const defaults: Array<Partial<PerformanceExperimentVariant>> = [{ id: "a", name: "Version A" }, { id: "b", name: "Version B" }];
  const rows = value?.length && value.length >= 2 ? value.slice(0, 6) : defaults;
  return rows.map((row, index) => ({
    id: clean(row.id, 60) || String.fromCharCode(97 + index),
    name: clean(row.name, 120) || `Version ${String.fromCharCode(65 + index)}`,
    visitors: number(row.visitors),
    conversions: number(row.conversions),
  }));
}

function cleanStatus(value?: PerformanceExperimentStatus): PerformanceExperimentStatus {
  return value === "running" || value === "complete" || value === "paused" ? value : "draft";
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}
