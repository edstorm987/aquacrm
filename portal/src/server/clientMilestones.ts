import "server-only";

import crypto from "node:crypto";
import { logActivity } from "./activity";
import { getState, mutate } from "./storage";
import { getClientForAgency } from "./tenants";
import type { ClientMilestone, ClientMilestoneStatus } from "./types";
import { performanceMetricValue } from "@/lib/performance/performanceAnalytics";
import type { ClientTelemetryEvent } from "@/lib/clients/clientTelemetry";
import {
  removeClientRecordLedgerEvent,
  upsertClientMilestoneLedgerEvent,
} from "@/lib/server/clients/clientRecordLedger";

/**
 * A caller-correctable refusal (blank title). Routes answer it 400 with the
 * message; any other failure is unexpected and must not leak its text.
 */
export class ClientMilestoneValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientMilestoneValidationError";
  }
}

export interface ClientMilestoneInput {
  title: string;
  description?: string;
  status?: ClientMilestoneStatus;
  progress?: number;
  targetAt?: number;
  metric?: ClientMilestone["metric"];
  targetValue?: number;
  autoTrack?: boolean;
  sortOrder?: number;
}

export function listClientMilestones(agencyId: string, clientId?: string): ClientMilestone[] {
  return Object.values(getState().clientMilestones)
    .filter(item => item.agencyId === agencyId && (!clientId || item.clientId === clientId))
    .sort((a, b) => a.sortOrder - b.sortOrder || (a.targetAt ?? Number.MAX_SAFE_INTEGER) - (b.targetAt ?? Number.MAX_SAFE_INTEGER));
}

export function createClientMilestone(agencyId: string, clientId: string, input: ClientMilestoneInput, actorUserId: string): ClientMilestone {
  const client = getClientForAgency(agencyId, clientId);
  if (!client) throw new Error("Client not found.");
  const title = clean(input.title, 160);
  if (!title) throw new ClientMilestoneValidationError("Milestone title required.");
  const now = Date.now();
  const status = validStatus(input.status);
  const progress = status === "complete" ? 100 : cleanProgress(input.progress);
  const milestone: ClientMilestone = {
    id: `mile_${crypto.randomBytes(8).toString("hex")}`,
    agencyId,
    clientId,
    title,
    description: clean(input.description, 1_000) || undefined,
    status,
    progress,
    targetAt: cleanDate(input.targetAt),
    metric: cleanMetric(input.metric),
    targetValue: cleanTarget(input.targetValue),
    currentValue: input.autoTrack ? 0 : undefined,
    autoTrack: Boolean(input.autoTrack && cleanMetric(input.metric) && cleanTarget(input.targetValue)),
    completedAt: status === "complete" ? now : undefined,
    sortOrder: input.sortOrder ?? listClientMilestones(agencyId, clientId).length,
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => { state.clientMilestones[milestone.id] = milestone; });
  upsertClientMilestoneLedgerEvent(agencyId, clientId, milestone);
  logActivity({ agencyId, clientId, actorUserId, category: "fulfillment", action: "milestone.created", message: `Added milestone “${title}” for ${client.name}.`, metadata: { milestoneId: milestone.id } });
  return milestone;
}

export function updateClientMilestone(agencyId: string, clientId: string, id: string, input: Partial<ClientMilestoneInput>, actorUserId: string): ClientMilestone | null {
  const existing = getState().clientMilestones[id];
  if (!existing || existing.agencyId !== agencyId || existing.clientId !== clientId) return null;
  const status = input.status ? validStatus(input.status) : existing.status;
  const progress = status === "complete" ? 100 : input.progress === undefined ? existing.progress : cleanProgress(input.progress);
  const updated: ClientMilestone = {
    ...existing,
    title: input.title === undefined ? existing.title : clean(input.title, 160) || existing.title,
    description: input.description === undefined ? existing.description : clean(input.description, 1_000) || undefined,
    status,
    progress,
    targetAt: input.targetAt === undefined ? existing.targetAt : cleanDate(input.targetAt),
    metric: input.metric === undefined ? existing.metric : cleanMetric(input.metric),
    targetValue: input.targetValue === undefined ? existing.targetValue : cleanTarget(input.targetValue),
    autoTrack: input.autoTrack === undefined ? existing.autoTrack : Boolean(input.autoTrack),
    completedAt: status === "complete" ? existing.completedAt ?? Date.now() : undefined,
    sortOrder: input.sortOrder ?? existing.sortOrder,
    updatedAt: Date.now(),
  };
  mutate(state => { state.clientMilestones[id] = updated; });
  upsertClientMilestoneLedgerEvent(agencyId, clientId, updated);
  logActivity({ agencyId, clientId, actorUserId, category: "fulfillment", action: "milestone.updated", message: `Updated milestone “${updated.title}”.`, metadata: { milestoneId: id, status, progress } });
  return updated;
}

export function syncClientPerformanceMilestones(agencyId: string, clientId: string): void {
  const client = getClientForAgency(agencyId, clientId);
  if (!client) return;
  const events = Array.isArray(client.metadata?.telemetryEvents)
    ? client.metadata.telemetryEvents as ClientTelemetryEvent[]
    : [];
  const tracked = listClientMilestones(agencyId, clientId).filter(item =>
    item.autoTrack && item.metric && item.targetValue && item.status !== "blocked"
  );
  if (!tracked.length) return;
  const now = Date.now();
  mutate(state => {
    for (const milestone of tracked) {
      const currentValue = performanceMetricValue(events, milestone.metric as string);
      const progress = Math.min(100, Math.round((currentValue / (milestone.targetValue as number)) * 100));
      const complete = currentValue >= (milestone.targetValue as number);
      state.clientMilestones[milestone.id] = {
        ...milestone,
        currentValue,
        progress,
        status: complete ? "complete" : currentValue > 0 ? "in-progress" : "not-started",
        completedAt: complete ? milestone.completedAt ?? now : undefined,
        updatedAt: now,
      };
    }
  });
  for (const milestone of tracked) {
    const updated = getState().clientMilestones[milestone.id];
    if (updated) upsertClientMilestoneLedgerEvent(agencyId, clientId, updated);
  }
}

export function deleteClientMilestone(agencyId: string, clientId: string, id: string): boolean {
  const existing = getState().clientMilestones[id];
  if (!existing || existing.agencyId !== agencyId || existing.clientId !== clientId) return false;
  mutate(state => { delete state.clientMilestones[id]; });
  removeClientRecordLedgerEvent(agencyId, clientId, "delivery", `delivery:${id}`);
  return true;
}

function clean(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function cleanProgress(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(Math.max(0, Math.min(100, value))) : 0;
}

function cleanDate(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function cleanMetric(value: unknown): ClientMilestone["metric"] {
  return value === "pageviews" || value === "visitors" || value === "conversions" || value === "search-clicks"
    ? value
    : undefined;
}

function cleanTarget(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : undefined;
}

function validStatus(value?: ClientMilestoneStatus): ClientMilestoneStatus {
  return value === "in-progress" || value === "complete" || value === "blocked" ? value : "not-started";
}
