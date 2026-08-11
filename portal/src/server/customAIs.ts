import "server-only";

import crypto from "node:crypto";
import { logActivity } from "./activity";
import { getState, mutate } from "./storage";
import type { CustomAIRecord, CustomAIStatus } from "./types";

export interface SaveCustomAIInput {
  name?: string;
  purpose?: string;
  provider?: string;
  workspaceUrl?: string;
  docsUrl?: string;
  status?: CustomAIStatus;
  ownerUserId?: string;
  capabilities?: string[];
  notes?: string;
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeUrl(value: unknown, required = false): string | undefined {
  const raw = clean(value, 1_500);
  if (!raw) {
    if (required) throw new Error("Workspace link required.");
    return undefined;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    throw new Error("Use a valid http or https link.");
  }
}

function status(value: unknown): CustomAIStatus {
  return value === "active" || value === "paused" || value === "retired" ? value : "testing";
}

function capabilities(values?: string[]): string[] {
  return [...new Set((values ?? []).map(value => clean(value, 80)).filter(Boolean))].slice(0, 30);
}

export function listCustomAIs(agencyId: string): CustomAIRecord[] {
  return Object.values(getState().customAIs)
    .filter(record => record.agencyId === agencyId)
    .sort((left, right) => Number(right.status === "active") - Number(left.status === "active") || left.name.localeCompare(right.name));
}

export function createCustomAI(agencyId: string, input: SaveCustomAIInput, actorUserId: string): CustomAIRecord {
  const name = clean(input.name, 160);
  if (!name) throw new Error("AI name required.");
  const now = Date.now();
  const record: CustomAIRecord = {
    id: `cai_${crypto.randomBytes(8).toString("hex")}`,
    agencyId,
    name,
    purpose: clean(input.purpose, 1_000) || undefined,
    provider: clean(input.provider, 120) || undefined,
    workspaceUrl: safeUrl(input.workspaceUrl, true) as string,
    docsUrl: safeUrl(input.docsUrl),
    status: status(input.status),
    ownerUserId: clean(input.ownerUserId, 120) || undefined,
    capabilities: capabilities(input.capabilities),
    notes: clean(input.notes, 5_000) || undefined,
    createdBy: actorUserId,
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => { state.customAIs[record.id] = record; });
  logActivity({ agencyId, actorUserId, category: "system", action: "custom-ai.created", message: `Registered custom AI "${record.name}".`, metadata: { customAIId: record.id } });
  return record;
}

export function updateCustomAI(agencyId: string, recordId: string, input: SaveCustomAIInput, actorUserId: string): CustomAIRecord | null {
  const existing = getState().customAIs[recordId];
  if (!existing || existing.agencyId !== agencyId) return null;
  const updated: CustomAIRecord = {
    ...existing,
    name: input.name === undefined ? existing.name : clean(input.name, 160) || existing.name,
    purpose: input.purpose === undefined ? existing.purpose : clean(input.purpose, 1_000) || undefined,
    provider: input.provider === undefined ? existing.provider : clean(input.provider, 120) || undefined,
    workspaceUrl: input.workspaceUrl === undefined ? existing.workspaceUrl : safeUrl(input.workspaceUrl, true) as string,
    docsUrl: input.docsUrl === undefined ? existing.docsUrl : safeUrl(input.docsUrl),
    status: input.status === undefined ? existing.status : status(input.status),
    ownerUserId: input.ownerUserId === undefined ? existing.ownerUserId : clean(input.ownerUserId, 120) || undefined,
    capabilities: input.capabilities === undefined ? existing.capabilities : capabilities(input.capabilities),
    notes: input.notes === undefined ? existing.notes : clean(input.notes, 5_000) || undefined,
    updatedAt: Date.now(),
  };
  mutate(state => { state.customAIs[recordId] = updated; });
  logActivity({ agencyId, actorUserId, category: "system", action: "custom-ai.updated", message: `Updated custom AI "${updated.name}".`, metadata: { customAIId: recordId } });
  return updated;
}

export function deleteCustomAI(agencyId: string, recordId: string, actorUserId: string): boolean {
  const existing = getState().customAIs[recordId];
  if (!existing || existing.agencyId !== agencyId) return false;
  mutate(state => { delete state.customAIs[recordId]; });
  logActivity({ agencyId, actorUserId, category: "system", action: "custom-ai.deleted", message: `Removed custom AI "${existing.name}".`, metadata: { customAIId: recordId } });
  return true;
}
