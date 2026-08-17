import { defaultProductInternalWorkspace, isProductWorkspaceModule } from "@/lib/productInternalWorkspace";
import type {
  AgencyProduct,
  AgencyProductInternalWorkspace,
  AgencyProductPortalMode,
  AgencyProductPortalRequirement,
  AgencyProductPricing,
  ClientProductVariation,
} from "@/server/types";

type VariationMetadata = { clientProductVariations?: unknown };

const OVERRIDE_KEYS = [
  "name", "description", "buyerHeadline", "coverImageUrl", "accentColor",
  "portalRequirement", "portalHeadline", "portalWelcomeNote", "portalStageFocus", "portalSupportCta",
  "welcomePackItems", "welcomePackNotes", "pricing", "priceCents", "billingInterval",
  "depositPercent", "taxRatePercent", "paymentTermsDays", "billingNotes", "internalInfo",
  "internalWorkspace", "deliverables", "contractTitle", "contractBody", "sopIds", "sopCategories",
] as const;

export function clientProductVariations(metadata: VariationMetadata): Record<string, ClientProductVariation> {
  if (!metadata.clientProductVariations || typeof metadata.clientProductVariations !== "object" || Array.isArray(metadata.clientProductVariations)) return {};
  return Object.fromEntries(Object.entries(metadata.clientProductVariations as Record<string, unknown>).flatMap(([productId, value]) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const source = value as Record<string, unknown>;
    const storedProductId = cleanString(source.productId, 120) || cleanString(productId, 120);
    if (!storedProductId) return [];
    return [[storedProductId, { ...source, productId: storedProductId } as ClientProductVariation]];
  }));
}

export function clientVariationProductIds(metadata: VariationMetadata): string[] {
  return Object.keys(clientProductVariations(metadata));
}

export function applyClientProductVariations(metadata: VariationMetadata, catalogue: readonly AgencyProduct[]): AgencyProduct[] {
  const variations = clientProductVariations(metadata);
  return catalogue.map(product => {
    const variation = variations[product.id];
    if (!variation) return product;
    const merged = { ...product } as AgencyProduct;
    const mergedRecord = merged as unknown as Record<string, unknown>;
    for (const key of OVERRIDE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(variation, key)) mergedRecord[key] = variation[key];
    }
    merged.updatedAt = Math.max(product.updatedAt, variation.updatedAt || 0);
    return merged;
  });
}

export function buildClientProductVariation(base: AgencyProduct, input: Record<string, unknown>, updatedBy: string): ClientProductVariation {
  const candidate = variationCandidate(base, input);
  const variation: ClientProductVariation = { productId: base.id, updatedAt: Date.now(), updatedBy };
  for (const key of OVERRIDE_KEYS) {
    if (!same(candidate[key], base[key])) (variation as unknown as Record<string, unknown>)[key] = candidate[key];
  }
  return variation;
}

export function variationHasOverrides(variation: ClientProductVariation): boolean {
  return OVERRIDE_KEYS.some(key => Object.prototype.hasOwnProperty.call(variation, key));
}

function variationCandidate(base: AgencyProduct, input: Record<string, unknown>): AgencyProduct & Record<string, unknown> {
  const pricing = validPricing(input.pricing, base.pricing);
  const candidate = { ...base } as AgencyProduct & Record<string, unknown>;
  candidate.name = cleanString(input.name, 120) || base.name;
  candidate.description = cleanString(input.description, 600);
  candidate.buyerHeadline = cleanString(input.buyerHeadline, 180);
  candidate.coverImageUrl = cleanUrl(input.coverImageUrl);
  candidate.accentColor = cleanColor(input.accentColor);
  candidate.portalRequirement = validPortalRequirement(input.portalRequirement, base.portalRequirement);
  candidate.portalHeadline = cleanString(input.portalHeadline, 180);
  candidate.portalWelcomeNote = cleanString(input.portalWelcomeNote, 1_000);
  candidate.portalStageFocus = cleanStageFocus(input.portalStageFocus);
  candidate.portalSupportCta = cleanString(input.portalSupportCta, 80);
  candidate.welcomePackItems = cleanList(input.welcomePackItems, 30, 160);
  candidate.welcomePackNotes = cleanString(input.welcomePackNotes, 2_000);
  candidate.pricing = pricing;
  candidate.priceCents = cleanNumber(input.priceCents, 0, 1_000_000_000);
  candidate.billingInterval = pricing === "recurring" ? validInterval(input.billingInterval, base.billingInterval) : undefined;
  candidate.depositPercent = cleanNumber(input.depositPercent, 0, 100);
  candidate.taxRatePercent = cleanNumber(input.taxRatePercent, 0, 100);
  candidate.paymentTermsDays = cleanNumber(input.paymentTermsDays, 0, 365);
  candidate.billingNotes = cleanString(input.billingNotes, 2_000);
  candidate.internalInfo = cleanString(input.internalInfo, 5_000);
  candidate.internalWorkspace = cleanWorkspace(input.internalWorkspace, base);
  candidate.deliverables = cleanList(input.deliverables, 80, 240);
  candidate.contractTitle = cleanString(input.contractTitle, 180);
  candidate.contractBody = cleanString(input.contractBody, 20_000);
  candidate.sopIds = cleanList(input.sopIds, 100, 120);
  candidate.sopCategories = cleanList(input.sopCategories, 30, 100);
  return candidate;
}

