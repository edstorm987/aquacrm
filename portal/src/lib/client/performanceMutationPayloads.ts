import type {
  PerformanceExperiment,
  PerformanceExperimentStatus,
  PerformanceExperimentVariant,
} from "@/server/types";

export type JsonRecord = Record<string, unknown>;

export function isJsonRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isArrayOf<T>(
  value: unknown,
  predicate: (item: unknown) => item is T,
): value is T[] {
  return Array.isArray(value) && value.every(predicate);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalNonBlankString(value: unknown): value is string | undefined {
  return value === undefined || isNonBlankString(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPerformanceExperimentStatus(value: unknown): value is PerformanceExperimentStatus {
  return value === "draft" || value === "running" || value === "paused" || value === "complete";
}

function isPerformanceExperimentVariant(value: unknown): value is PerformanceExperimentVariant {
  if (!isJsonRecord(value)) return false;
  return isNonBlankString(value.id)
    && isNonBlankString(value.name)
    && isCount(value.visitors)
    && isCount(value.conversions)
    && value.conversions <= value.visitors;
}

export function isPerformanceExperiment(value: unknown): value is PerformanceExperiment {
  if (!isJsonRecord(value)
    || !isNonBlankString(value.id)
    || !isNonBlankString(value.agencyId)
    || !isOptionalNonBlankString(value.clientId)
    || !isOptionalNonBlankString(value.propertyId)
    || !isNonBlankString(value.name)
    || !isOptionalNonBlankString(value.hypothesis)
    || !isNonBlankString(value.primaryMetric)
    || !isPerformanceExperimentStatus(value.status)
    || !isArrayOf(value.variants, isPerformanceExperimentVariant)
    || value.variants.length < 2
    || value.variants.length > 6
    || !isPositiveInteger(value.version)
    || !isPositiveInteger(value.revision)
    || !isOptionalNonBlankString(value.amendsExperimentId)
    || !isOptionalNonBlankString(value.amendedByExperimentId)
    || (value.startedAt !== undefined && !isFiniteNumber(value.startedAt))
    || (value.endedAt !== undefined && !isFiniteNumber(value.endedAt))
    || !isNonBlankString(value.createdBy)
    || !isFiniteNumber(value.createdAt)
    || !isFiniteNumber(value.updatedAt)) {
    return false;
  }
  return new Set(value.variants.map(variant => variant.id.toLocaleLowerCase("en-GB"))).size === value.variants.length;
}

export interface ExpectedPerformanceExperimentSave {
  id?: string;
  expectedVersion?: number;
  clientId?: string;
  name: string;
  hypothesis?: string;
  primaryMetric: string;
  status: PerformanceExperimentStatus;
  variants: PerformanceExperimentVariant[];
}

export interface PerformanceExperimentSaveReceipt {
  ok: true;
  experiment: PerformanceExperiment;
  experiments: PerformanceExperiment[];
}

export interface ExpectedPerformanceExperimentAmend {
  sourceId: string;
  sourceVersion: number;
  sourceRevision: number;
  clientId?: string;
}

export interface PerformanceExperimentAmendReceipt extends PerformanceExperimentSaveReceipt {}

export interface ExpectedPerformanceExperimentDelete {
  experimentId: string;
  clientId?: string;
}

export interface PerformanceExperimentDeleteReceipt {
  ok: true;
  experimentId: string;
  experiments: PerformanceExperiment[];
}

function sameOptionalString(left: unknown, right: string | undefined): boolean {
  return (left === undefined ? undefined : left) === right;
}

function sameVariant(left: PerformanceExperimentVariant, right: PerformanceExperimentVariant): boolean {
  return left.id === right.id
    && left.name === right.name
    && left.visitors === right.visitors
    && left.conversions === right.conversions;
}

function sameExperiment(left: PerformanceExperiment, right: PerformanceExperiment): boolean {
  return left.id === right.id
    && left.agencyId === right.agencyId
    && left.clientId === right.clientId
    && left.propertyId === right.propertyId
    && left.name === right.name
    && left.hypothesis === right.hypothesis
    && left.primaryMetric === right.primaryMetric
    && left.status === right.status
    && left.variants.length === right.variants.length
    && left.variants.every((variant, index) => sameVariant(variant, right.variants[index]!))
    && left.version === right.version
    && left.revision === right.revision
    && left.amendsExperimentId === right.amendsExperimentId
    && left.amendedByExperimentId === right.amendedByExperimentId
    && left.startedAt === right.startedAt
    && left.endedAt === right.endedAt
    && left.createdBy === right.createdBy
    && left.createdAt === right.createdAt
    && left.updatedAt === right.updatedAt;
}

function scopedExperiments(value: unknown, clientId: string | undefined): PerformanceExperiment[] | null {
  if (!isArrayOf(value, isPerformanceExperiment)) return null;
  const ids = new Set(value.map(experiment => experiment.id));
  if (ids.size !== value.length) return null;
  return value.every(experiment => experiment.clientId === clientId) ? value : null;
}

function receiptExperiment(
  value: unknown,
  clientId: string | undefined,
): { payload: JsonRecord; experiment: PerformanceExperiment; experiments: PerformanceExperiment[] } | null {
  if (!isJsonRecord(value) || value.ok !== true || !isPerformanceExperiment(value.experiment)) return null;
  const experiment = value.experiment;
  const experiments = scopedExperiments(value.experiments, clientId);
  if (!experiments) return null;
  const authoritative = experiments.find(candidate => candidate.id === experiment.id);
  return authoritative && sameExperiment(authoritative, experiment)
    ? { payload: value, experiment, experiments }
    : null;
}

export function isPerformanceExperimentSaveReceipt(
  value: unknown,
  expected: ExpectedPerformanceExperimentSave,
): value is PerformanceExperimentSaveReceipt {
  const receipt = receiptExperiment(value, expected.clientId);
  if (!receipt) return false;
  const { experiment } = receipt;
  const versionMatches = expected.id
    ? Number.isSafeInteger(expected.expectedVersion)
      && experiment.version === expected.expectedVersion! + 1
    : experiment.version === 1 && experiment.revision === 1;
  return versionMatches
    && (!expected.id || experiment.id === expected.id)
    && experiment.clientId === expected.clientId
    && experiment.name === expected.name
    && sameOptionalString(experiment.hypothesis, expected.hypothesis)
    && experiment.primaryMetric === expected.primaryMetric
    && experiment.status === expected.status
    && experiment.variants.length === expected.variants.length
    && experiment.variants.every((variant, index) => sameVariant(variant, expected.variants[index]!));
}

export function isPerformanceExperimentAmendReceipt(
  value: unknown,
  expected: ExpectedPerformanceExperimentAmend,
): value is PerformanceExperimentAmendReceipt {
  const receipt = receiptExperiment(value, expected.clientId);
  if (!receipt) return false;
  const { experiment, experiments } = receipt;
  const source = experiments.find(candidate => candidate.id === expected.sourceId);
  return experiment.id !== expected.sourceId
    && experiment.clientId === expected.clientId
    && experiment.status === "draft"
    && experiment.version === 1
    && experiment.revision === expected.sourceRevision + 1
    && experiment.amendsExperimentId === expected.sourceId
    && experiment.amendedByExperimentId === undefined
    && Boolean(source)
    && experiment.variants.length === source!.variants.length
    && experiment.variants.every((variant, index) => {
      const sourceVariant = source!.variants[index]!;
      return variant.id === sourceVariant.id
        && variant.name === sourceVariant.name
        && variant.visitors === 0
        && variant.conversions === 0;
    })
    && source!.amendedByExperimentId === experiment.id
    && source!.version === expected.sourceVersion + 1;
}

export function isPerformanceExperimentDeleteReceipt(
  value: unknown,
  expected: ExpectedPerformanceExperimentDelete,
): value is PerformanceExperimentDeleteReceipt {
  if (!isJsonRecord(value) || value.ok !== true || value.experimentId !== expected.experimentId) return false;
  const experiments = scopedExperiments(value.experiments, expected.clientId);
  return Boolean(experiments) && !experiments!.some(experiment => experiment.id === expected.experimentId);
}
