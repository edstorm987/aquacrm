import type { ClientMilestone, ClientMilestoneStatus } from "@/server/types";

import { isJsonRecord } from "./performanceMutationPayloads";

export type ClientMilestoneWritePayload = {
  ok: true;
  milestone: ClientMilestone;
  milestones: ClientMilestone[];
};

export type ClientMilestoneDeletePayload = {
  ok: true;
  clientId: string;
  milestoneId: string;
  milestones: ClientMilestone[];
};

type ClientMilestoneExpectedFields = Partial<Pick<
  ClientMilestone,
  "title" | "description" | "status" | "progress" | "targetAt" | "metric" | "targetValue" | "autoTrack"
>>;

export type ExpectedClientMilestoneWrite = {
  clientId: string;
  milestoneId?: string;
  fields: ClientMilestoneExpectedFields;
};

const MILESTONE_STATUSES = new Set<ClientMilestoneStatus>(["not-started", "in-progress", "complete", "blocked"]);
const MILESTONE_METRICS = new Set<NonNullable<ClientMilestone["metric"]>>(["pageviews", "visitors", "conversions", "search-clicks"]);
const MILESTONE_SNAPSHOT_FIELDS = [
  "id",
  "agencyId",
  "clientId",
  "title",
  "description",
  "status",
  "progress",
  "targetAt",
  "metric",
  "targetValue",
  "currentValue",
  "autoTrack",
  "completedAt",
  "sortOrder",
  "createdAt",
  "updatedAt",
] as const satisfies readonly (keyof ClientMilestone)[];

function optionalFiniteNumber(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function isClientMilestoneSnapshot(value: unknown, clientId: string): value is ClientMilestone {
  const milestone = isJsonRecord(value) ? value : null;
  return Boolean(
    milestone
    && typeof milestone.id === "string" && milestone.id.length > 0
    && typeof milestone.agencyId === "string" && milestone.agencyId.length > 0
    && milestone.clientId === clientId
    && typeof milestone.title === "string" && milestone.title.length > 0
    && (milestone.description === undefined || typeof milestone.description === "string")
    && typeof milestone.status === "string" && MILESTONE_STATUSES.has(milestone.status as ClientMilestoneStatus)
    && typeof milestone.progress === "number" && Number.isFinite(milestone.progress) && milestone.progress >= 0 && milestone.progress <= 100
    && optionalFiniteNumber(milestone.targetAt)
    && (milestone.metric === undefined || (typeof milestone.metric === "string" && MILESTONE_METRICS.has(milestone.metric as NonNullable<ClientMilestone["metric"]>)))
    && optionalFiniteNumber(milestone.targetValue)
    && optionalFiniteNumber(milestone.currentValue)
    && (milestone.autoTrack === undefined || typeof milestone.autoTrack === "boolean")
    && optionalFiniteNumber(milestone.completedAt)
    && typeof milestone.sortOrder === "number" && Number.isFinite(milestone.sortOrder)
    && typeof milestone.createdAt === "number" && Number.isFinite(milestone.createdAt)
    && typeof milestone.updatedAt === "number" && Number.isFinite(milestone.updatedAt)
  );
}

function isClientMilestoneCollection(value: unknown, clientId: string): value is ClientMilestone[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  for (const milestone of value) {
    if (!isClientMilestoneSnapshot(milestone, clientId) || ids.has(milestone.id)) return false;
    ids.add(milestone.id);
  }
  return true;
}

function sameMilestoneSnapshot(left: ClientMilestone, right: ClientMilestone): boolean {
  return MILESTONE_SNAPSHOT_FIELDS.every(field => left[field] === right[field]);
}

const EXPECTED_MILESTONE_FIELDS = [
  "title",
  "description",
  "status",
  "progress",
  "targetAt",
  "metric",
  "targetValue",
  "autoTrack",
] as const satisfies readonly (keyof ClientMilestoneExpectedFields)[];

function matchesExpectedMilestoneFields(
  milestone: ClientMilestone,
  fields: ClientMilestoneExpectedFields,
): boolean {
  return EXPECTED_MILESTONE_FIELDS.every(field => (
    !Object.prototype.hasOwnProperty.call(fields, field)
    || milestone[field] === fields[field]
  ));
}

export function isClientMilestoneWritePayload(
  value: unknown,
  expected: ExpectedClientMilestoneWrite,
): value is ClientMilestoneWritePayload {
  const payload = isJsonRecord(value) ? value : null;
  if (!payload || payload.ok !== true) return false;
  const milestone = payload.milestone;
  const milestones = payload.milestones;
  if (
    !isClientMilestoneSnapshot(milestone, expected.clientId)
    || (expected.milestoneId !== undefined && milestone.id !== expected.milestoneId)
    || !matchesExpectedMilestoneFields(milestone, expected.fields)
    || !isClientMilestoneCollection(milestones, expected.clientId)
  ) return false;
  const authoritative = milestones.find(item => item.id === milestone.id);
  return Boolean(authoritative && sameMilestoneSnapshot(milestone, authoritative));
}

export function isClientMilestoneDeletePayload(
  value: unknown,
  clientId: string,
  milestoneId: string,
): value is ClientMilestoneDeletePayload {
  const payload = isJsonRecord(value) ? value : null;
  return Boolean(
    payload
    && payload.ok === true
    && payload.clientId === clientId
    && payload.milestoneId === milestoneId
    && isClientMilestoneCollection(payload.milestones, clientId)
    && !payload.milestones.some(item => item.id === milestoneId)
  );
}