function cleanWorkspace(value: unknown, base: AgencyProduct): AgencyProductInternalWorkspace {
  const fallback = base.internalWorkspace ?? defaultProductInternalWorkspace(base);
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const source = value as Record<string, unknown>;
  const stages = Array.isArray(source.lifecycleStages) ? source.lifecycleStages.flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const stage = item as Record<string, unknown>;
    const label = cleanString(stage.label, 80);
    if (!label) return [];
    return [{ id: cleanString(stage.id, 120) || `${base.id}-variation-stage-${index + 1}`, label, description: cleanString(stage.description, 300) || undefined, portalMode: validPortalMode(stage.portalMode) }];
  }).slice(0, 12) : fallback.lifecycleStages;
  const lifecycleStages = stages.length ? stages : fallback.lifecycleStages;
  const stageIds = new Set(lifecycleStages.map(stage => stage.id));
  const processSteps = Array.isArray(source.processSteps) ? source.processSteps.flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const step = item as Record<string, unknown>;
    const title = cleanString(step.title, 140);
    if (!title) return [];
    const requestedStageId = cleanString(step.stageId, 120);
    return [{
      id: cleanString(step.id, 120) || `${base.id}-variation-step-${index + 1}`,
      title,
      instruction: cleanString(step.instruction, 600) || undefined,
      stageId: stageIds.has(requestedStageId) ? requestedStageId : lifecycleStages[0]?.id,
      module: isProductWorkspaceModule(step.module) ? step.module : "delivery" as const,
      sopIds: cleanList(step.sopIds, 10, 120),
      advanced: step.advanced === true || undefined,
    }];
  }).slice(0, 48) : fallback.processSteps;
  return {
    title: cleanString(source.title, 160) || fallback.title,
    objective: cleanString(source.objective, 600) || fallback.objective,
    lifecycleStages,
    quickActions: cleanModules(source.quickActions, fallback.quickActions),
    processSteps,
    advancedModules: cleanModules(source.advancedModules, fallback.advancedModules),
  };
}

function cleanModules(value: unknown, fallback: AgencyProductInternalWorkspace["quickActions"]) {
  if (!Array.isArray(value)) return fallback;
  return [...new Set(value.filter(isProductWorkspaceModule))].slice(0, 9);
}

function cleanStageFocus(value: unknown): Partial<Record<AgencyProductPortalMode, string>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  return Object.fromEntries((["onboarding", "designing", "developed-launch", "maintenance"] as AgencyProductPortalMode[]).flatMap(mode => {
    const copy = cleanString(source[mode], 1_000);
    return copy ? [[mode, copy]] : [];
  }));
}

function cleanList(value: unknown, limit: number, itemLimit: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => cleanString(item, itemLimit)).filter(Boolean))].slice(0, limit);
}

function cleanString(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function cleanNumber(value: unknown, min: number, max: number): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : undefined;
}

function cleanUrl(value: unknown): string | undefined {
  const text = cleanString(value, 2_000);
  if (!text) return undefined;
  try { const url = new URL(text); return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined; } catch { return undefined; }
}

function cleanColor(value: unknown): string | undefined {
  const text = cleanString(value, 20);
  return /^#[0-9a-f]{6}$/i.test(text) ? text : undefined;
}

function validPricing(value: unknown, fallback: AgencyProductPricing): AgencyProductPricing {
  return value === "fixed" || value === "from" || value === "recurring" || value === "custom" ? value : fallback;
}

function validPortalRequirement(value: unknown, fallback: AgencyProductPortalRequirement): AgencyProductPortalRequirement {
  return value === "required" || value === "optional" || value === "none" ? value : fallback;
}

function validInterval(value: unknown, fallback?: AgencyProduct["billingInterval"]): AgencyProduct["billingInterval"] {
  return value === "quarter" || value === "year" || value === "month" ? value : fallback ?? "month";
}

function validPortalMode(value: unknown): AgencyProductPortalMode {
  return value === "designing" || value === "developed-launch" || value === "maintenance" ? value : "onboarding";
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}
