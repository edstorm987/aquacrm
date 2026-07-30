import "server-only";

import crypto from "node:crypto";
import { PORTAL_PRODUCT_CATALOG } from "@/lib/portalProducts";
import { logActivity } from "./activity";
import { getState, mutate } from "./storage";
import type { AgencyProduct, AgencyProductKind, AgencyProductPortalRequirement, AgencyProductPricing } from "./types";

export interface AgencyProductInput {
  companyIds?: string[];
  kind?: AgencyProductKind;
  name: string;
  category?: string;
  description?: string;
  buyerHeadline?: string;
  coverImageUrl?: string;
  accentColor?: string;
  portalRequirement?: AgencyProductPortalRequirement;
  portalHeadline?: string;
  portalWelcomeNote?: string;
  includedProductIds?: string[];
  welcomePackItems?: string[];
  welcomePackNotes?: string;
  pricing?: AgencyProductPricing;
  priceCents?: number;
  billingInterval?: AgencyProduct["billingInterval"];
  depositPercent?: number;
  taxRatePercent?: number;
  paymentTermsDays?: number;
  billingNotes?: string;
  internalInfo?: string;
  deliverables?: string[];
  contractTitle?: string;
  contractBody?: string;
  sopIds?: string[];
  sopCategories?: string[];
  active?: boolean;
}

