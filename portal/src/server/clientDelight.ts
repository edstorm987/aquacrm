import "server-only";

import crypto from "node:crypto";
import { logActivity } from "./activity";
import { getExperiencePackage } from "./experiencePackages";
import { getState, mutate } from "./storage";
import { getClientForAgency } from "./tenants";
import type { ClientDelightOccasion, ClientDelightRecord, ClientDelightStatus, ExperienceAudience, ExperienceDeliveryMethod, ExperienceFulfilmentStep } from "./types";

type FulfilmentStepInput = string | { id?: string; label?: string; completed?: boolean; completedAt?: number };

export interface ClientDelightInput {
  clientId?: string;
  recipientUserId?: string;
  companyId?: string;
  packageId?: string;
  audience?: ExperienceAudience;
  recipientName: string;
  occasion?: ClientDelightOccasion;
  title: string;
  status?: ClientDelightStatus;
  deliveryMethod?: ExperienceDeliveryMethod;
  currency?: string;
  dueAt?: number;
  budgetCents?: number;
  costCents?: number;
  supplier?: string;
  trackingUrl?: string;
  bookingReference?: string;
  location?: string;
  guestCount?: number;
  includedItems?: string[];
  fulfilmentSteps?: FulfilmentStepInput[];
  notes?: string;
  outcomeNotes?: string;
}

export function listClientDelight(agencyId: string): ClientDelightRecord[] {
  return Object.values(getState().clientDelight)
    .filter(item => item.agencyId === agencyId)
    .map(normalizeRecord)
    .sort((a, b) => Number(a.status === "delivered") - Number(b.status === "delivered") || (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER) || b.createdAt - a.createdAt);
}

export function createClientDelight(agencyId: string, input: ClientDelightInput, actorUserId: string): ClientDelightRecord {
  const experiencePackage = getExperiencePackage(agencyId, input.packageId);
  const recipientName = clean(input.recipientName, 160);
  const title = clean(input.title, 180) || experiencePackage?.name || "";
  if (!recipientName || !title) throw new Error("Recipient and experience are required.");
  const clientId = validClientId(agencyId, input.clientId);
  const recipientUserId = validUserId(agencyId, input.recipientUserId);
  const now = Date.now();
  const record: ClientDelightRecord = {
    id: `delight_${crypto.randomBytes(8).toString("hex")}`,
    agencyId,
    clientId,
    recipientUserId,
    companyId: validCompanyId(agencyId, input.companyId),
    packageId: experiencePackage?.id,
    packageName: experiencePackage?.name,
    audience: validAudience(input.audience, clientId, recipientUserId),
    recipientName,
    occasion: validOccasion(input.occasion),
    title,
    status: validStatus(input.status),
    deliveryMethod: validDelivery(input.deliveryMethod ?? experiencePackage?.deliveryMethod),
    currency: cleanCurrency(input.currency ?? experiencePackage?.currency),
    dueAt: cleanDate(input.dueAt),
    budgetCents: cleanMoney(input.budgetCents ?? experiencePackage?.priceCents),
    costCents: cleanMoney(input.costCents),
    supplier: clean(input.supplier, 180) || experiencePackage?.supplier,
    trackingUrl: cleanUrl(input.trackingUrl),
    bookingReference: clean(input.bookingReference, 180) || undefined,
    location: clean(input.location, 300) || undefined,
    guestCount: cleanCount(input.guestCount),
    includedItems: input.includedItems === undefined ? [...(experiencePackage?.includedItems ?? [])] : cleanList(input.includedItems, 60, 180),
    fulfilmentSteps: input.fulfilmentSteps === undefined ? cleanSteps(experiencePackage?.fulfilmentSteps ?? []) : cleanSteps(input.fulfilmentSteps),
    notes: clean(input.notes, 2_000) || undefined,
    outcomeNotes: clean(input.outcomeNotes, 2_000) || undefined,
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => { state.clientDelight[record.id] = record; });
  logActivity({ agencyId, clientId, actorUserId, category: "onboarding", action: "client_delight.created", message: `Planned “${record.title}” for ${recipientName}.`, metadata: { delightId: record.id, occasion: record.occasion } });
  return record;
}

