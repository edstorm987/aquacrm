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
  expectedVersion?: number;
}

export class PerformanceExperimentConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PerformanceExperimentConflictError";
  }
}

/**
 * A caller-correctable refusal: the request itself is malformed or breaks a
 * business rule (blank name, impossible counts, bad status). Routes answer it
 * 400 with the message; anything that is not one of the typed refusals is an
 * unexpected failure and must not leak its text to the browser.
 */
export class PerformanceExperimentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PerformanceExperimentValidationError";
  }
}

export function listPerformanceExperiments(agencyId: string, clientId?: string): PerformanceExperiment[] {
  return Object.values(getState().performanceExperiments)
    .filter(item => item.agencyId === agencyId && (clientId === undefined || item.clientId === clientId))
    .map(normaliseStoredExperiment)
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export function createPerformanceExperiment(
  agencyId: string,
  input: PerformanceExperimentInput,
  actorUserId: string,
): PerformanceExperiment {
  const name = clean(input.name, 160);
  if (!name) throw new PerformanceExperimentValidationError("Experiment name required.");
  const now = Date.now();
  if (input.status !== undefined && input.status !== "draft") {
    throw new PerformanceExperimentValidationError("New experiments must start as a draft.");
  }
  const experiment: PerformanceExperiment = {
    id: `exp_${crypto.randomBytes(8).toString("hex")}`,
    agencyId,
    clientId: clean(input.clientId, 120) || undefined,
    propertyId: clean(input.propertyId, 120) || undefined,
    name,
    hypothesis: clean(input.hypothesis, 1_000) || undefined,
    primaryMetric: clean(input.primaryMetric, 120) || "Form conversions",
    status: "draft",
    variants: cleanVariants(input.variants),
    version: 1,
    revision: 1,
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
  const normalised = normaliseStoredExperiment(current);
  requireExpectedVersion(normalised, patch.expectedVersion);
  if (normalised.status === "complete") {
    throw new PerformanceExperimentConflictError("Completed experiment evidence is immutable. Create an amendment instead.");
  }
  const status = patch.status === undefined ? normalised.status : validStatus(patch.status);
  requireTransition(normalised.status, status);
  const name = patch.name === undefined ? normalised.name : clean(patch.name, 160);
  if (!name) throw new PerformanceExperimentValidationError("Experiment name required.");
  const now = Date.now();
  const variants = cleanVariants(patch.variants ?? normalised.variants);
  const updated: PerformanceExperiment = {
    ...normalised,
    name,
    hypothesis: patch.hypothesis === undefined ? normalised.hypothesis : clean(patch.hypothesis, 1_000) || undefined,
    primaryMetric: patch.primaryMetric === undefined ? normalised.primaryMetric : clean(patch.primaryMetric, 120) || normalised.primaryMetric,
    propertyId: patch.propertyId === undefined ? normalised.propertyId : clean(patch.propertyId, 120) || undefined,
    status,
    variants,
    version: normalised.version + 1,
    startedAt: status === "draft" ? undefined : normalised.startedAt ?? now,
    endedAt: status === "complete" ? now : undefined,
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

export function amendPerformanceExperiment(
  agencyId: string,
  id: string,
  expectedVersion: number | undefined,
  actorUserId: string,
): PerformanceExperiment | null {
  const current = getState().performanceExperiments[id];
  if (!current || current.agencyId !== agencyId) return null;
  const normalised = normaliseStoredExperiment(current);
  requireExpectedVersion(normalised, expectedVersion);
  if (normalised.status !== "complete") throw new PerformanceExperimentConflictError("Only a completed experiment can be amended.");
  if (normalised.amendedByExperimentId) {
    throw new PerformanceExperimentConflictError("This completed experiment already has an amendment.");
  }
  const now = Date.now();
  const amendment: PerformanceExperiment = {
    ...normalised,
    id: `exp_${crypto.randomBytes(8).toString("hex")}`,
    status: "draft",
    variants: amendmentVariants(normalised.variants),
    version: 1,
    revision: normalised.revision + 1,
    amendsExperimentId: normalised.id,
    amendedByExperimentId: undefined,
    startedAt: undefined,
    endedAt: undefined,
    createdBy: actorUserId,
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => {
    state.performanceExperiments[id] = {
      ...normalised,
      amendedByExperimentId: amendment.id,
      version: normalised.version + 1,
      updatedAt: now,
    };
    state.performanceExperiments[amendment.id] = amendment;
  });
  logActivity({
    agencyId,
    clientId: amendment.clientId,
    actorUserId,
    category: "marketing",
    action: "performance.experiment_amended",
    message: `Created revision ${amendment.revision} of split test “${amendment.name}”.`,
    metadata: { experimentId: amendment.id, amendsExperimentId: id, revision: amendment.revision },
  });
  return amendment;
}

export function deletePerformanceExperiment(
  agencyId: string,
  id: string,
  expectedVersion: number | undefined,
  actorUserId: string,
): boolean {
  const current = getState().performanceExperiments[id];
  if (!current || current.agencyId !== agencyId) return false;
  const normalised = normaliseStoredExperiment(current);
  requireExpectedVersion(normalised, expectedVersion);
  if (normalised.status !== "draft") {
    throw new PerformanceExperimentConflictError("Only draft experiments can be deleted. Completed evidence must be retained.");
  }
  mutate(state => {
    delete state.performanceExperiments[id];
    if (!normalised.amendsExperimentId) return;
    const parent = state.performanceExperiments[normalised.amendsExperimentId];
    if (!parent || parent.agencyId !== agencyId || parent.amendedByExperimentId !== id) return;
    const normalisedParent = normaliseStoredExperiment(parent);
    state.performanceExperiments[parent.id] = {
      ...normalisedParent,
      amendedByExperimentId: undefined,
      version: normalisedParent.version + 1,
      updatedAt: Date.now(),
    };
  });
  logActivity({
    agencyId,
    clientId: normalised.clientId,
    actorUserId,
    category: "marketing",
    action: "performance.experiment_deleted",
    message: `Deleted draft split test “${normalised.name}”.`,
    metadata: { experimentId: id, revision: normalised.revision },
  });
  return true;
}

function cleanVariants(value?: Array<Partial<PerformanceExperimentVariant>>): PerformanceExperimentVariant[] {
  const defaults: Array<Partial<PerformanceExperimentVariant>> = [{ id: "a", name: "Version A" }, { id: "b", name: "Version B" }];
  const rows = value === undefined ? defaults : value;
  if (rows.length < 2 || rows.length > 6) throw new PerformanceExperimentValidationError("An experiment needs between two and six variants.");
  const ids = new Set<string>();
  return rows.map((row, index) => {
    const id = clean(row.id, 60);
    if (!id) throw new PerformanceExperimentValidationError(`Variant ${index + 1} needs a stable ID.`);
    const key = id.toLocaleLowerCase("en-GB");
    if (ids.has(key)) throw new PerformanceExperimentValidationError("Variant IDs must be unique.");
    ids.add(key);
    const visitors = count(row.visitors, `Visitors for ${id}`);
    const conversions = count(row.conversions, `Conversions for ${id}`);
    if (conversions > visitors) throw new PerformanceExperimentValidationError(`Conversions cannot exceed visitors for ${id}.`);
    return {
      id,
      name: clean(row.name, 120) || `Version ${String.fromCharCode(65 + index)}`,
      visitors,
      conversions,
    };
  });
}

function amendmentVariants(variants: PerformanceExperimentVariant[]): PerformanceExperimentVariant[] {
  const used = new Set<string>();
  return variants.map((variant, index) => {
    // Same cap as cleanVariants, so an amendment never renames a stable id.
    const base = clean(variant.id, 60) || `variant-${index + 1}`;
    let id = base;
    let suffix = 2;
    while (used.has(id.toLocaleLowerCase("en-GB"))) id = `${base}-${suffix++}`;
    used.add(id.toLocaleLowerCase("en-GB"));
    return {
      id,
      name: clean(variant.name, 120) || `Version ${String.fromCharCode(65 + index)}`,
      visitors: 0,
      conversions: 0,
    };
  });
}

function validStatus(value: PerformanceExperimentStatus): PerformanceExperimentStatus {
  if (value === "draft" || value === "running" || value === "paused" || value === "complete") return value;
  throw new PerformanceExperimentValidationError("Choose a valid experiment status.");
}

function requireTransition(from: PerformanceExperimentStatus, to: PerformanceExperimentStatus): void {
  if (from === to) return;
  const allowed: Record<Exclude<PerformanceExperimentStatus, "complete">, PerformanceExperimentStatus[]> = {
    draft: ["running"],
    running: ["paused", "complete"],
    paused: ["running", "complete"],
  };
  if (from === "complete" || !allowed[from].includes(to)) {
    throw new PerformanceExperimentConflictError(`Experiment status cannot move from ${from} to ${to}.`);
  }
}

function requireExpectedVersion(experiment: PerformanceExperiment, expectedVersion: number | undefined): void {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion !== experiment.version) {
    throw new PerformanceExperimentConflictError("This experiment changed in another session. Reload it before continuing.");
  }
}

function normaliseStoredExperiment(experiment: PerformanceExperiment): PerformanceExperiment {
  return {
    ...experiment,
    version: Number.isSafeInteger(experiment.version) && experiment.version > 0 ? experiment.version : 1,
    revision: Number.isSafeInteger(experiment.revision) && experiment.revision > 0 ? experiment.revision : 1,
  };
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function count(value: unknown, label: string): number {
  if (value === undefined) return 0;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new PerformanceExperimentValidationError(`${label} must be a whole number of zero or more.`);
  }
  return value;
}