export function listAgencyProducts(agencyId: string, includeArchived = false): AgencyProduct[] {
  return Object.values(getState().agencyProducts)
    .filter(product => product.agencyId === agencyId && (includeArchived || product.active))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

export function getAgencyProduct(agencyId: string, productId: string): AgencyProduct | null {
  const product = getState().agencyProducts[productId];
  return product?.agencyId === agencyId ? product : null;
}

export function ensureDefaultAgencyProducts(agencyId: string): AgencyProduct[] {
  const existing = listAgencyProducts(agencyId, true);
  if (existing.length) {
    for (const product of existing) {
      const category = product.category === "Advisory" && (product.name === "Business OS" || product.name === "Digital health check")
        ? "Lead magnets"
        : product.category;
      if (category !== product.category || !product.kind || !product.portalRequirement || !Array.isArray(product.includedProductIds) || !Array.isArray(product.welcomePackItems) || !Array.isArray(product.sopIds) || !Array.isArray(product.sopCategories)) {
        mutate(state => {
          state.agencyProducts[product.id] = {
            ...product,
            category,
            kind: validKind(product.kind),
            portalRequirement: validPortalRequirement(product.portalRequirement),
            includedProductIds: Array.isArray(product.includedProductIds) ? product.includedProductIds : [],
            welcomePackItems: Array.isArray(product.welcomePackItems) ? product.welcomePackItems : [],
            sopIds: Array.isArray(product.sopIds) ? product.sopIds : [],
            sopCategories: Array.isArray(product.sopCategories) ? product.sopCategories : [],
            updatedAt: Date.now(),
          };
        });
      }
    }
    return listAgencyProducts(agencyId, true);
  }
  for (const definition of PORTAL_PRODUCT_CATALOG) {
    createAgencyProduct(agencyId, {
      name: definition.name,
      category: defaultCategory(definition.catalogKey),
      description: definition.description,
      pricing: "custom",
      deliverables: definition.deliverables,
    }, "system");
  }
  return listAgencyProducts(agencyId, true);
}

export function createAgencyProduct(agencyId: string, input: AgencyProductInput, actorUserId: string): AgencyProduct {
  const name = clean(input.name, 120);
  if (!name) throw new Error("Product name required.");
  const now = Date.now();
  const product: AgencyProduct = {
    id: `prod_${crypto.randomBytes(8).toString("hex")}`,
    agencyId,
    companyIds: cleanList(input.companyIds, 30, 120),
    kind: validKind(input.kind),
    name,
    category: clean(input.category, 80) || "Service",
    description: clean(input.description, 600) || undefined,
    buyerHeadline: clean(input.buyerHeadline, 180) || undefined,
    coverImageUrl: cleanHttpUrl(input.coverImageUrl),
    accentColor: cleanColor(input.accentColor),
    portalRequirement: validPortalRequirement(input.portalRequirement),
    portalHeadline: clean(input.portalHeadline, 180) || undefined,
    portalWelcomeNote: clean(input.portalWelcomeNote, 1_000) || undefined,
    includedProductIds: cleanList(input.includedProductIds, 50, 120),
    welcomePackItems: cleanList(input.welcomePackItems, 30, 160),
    welcomePackNotes: clean(input.welcomePackNotes, 2_000) || undefined,
    pricing: validPricing(input.pricing),
    priceCents: cleanPrice(input.priceCents),
    billingInterval: input.pricing === "recurring" ? validInterval(input.billingInterval) : undefined,
    depositPercent: cleanPercent(input.depositPercent),
    taxRatePercent: cleanPercent(input.taxRatePercent),
    paymentTermsDays: cleanDays(input.paymentTermsDays),
    billingNotes: clean(input.billingNotes, 2_000) || undefined,
    internalInfo: clean(input.internalInfo, 5_000) || undefined,
    deliverables: cleanDeliverables(input.deliverables),
    contractTitle: clean(input.contractTitle, 180) || undefined,
    contractBody: clean(input.contractBody, 20_000) || undefined,
    sopIds: cleanList(input.sopIds, 100, 120),
    sopCategories: cleanList(input.sopCategories, 30, 100),
    active: input.active !== false,
    createdAt: now,
    updatedAt: now,
  };
  mutate(state => { state.agencyProducts[product.id] = product; });
  logActivity({ agencyId, actorUserId, category: "system", action: "product.created", message: `Created product “${product.name}”.`, metadata: { productId: product.id } });
  return product;
}

export function updateAgencyProduct(agencyId: string, productId: string, input: Partial<AgencyProductInput>, actorUserId: string): AgencyProduct | null {
  const existing = getState().agencyProducts[productId];
  if (!existing || existing.agencyId !== agencyId) return null;
  const pricing = input.pricing ? validPricing(input.pricing) : existing.pricing;
  const updated: AgencyProduct = {
    ...existing,
    companyIds: input.companyIds === undefined ? existing.companyIds ?? [] : cleanList(input.companyIds, 30, 120),
    kind: input.kind === undefined ? validKind(existing.kind) : validKind(input.kind),
    name: input.name === undefined ? existing.name : clean(input.name, 120) || existing.name,
    category: input.category === undefined ? existing.category : clean(input.category, 80) || "Service",
    description: input.description === undefined ? existing.description : clean(input.description, 600) || undefined,
    buyerHeadline: input.buyerHeadline === undefined ? existing.buyerHeadline : clean(input.buyerHeadline, 180) || undefined,
    coverImageUrl: input.coverImageUrl === undefined ? existing.coverImageUrl : cleanHttpUrl(input.coverImageUrl),
    accentColor: input.accentColor === undefined ? existing.accentColor : cleanColor(input.accentColor),
    portalRequirement: input.portalRequirement === undefined ? validPortalRequirement(existing.portalRequirement) : validPortalRequirement(input.portalRequirement),
    portalHeadline: input.portalHeadline === undefined ? existing.portalHeadline : clean(input.portalHeadline, 180) || undefined,
    portalWelcomeNote: input.portalWelcomeNote === undefined ? existing.portalWelcomeNote : clean(input.portalWelcomeNote, 1_000) || undefined,
    includedProductIds: input.includedProductIds === undefined ? existing.includedProductIds ?? [] : cleanList(input.includedProductIds, 50, 120).filter(id => id !== productId),
    welcomePackItems: input.welcomePackItems === undefined ? existing.welcomePackItems ?? [] : cleanList(input.welcomePackItems, 30, 160),
    welcomePackNotes: input.welcomePackNotes === undefined ? existing.welcomePackNotes : clean(input.welcomePackNotes, 2_000) || undefined,
    pricing,
    priceCents: input.priceCents === undefined ? existing.priceCents : cleanPrice(input.priceCents),
    billingInterval: pricing === "recurring"
      ? validInterval(input.billingInterval ?? existing.billingInterval)
      : undefined,
    depositPercent: input.depositPercent === undefined ? existing.depositPercent : cleanPercent(input.depositPercent),
    taxRatePercent: input.taxRatePercent === undefined ? existing.taxRatePercent : cleanPercent(input.taxRatePercent),
    paymentTermsDays: input.paymentTermsDays === undefined ? existing.paymentTermsDays : cleanDays(input.paymentTermsDays),
    billingNotes: input.billingNotes === undefined ? existing.billingNotes : clean(input.billingNotes, 2_000) || undefined,
    internalInfo: input.internalInfo === undefined ? existing.internalInfo : clean(input.internalInfo, 5_000) || undefined,
    deliverables: input.deliverables === undefined ? existing.deliverables : cleanDeliverables(input.deliverables),
    contractTitle: input.contractTitle === undefined ? existing.contractTitle : clean(input.contractTitle, 180) || undefined,
    contractBody: input.contractBody === undefined ? existing.contractBody : clean(input.contractBody, 20_000) || undefined,
    sopIds: input.sopIds === undefined ? existing.sopIds ?? [] : cleanList(input.sopIds, 100, 120),
    sopCategories: input.sopCategories === undefined ? existing.sopCategories ?? [] : cleanList(input.sopCategories, 30, 100),
    active: input.active ?? existing.active,
    updatedAt: Date.now(),
  };
  mutate(state => { state.agencyProducts[productId] = updated; });
  logActivity({ agencyId, actorUserId, category: "system", action: "product.updated", message: `Updated product “${updated.name}”.`, metadata: { productId } });
  return updated;
}

function clean(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function cleanPrice(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(Math.min(value, 100_000_000))
    : undefined;
}

function cleanPercent(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(Math.min(value, 100) * 100) / 100
    : undefined;
}

function cleanDays(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(Math.min(value, 365))
    : undefined;
}

function cleanHttpUrl(value: unknown): string | undefined {
  const raw = clean(value, 2_000);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function cleanColor(value: unknown): string | undefined {
  const color = clean(value, 20);
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : undefined;
}

function cleanList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === "string")
    .map(item => item.trim().slice(0, maxLength))
    .filter(Boolean))]
    .slice(0, maxItems);
}

function cleanDeliverables(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string")
    .map(item => item.trim().slice(0, 160))
    .filter(Boolean)
    .slice(0, 20);
}

function validPricing(value?: AgencyProductPricing): AgencyProductPricing {
  return value === "fixed" || value === "from" || value === "recurring" ? value : "custom";
}

function validInterval(value?: AgencyProduct["billingInterval"]): AgencyProduct["billingInterval"] {
  return value === "quarter" || value === "year" ? value : "month";
}

function validPortalRequirement(value?: AgencyProductPortalRequirement): AgencyProductPortalRequirement {
  return value === "required" || value === "none" ? value : "optional";
}

function validKind(value?: AgencyProductKind): AgencyProductKind {
  return value === "package" ? "package" : "product";
}

function defaultCategory(key: string): string {
  if (key === "photography" || key === "content" || key === "brand-identity") return "Creative";
  if (key === "ongoing-care") return "Support";
  if (key === "business-os" || key === "health-check") return "Lead magnets";
  return "Digital";
}
