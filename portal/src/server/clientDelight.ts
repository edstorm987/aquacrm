import "server-only";

import crypto from "node:crypto";
import { logActivity } from "./activity";
import { getState, mutate } from "./storage";
import { getClientForAgency } from "./tenants";
import type { ClientDelightOccasion, ClientDelightRecord, ClientDelightStatus } from "./types";

export interface ClientDelightInput {
  clientId?: string;
  recipientName: string;
  occasion?: ClientDelightOccasion;
  title: string;
  status?: ClientDelightStatus;
  dueAt?: number;
  budgetCents?: number;
  costCents?: number;
  supplier?: string;
  trackingUrl?: string;
  notes?: string;
}

export function listClientDelight(agencyId: string): ClientDelightRecord[] {
  return Object.values(getState().clientDelight)
    .filter(item => item.agencyId === agencyId)
    .sort((a, b) => Number(a.status === "delivered") - Number(b.status === "delivered") || (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER) || b.createdAt - a.createdAt);
}

export function createClientDelight(agencyId: string, input: ClientDelightInput, actorUserId: string): ClientDelightRecord {
  const recipientName = clean(input.recipientName, 160);
  const title = clean(input.title, 180);
  if (!recipientName || !title) throw new Error("Recipient and gift are required.");
  const clientId = validClientId(agencyId, input.clientId);
  const now = Date.now();
  const record: ClientDelightRecord = {
    id: `delight_${crypto.randomBytes(8).toString("hex")}`,
    agencyId,
    clientId,
    recipientName,
    occasion: validOccasion(input.occasion),
    title,
    status: validStatus(input.status),
    dueAt: cleanDate(input.dueAt),
    budgetCents: cleanMoney(input.budgetCents),
    costCents: cleanMoney(input.costCents),
    supplier: clean(input.supplier, 180) || undefined,
    trackingUrl: cleanUrl(input.trackingUrl),
    notes: clean(input.notes, 2_000) || undefined,
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => { state.clientDelight[record.id] = record; });
  logActivity({ agencyId, clientId, actorUserId, category: "onboarding", action: "client_delight.created", message: `Planned “${record.title}” for ${recipientName}.`, metadata: { delightId: record.id, occasion: record.occasion } });
  return record;
}

export function updateClientDelight(agencyId: string, id: string, input: Partial<ClientDelightInput>, actorUserId: string): ClientDelightRecord | null {
  const existing = getState().clientDelight[id];
  if (!existing || existing.agencyId !== agencyId) return null;
  const updated: ClientDelightRecord = {
    ...existing,
    clientId: input.clientId === undefined ? existing.clientId : validClientId(agencyId, input.clientId),
    recipientName: input.recipientName === undefined ? existing.recipientName : clean(input.recipientName, 160) || existing.recipientName,
    occasion: input.occasion === undefined ? existing.occasion : validOccasion(input.occasion),
    title: input.title === undefined ? existing.title : clean(input.title, 180) || existing.title,
    status: input.status === undefined ? existing.status : validStatus(input.status),
    dueAt: input.dueAt === undefined ? existing.dueAt : cleanDate(input.dueAt),
    budgetCents: input.budgetCents === undefined ? existing.budgetCents : cleanMoney(input.budgetCents),
    costCents: input.costCents === undefined ? existing.costCents : cleanMoney(input.costCents),
    supplier: input.supplier === undefined ? existing.supplier : clean(input.supplier, 180) || undefined,
    trackingUrl: input.trackingUrl === undefined ? existing.trackingUrl : cleanUrl(input.trackingUrl),
    notes: input.notes === undefined ? existing.notes : clean(input.notes, 2_000) || undefined,
    updatedAt: Date.now(),
  };
  mutate(state => { state.clientDelight[id] = updated; });
  logActivity({ agencyId, clientId: updated.clientId, actorUserId, category: "onboarding", action: "client_delight.updated", message: `Updated “${updated.title}” for ${updated.recipientName}.`, metadata: { delightId: id, status: updated.status } });
  return updated;
}

export function deleteClientDelight(agencyId: string, id: string): boolean {
  const existing = getState().clientDelight[id];
  if (!existing || existing.agencyId !== agencyId) return false;
  mutate(state => { delete state.clientDelight[id]; });
  return true;
}

function validClientId(agencyId: string, value?: string): string | undefined {
  const id = clean(value, 120);
  return id && getClientForAgency(agencyId, id) ? id : undefined;
}
function clean(value: unknown, limit: number) { return typeof value === "string" ? value.trim().slice(0, limit) : ""; }
function cleanDate(value: unknown) { return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined; }
function cleanMoney(value: unknown) { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(Math.min(value, 100_000_000)) : undefined; }
function cleanUrl(value: unknown) { const raw = clean(value, 2_000); if (!raw) return undefined; try { const url = new URL(raw); return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined; } catch { return undefined; } }
function validOccasion(value?: ClientDelightOccasion): ClientDelightOccasion { return ["welcome", "birthday", "christmas", "milestone", "event", "trip", "random", "shock-and-awe", "other"].includes(value ?? "") ? value! : "random"; }
function validStatus(value?: ClientDelightStatus): ClientDelightStatus { return ["planned", "ordered", "sent", "delivered", "cancelled"].includes(value ?? "") ? value! : "idea"; }
