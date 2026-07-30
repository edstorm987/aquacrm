import "server-only";

import crypto from "node:crypto";
import { logActivity } from "./activity";
import { getState, mutate } from "./storage";
import type { BrandKit, TradingCompany, TradingCompanyStatus } from "./types";

export interface TradingCompanyInput {
  name: string;
  slug?: string;
  description?: string;
  website?: string;
  brand?: Partial<BrandKit>;
  status?: TradingCompanyStatus;
}

const DEFAULT_BRAND: BrandKit = {
  primaryColor: "#0B6F6D",
  secondaryColor: "#171717",
  accentColor: "#B68A4A",
  borderRadius: "8px",
};

export function listTradingCompanies(agencyId: string, includeArchived = false): TradingCompany[] {
  return Object.values(getState().tradingCompanies)
    .filter(company => company.agencyId === agencyId && (includeArchived || company.status !== "archived"))
    .sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || a.name.localeCompare(b.name));
}

export function getTradingCompany(agencyId: string, companyId: string): TradingCompany | null {
  const company = getState().tradingCompanies[companyId];
  return company?.agencyId === agencyId ? company : null;
}

export function createTradingCompany(agencyId: string, input: TradingCompanyInput, actorUserId: string): TradingCompany {
  const name = clean(input.name, 120);
  if (!name) throw new Error("Trading name required.");
  const slug = uniqueSlug(agencyId, input.slug || name);
  const now = Date.now();
  const company: TradingCompany = {
    id: `company_${crypto.randomBytes(8).toString("hex")}`,
    agencyId,
    name,
    slug,
    description: clean(input.description, 600) || undefined,
    website: cleanUrl(input.website),
    brand: cleanBrand(input.brand),
    status: validStatus(input.status),
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => { state.tradingCompanies[company.id] = company; });
  logActivity({
    agencyId,
    actorUserId,
    category: "settings",
    action: "trading_company.created",
    message: `Created trading company “${company.name}”.`,
    metadata: { companyId: company.id },
  });
  return company;
}

export function updateTradingCompany(
  agencyId: string,
  companyId: string,
  input: Partial<TradingCompanyInput>,
  actorUserId: string,
): TradingCompany | null {
  const existing = getTradingCompany(agencyId, companyId);
  if (!existing) return null;
  const updated: TradingCompany = {
    ...existing,
    name: input.name === undefined ? existing.name : clean(input.name, 120) || existing.name,
    slug: input.slug === undefined ? existing.slug : uniqueSlug(agencyId, input.slug, companyId),
    description: input.description === undefined ? existing.description : clean(input.description, 600) || undefined,
    website: input.website === undefined ? existing.website : cleanUrl(input.website),
    brand: input.brand === undefined ? existing.brand : cleanBrand({ ...existing.brand, ...input.brand }),
    status: input.status === undefined ? existing.status : validStatus(input.status),
    updatedAt: Date.now(),
  };
  mutate(state => { state.tradingCompanies[companyId] = updated; });
  logActivity({
    agencyId,
    actorUserId,
    category: "settings",
    action: "trading_company.updated",
    message: `Updated trading company “${updated.name}”.`,
    metadata: { companyId },
  });
  return updated;
}

export function recordBelongsToCompany(companyIds: string[] | undefined, activeCompanyId: string | null): boolean {
  if (!activeCompanyId) return true;
  return !companyIds?.length || companyIds.includes(activeCompanyId);
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function slugify(value: string): string {
  return clean(value, 100).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "company";
}

function uniqueSlug(agencyId: string, value: string, ignoreId?: string): string {
  const base = slugify(value);
  const existing = listTradingCompanies(agencyId, true).filter(company => company.id !== ignoreId);
  let candidate = base;
  let suffix = 2;
  while (existing.some(company => company.slug === candidate)) candidate = `${base}-${suffix++}`;
  return candidate;
}

function cleanUrl(value: unknown): string | undefined {
  const raw = clean(value, 2_000);
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function cleanColor(value: unknown, fallback: string): string {
  const color = clean(value, 20);
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : fallback;
}

function cleanBrand(value: Partial<BrandKit> | undefined): BrandKit {
  return {
    ...DEFAULT_BRAND,
    ...(value ?? {}),
    logoUrl: cleanUrl(value?.logoUrl),
    primaryColor: cleanColor(value?.primaryColor, DEFAULT_BRAND.primaryColor),
    secondaryColor: cleanColor(value?.secondaryColor, DEFAULT_BRAND.secondaryColor!),
    accentColor: cleanColor(value?.accentColor, DEFAULT_BRAND.accentColor!),
    customCSS: undefined,
  };
}

function validStatus(value: unknown): TradingCompanyStatus {
  return value === "paused" || value === "archived" ? value : "active";
}
