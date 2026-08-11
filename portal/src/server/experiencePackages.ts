import "server-only";

import crypto from "node:crypto";
import { logActivity } from "./activity";
import { getState, mutate } from "./storage";
import type { ExperienceDeliveryMethod, ExperiencePackage, ExperiencePackageAudience } from "./types";

export interface ExperiencePackageInput {
  companyIds?: string[];
  name: string;
  category?: string;
  summary?: string;
  audience?: ExperiencePackageAudience;
  deliveryMethod?: ExperienceDeliveryMethod;
  priceCents?: number;
  currency?: string;
  leadTimeDays?: number;
  supplier?: string;
  bookingUrl?: string;
  includedItems?: string[];
  fulfilmentSteps?: string[];
  active?: boolean;
}

export function listExperiencePackages(agencyId: string, includeArchived = false): ExperiencePackage[] {
  return Object.values(getState().experiencePackages)
    .filter(item => item.agencyId === agencyId && (includeArchived || item.active))
    .map(normalizePackage)
    .sort((a, b) => Number(b.active) - Number(a.active) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

export function getExperiencePackage(agencyId: string, id?: string): ExperiencePackage | null {
  if (!id) return null;
  const item = getState().experiencePackages[id];
  return item?.agencyId === agencyId ? normalizePackage(item) : null;
}

export function createExperiencePackage(agencyId: string, input: ExperiencePackageInput, actorUserId: string): ExperiencePackage {
  const name = clean(input.name, 140);
  if (!name) throw new Error("Package name is required.");
  const now = Date.now();
  const item: ExperiencePackage = {
    id: `experience_package_${crypto.randomBytes(8).toString("hex")}`,
    agencyId,
    companyIds: cleanCompanyIds(agencyId, input.companyIds),
    name,
    category: clean(input.category, 80) || "Experience",
    summary: clean(input.summary, 600) || undefined,
    audience: validAudience(input.audience),
    deliveryMethod: validDelivery(input.deliveryMethod),
    priceCents: cleanMoney(input.priceCents),
    currency: cleanCurrency(input.currency),
    leadTimeDays: cleanDays(input.leadTimeDays),
    supplier: clean(input.supplier, 180) || undefined,
    bookingUrl: cleanUrl(input.bookingUrl),
    includedItems: cleanList(input.includedItems, 40, 180),
    fulfilmentSteps: cleanList(input.fulfilmentSteps, 40, 180),
    active: input.active !== false,
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => { state.experiencePackages[item.id] = item; });
  logActivity({ agencyId, actorUserId, category: "onboarding", action: "experience_package.created", message: `Created experience package “${item.name}”.`, metadata: { packageId: item.id, audience: item.audience } });
  return item;
}

export function updateExperiencePackage(agencyId: string, id: string, input: Partial<ExperiencePackageInput>, actorUserId: string): ExperiencePackage | null {
  const stored = getState().experiencePackages[id];
  if (!stored || stored.agencyId !== agencyId) return null;
  const existing = normalizePackage(stored);
  const item: ExperiencePackage = {
    ...existing,
    companyIds: input.companyIds === undefined ? existing.companyIds : cleanCompanyIds(agencyId, input.companyIds),
    name: input.name === undefined ? existing.name : clean(input.name, 140) || existing.name,
    category: input.category === undefined ? existing.category : clean(input.category, 80) || "Experience",
    summary: input.summary === undefined ? existing.summary : clean(input.summary, 600) || undefined,
    audience: input.audience === undefined ? existing.audience : validAudience(input.audience),
    deliveryMethod: input.deliveryMethod === undefined ? existing.deliveryMethod : validDelivery(input.deliveryMethod),
    priceCents: input.priceCents === undefined ? existing.priceCents : cleanMoney(input.priceCents),
    currency: input.currency === undefined ? existing.currency : cleanCurrency(input.currency),
    leadTimeDays: input.leadTimeDays === undefined ? existing.leadTimeDays : cleanDays(input.leadTimeDays),
    supplier: input.supplier === undefined ? existing.supplier : clean(input.supplier, 180) || undefined,
    bookingUrl: input.bookingUrl === undefined ? existing.bookingUrl : cleanUrl(input.bookingUrl),
    includedItems: input.includedItems === undefined ? existing.includedItems : cleanList(input.includedItems, 40, 180),
    fulfilmentSteps: input.fulfilmentSteps === undefined ? existing.fulfilmentSteps : cleanList(input.fulfilmentSteps, 40, 180),
    active: input.active === undefined ? existing.active : Boolean(input.active),
    updatedAt: Date.now(),
  };
  mutate(state => { state.experiencePackages[id] = item; });
  logActivity({ agencyId, actorUserId, category: "onboarding", action: "experience_package.updated", message: `Updated experience package “${item.name}”.`, metadata: { packageId: id, active: item.active } });
  return item;
}

export function deleteExperiencePackage(agencyId: string, id: string): boolean {
  const item = getState().experiencePackages[id];
  if (!item || item.agencyId !== agencyId) return false;
  mutate(state => { delete state.experiencePackages[id]; });
  return true;
}

function normalizePackage(item: ExperiencePackage): ExperiencePackage {
  return {
    ...item,
    companyIds: Array.isArray(item.companyIds) ? item.companyIds : [],
    audience: validAudience(item.audience),
    deliveryMethod: validDelivery(item.deliveryMethod),
    currency: cleanCurrency(item.currency),
    includedItems: Array.isArray(item.includedItems) ? item.includedItems : [],
    fulfilmentSteps: Array.isArray(item.fulfilmentSteps) ? item.fulfilmentSteps : [],
    active: item.active !== false,
  };
}

function cleanCompanyIds(agencyId: string, values?: string[]): string[] {
  const validIds = new Set(Object.values(getState().tradingCompanies).filter(company => company.agencyId === agencyId).map(company => company.id));
  return cleanList(values, 30, 120).filter(id => validIds.has(id));
}
function clean(value: unknown, limit: number) { return typeof value === "string" ? value.trim().slice(0, limit) : ""; }
function cleanList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => clean(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}
function cleanMoney(value: unknown) { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(Math.min(value, 100_000_000)) : undefined; }
function cleanDays(value: unknown) { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(Math.min(value, 3_650)) : undefined; }
function cleanCurrency(value: unknown) { const currency = clean(value, 3).toUpperCase(); return /^[A-Z]{3}$/.test(currency) ? currency : "GBP"; }
function cleanUrl(value: unknown) { const raw = clean(value, 2_000); if (!raw) return undefined; try { const url = new URL(raw); return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined; } catch { return undefined; } }
function validAudience(value?: ExperiencePackageAudience): ExperiencePackageAudience { return ["client", "staff", "either"].includes(value ?? "") ? value! : "either"; }
function validDelivery(value?: ExperienceDeliveryMethod): ExperienceDeliveryMethod { return ["delivery", "digital", "in-person", "travel", "flexible"].includes(value ?? "") ? value! : "flexible"; }