export function updateClientDelight(agencyId: string, id: string, input: Partial<ClientDelightInput>, actorUserId: string): ClientDelightRecord | null {
  const stored = getState().clientDelight[id];
  if (!stored || stored.agencyId !== agencyId) return null;
  const existing = normalizeRecord(stored);
  const packageChanged = input.packageId !== undefined && input.packageId !== existing.packageId;
  const experiencePackage = packageChanged ? getExperiencePackage(agencyId, input.packageId) : getExperiencePackage(agencyId, existing.packageId);
  const updated: ClientDelightRecord = {
    ...existing,
    clientId: input.clientId === undefined ? existing.clientId : validClientId(agencyId, input.clientId),
    recipientUserId: input.recipientUserId === undefined ? existing.recipientUserId : validUserId(agencyId, input.recipientUserId),
    companyId: input.companyId === undefined ? existing.companyId : validCompanyId(agencyId, input.companyId),
    packageId: packageChanged ? experiencePackage?.id : existing.packageId,
    packageName: packageChanged ? experiencePackage?.name : existing.packageName,
    audience: input.audience === undefined ? existing.audience : validAudience(input.audience, input.clientId ?? existing.clientId, input.recipientUserId ?? existing.recipientUserId),
    recipientName: input.recipientName === undefined ? existing.recipientName : clean(input.recipientName, 160) || existing.recipientName,
    occasion: input.occasion === undefined ? existing.occasion : validOccasion(input.occasion),
    title: input.title === undefined ? existing.title : clean(input.title, 180) || existing.title,
    status: input.status === undefined ? existing.status : validStatus(input.status),
    deliveryMethod: input.deliveryMethod === undefined ? (packageChanged ? validDelivery(experiencePackage?.deliveryMethod) : existing.deliveryMethod) : validDelivery(input.deliveryMethod),
    currency: input.currency === undefined ? (packageChanged ? cleanCurrency(experiencePackage?.currency) : existing.currency) : cleanCurrency(input.currency),
    dueAt: input.dueAt === undefined ? existing.dueAt : cleanDate(input.dueAt),
    budgetCents: input.budgetCents === undefined ? (packageChanged ? cleanMoney(experiencePackage?.priceCents) : existing.budgetCents) : cleanMoney(input.budgetCents),
    costCents: input.costCents === undefined ? existing.costCents : cleanMoney(input.costCents),
    supplier: input.supplier === undefined ? (packageChanged ? experiencePackage?.supplier : existing.supplier) : clean(input.supplier, 180) || undefined,
    trackingUrl: input.trackingUrl === undefined ? existing.trackingUrl : cleanUrl(input.trackingUrl),
    bookingReference: input.bookingReference === undefined ? existing.bookingReference : clean(input.bookingReference, 180) || undefined,
    location: input.location === undefined ? existing.location : clean(input.location, 300) || undefined,
    guestCount: input.guestCount === undefined ? existing.guestCount : cleanCount(input.guestCount),
    includedItems: input.includedItems === undefined ? (packageChanged ? [...(experiencePackage?.includedItems ?? [])] : existing.includedItems) : cleanList(input.includedItems, 60, 180),
    fulfilmentSteps: input.fulfilmentSteps === undefined ? (packageChanged ? cleanSteps(experiencePackage?.fulfilmentSteps ?? []) : existing.fulfilmentSteps) : cleanSteps(input.fulfilmentSteps),
    notes: input.notes === undefined ? existing.notes : clean(input.notes, 2_000) || undefined,
    outcomeNotes: input.outcomeNotes === undefined ? existing.outcomeNotes : clean(input.outcomeNotes, 2_000) || undefined,
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
function validUserId(agencyId: string, value?: string): string | undefined {
  const id = clean(value, 120);
  return id && Object.values(getState().users).some(user => user.id === id && user.agencyId === agencyId && user.role.startsWith("agency-")) ? id : undefined;
}
function validCompanyId(agencyId: string, value?: string): string | undefined {
  const id = clean(value, 120);
  return id && Object.values(getState().tradingCompanies).some(company => company.id === id && company.agencyId === agencyId) ? id : undefined;
}
function normalizeRecord(item: ClientDelightRecord): ClientDelightRecord {
  const clientId = validClientId(item.agencyId, item.clientId);
  const recipientUserId = validUserId(item.agencyId, item.recipientUserId);
  return {
    ...item,
    clientId,
    recipientUserId,
    audience: validAudience(item.audience, clientId, recipientUserId),
    deliveryMethod: validDelivery(item.deliveryMethod),
    currency: cleanCurrency(item.currency),
    includedItems: cleanList(item.includedItems, 60, 180),
    fulfilmentSteps: cleanSteps(item.fulfilmentSteps),
  };
}
function clean(value: unknown, limit: number) { return typeof value === "string" ? value.trim().slice(0, limit) : ""; }
function cleanList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => clean(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}
function cleanSteps(value: unknown): ExperienceFulfilmentStep[] {
  if (!Array.isArray(value)) return [];
  return value.reduce<ExperienceFulfilmentStep[]>((steps, item) => {
    const source = typeof item === "string" ? { label: item } : item && typeof item === "object" ? item as { id?: unknown; label?: unknown; completed?: unknown; completedAt?: unknown } : {};
    const label = clean(source.label, 180);
    if (!label || steps.length >= 60) return steps;
    const completed = source.completed === true;
    const step: ExperienceFulfilmentStep = {
      id: clean(source.id, 100) || `experience_step_${crypto.randomBytes(6).toString("hex")}`,
      label,
      completed,
    };
    if (completed) step.completedAt = cleanDate(source.completedAt) ?? Date.now();
    steps.push(step);
    return steps;
  }, []);
}
function cleanDate(value: unknown) { return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined; }
function cleanMoney(value: unknown) { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(Math.min(value, 100_000_000)) : undefined; }
function cleanCount(value: unknown) { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(Math.min(value, 10_000)) : undefined; }
function cleanCurrency(value: unknown) { const currency = clean(value, 3).toUpperCase(); return /^[A-Z]{3}$/.test(currency) ? currency : "GBP"; }
function cleanUrl(value: unknown) { const raw = clean(value, 2_000); if (!raw) return undefined; try { const url = new URL(raw); return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined; } catch { return undefined; } }
function validOccasion(value?: ClientDelightOccasion): ClientDelightOccasion { return ["welcome", "birthday", "christmas", "milestone", "event", "trip", "random", "shock-and-awe", "other"].includes(value ?? "") ? value! : "random"; }
function validStatus(value?: ClientDelightStatus): ClientDelightStatus { return ["planned", "ordered", "sent", "delivered", "cancelled"].includes(value ?? "") ? value! : "idea"; }
function validAudience(value?: ExperienceAudience, clientId?: string, recipientUserId?: string): ExperienceAudience { return ["client", "staff", "partner", "personal"].includes(value ?? "") ? value! : recipientUserId ? "staff" : clientId ? "client" : "partner"; }
function validDelivery(value?: ExperienceDeliveryMethod): ExperienceDeliveryMethod { return ["delivery", "digital", "in-person", "travel", "flexible"].includes(value ?? "") ? value! : "flexible"; }
