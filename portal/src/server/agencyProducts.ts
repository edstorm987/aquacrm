import "server-only";

import crypto from "node:crypto";
import { PORTAL_PRODUCT_CATALOG } from "@/lib/portalProducts";
import { defaultProductInternalWorkspace, isProductWorkspaceModule } from "@/lib/productInternalWorkspace";
import { logActivity } from "./activity";
import { getState, mutate } from "./storage";
import type { AgencyProduct, AgencyProductInternalWorkspace, AgencyProductKind, AgencyProductPortalMode, AgencyProductPortalRequirement, AgencyProductPortalTemplateKey, AgencyProductPricing, AgencyProductStatus, AgencyProductWorkspaceModule } from "./types";

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
  portalTemplateKey?: AgencyProductPortalTemplateKey;
  portalHeadline?: string;
  portalWelcomeNote?: string;
  portalStageFocus?: Partial<Record<AgencyProductPortalMode, string>>;
  portalSupportCta?: string;
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
  internalWorkspace?: AgencyProductInternalWorkspace;
  deliverables?: string[];
  contractTitle?: string;
  contractBody?: string;
  sopIds?: string[];
  sopCategories?: string[];
  status?: AgencyProductStatus;
  active?: boolean;
}

export function listAgencyProducts(agencyId: string, includeArchived = false): AgencyProduct[] {
  return Object.values(getState().agencyProducts)
    .filter(product => product.agencyId === agencyId && (includeArchived || productStatus(product) === "live"))
    .sort((a, b) => statusOrder(productStatus(a)) - statusOrder(productStatus(b)) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

export function getAgencyProduct(agencyId: string, productId: string): AgencyProduct | null {
  const product = getState().agencyProducts[productId];
  return product?.agencyId === agencyId ? product : null;
}

export function ensureDefaultAgencyProducts(agencyId: string): AgencyProduct[] {
  const existing = listAgencyProducts(agencyId, true);
  if (existing.length) {
    for (const product of existing) {
      const inferredTemplate = PORTAL_PRODUCT_CATALOG.find(definition => definition.name.toLowerCase() === product.name.toLowerCase())?.catalogKey;
      const category = product.category === "Advisory" && (product.name === "Business OS" || product.name === "Digital health check")
        ? "Lead magnets"
        : product.category;
      if (category !== product.category || !product.kind || !product.portalRequirement || !product.status || (!product.portalTemplateKey && inferredTemplate) || !Array.isArray(product.includedProductIds) || !Array.isArray(product.welcomePackItems) || !Array.isArray(product.sopIds) || !Array.isArray(product.sopCategories) || !product.internalWorkspace || !Array.isArray(product.internalWorkspace.lifecycleStages) || product.internalWorkspace.processSteps.some(step => !step.stageId)) {
        mutate(state => {
          state.agencyProducts[product.id] = {
            ...product,
            category,
            kind: validKind(product.kind),
            portalRequirement: validPortalRequirement(product.portalRequirement),
            portalTemplateKey: validPortalTemplateKey(product.portalTemplateKey) ?? inferredTemplate,
            includedProductIds: Array.isArray(product.includedProductIds) ? product.includedProductIds : [],
            welcomePackItems: Array.isArray(product.welcomePackItems) ? product.welcomePackItems : [],
            sopIds: Array.isArray(product.sopIds) ? product.sopIds : [],
            sopCategories: Array.isArray(product.sopCategories) ? product.sopCategories : [],
            status: productStatus(product),
            active: productStatus(product) === "live",
            internalWorkspace: cleanInternalWorkspace(product.internalWorkspace, {
              id: product.id,
              name: product.name,
              portalTemplateKey: validPortalTemplateKey(product.portalTemplateKey) ?? inferredTemplate,
              sopIds: Array.isArray(product.sopIds) ? product.sopIds : [],
            }),
            updatedAt: Date.now(),
          };
        });
      }
    }
    const socialAds = PORTAL_PRODUCT_CATALOG.find(definition => definition.catalogKey === "social-ads");
    if (socialAds && !existing.some(product => product.portalTemplateKey === "social-ads" || product.name.toLowerCase() === socialAds.name.toLowerCase())) {
      createAgencyProduct(agencyId, {
        name: socialAds.name,
        category: defaultCategory(socialAds.catalogKey),
        description: socialAds.description,
        pricing: "recurring",
        billingInterval: "month",
        deliverables: socialAds.deliverables,
        portalRequirement: "required",
        portalTemplateKey: socialAds.catalogKey,
        portalHeadline: socialAds.homeHeading,
      }, "system");
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
      portalTemplateKey: definition.catalogKey,
    }, "system");
  }
  return listAgencyProducts(agencyId, true);
}

export function createAgencyProduct(agencyId: string, input: AgencyProductInput, actorUserId: string): AgencyProduct {
  const name = clean(input.name, 120);
  if (!name) throw new Error("Product name required.");
  const now = Date.now();
  const status = validStatus(input.status, input.active);
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
    portalTemplateKey: validPortalTemplateKey(input.portalTemplateKey),
    portalHeadline: clean(input.portalHeadline, 180) || undefined,
    portalWelcomeNote: clean(input.portalWelcomeNote, 1_000) || undefined,
    portalStageFocus: cleanPortalStageFocus(input.portalStageFocus),
    portalSupportCta: clean(input.portalSupportCta, 80) || undefined,
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
    internalWorkspace: cleanInternalWorkspace(input.internalWorkspace, {
      name,
      portalTemplateKey: validPortalTemplateKey(input.portalTemplateKey),
      sopIds: cleanList(input.sopIds, 100, 120),
    }),
    deliverables: cleanDeliverables(input.deliverables),
    contractTitle: clean(input.contractTitle, 180) || undefined,
    contractBody: clean(input.contractBody, 20_000) || undefined,
    sopIds: cleanList(input.sopIds, 100, 120),
    sopCategories: cleanList(input.sopCategories, 30, 100),
    status,
    active: status === "live",
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
  const status = input.status === undefined
    ? input.active === undefined ? productStatus(existing) : input.active ? "live" : "archived"
    : validStatus(input.status);
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
    portalTemplateKey: input.portalTemplateKey === undefined ? validPortalTemplateKey(existing.portalTemplateKey) : validPortalTemplateKey(input.portalTemplateKey),
    portalHeadline: input.portalHeadline === undefined ? existing.portalHeadline : clean(input.portalHeadline, 180) || undefined,
    portalWelcomeNote: input.portalWelcomeNote === undefined ? existing.portalWelcomeNote : clean(input.portalWelcomeNote, 1_000) || undefined,
    portalStageFocus: input.portalStageFocus === undefined ? cleanPortalStageFocus(existing.portalStageFocus) : cleanPortalStageFocus(input.portalStageFocus),
    portalSupportCta: input.portalSupportCta === undefined ? existing.portalSupportCta : clean(input.portalSupportCta, 80) || undefined,
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
    internalWorkspace: input.internalWorkspace === undefined
      ? cleanInternalWorkspace(existing.internalWorkspace, existing)
      : cleanInternalWorkspace(input.internalWorkspace, {
          id: existing.id,
          name: input.name === undefined ? existing.name : clean(input.name, 120) || existing.name,
          portalTemplateKey: input.portalTemplateKey === undefined ? existing.portalTemplateKey : validPortalTemplateKey(input.portalTemplateKey),
          sopIds: input.sopIds === undefined ? existing.sopIds : cleanList(input.sopIds, 100, 120),
        }),
    deliverables: input.deliverables === undefined ? existing.deliverables : cleanDeliverables(input.deliverables),
    contractTitle: input.contractTitle === undefined ? existing.contractTitle : clean(input.contractTitle, 180) || undefined,
    contractBody: input.contractBody === undefined ? existing.contractBody : clean(input.contractBody, 20_000) || undefined,
    sopIds: input.sopIds === undefined ? existing.sopIds ?? [] : cleanList(input.sopIds, 100, 120),
    sopCategories: input.sopCategories === undefined ? existing.sopCategories ?? [] : cleanList(input.sopCategories, 30, 100),
    status,
    active: status === "live",
    updatedAt: Date.now(),
  };
  mutate(state => { state.agencyProducts[productId] = updated; });
  logActivity({ agencyId, actorUserId, category: "system", action: "product.updated", message: `Updated product “${updated.name}”.`, metadata: { productId } });
  return updated;
}

export function productStatus(product: Pick<AgencyProduct, "active"> & { status?: unknown }): AgencyProductStatus {
  return product.status === "draft" || product.status === "archived" || product.status === "live"
    ? product.status
    : product.active === false ? "archived" : "live";
}

function validStatus(value: unknown, active?: boolean): AgencyProductStatus {
  if (value === "draft" || value === "archived" || value === "live") return value;
  return active === false ? "archived" : "live";
}

function statusOrder(status: AgencyProductStatus): number {
  return status === "live" ? 0 : status === "draft" ? 1 : 2;
}

function cleanInternalWorkspace(
  value: unknown,
  product: { id?: string; name?: string; portalTemplateKey?: AgencyProductPortalTemplateKey; sopIds?: string[] },
): AgencyProductInternalWorkspace {
  const fallback = defaultProductInternalWorkspace(product);
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const source = value as Record<string, unknown>;
  const stages = Array.isArray(source.lifecycleStages) ? source.lifecycleStages.flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const stage = item as Record<string, unknown>;
    const label = clean(stage.label, 80);
    if (!label) return [];
    return [{
      id: clean(stage.id, 120) || `${product.id || "service"}-stage-${index + 1}`,
      label,
      description: clean(stage.description, 300) || undefined,
      portalMode: validProductPortalMode(stage.portalMode),
    }];
  }).filter((stage, index, all) => all.findIndex(item => item.id === stage.id) === index).slice(0, 12) : [];
  const lifecycleStages = stages.length ? stages : fallback.lifecycleStages;
  const stageIds = new Set(lifecycleStages.map(stage => stage.id));
  const steps = Array.isArray(source.processSteps) ? source.processSteps.flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const step = item as Record<string, unknown>;
    const title = clean(step.title, 140);
    if (!title) return [];
    return [{
      id: clean(step.id, 120) || `${product.id || "service"}-step-${index + 1}`,
      title,
      instruction: clean(step.instruction, 600) || undefined,
      stageId: stageIds.has(clean(step.stageId, 120))
        ? clean(step.stageId, 120)
        : fallback.processSteps[index]?.stageId ?? lifecycleStages[Math.min(index, lifecycleStages.length - 1)]?.id,
      module: isProductWorkspaceModule(step.module) ? step.module : "delivery" as AgencyProductWorkspaceModule,
      sopIds: cleanList(step.sopIds, 10, 120),
      advanced: step.advanced === true || undefined,
    }];
  }).slice(0, 48) : [];

  return {
    title: clean(source.title, 160) || fallback.title,
    objective: clean(source.objective, 1_000) || fallback.objective,
    lifecycleStages,
    quickActions: cleanWorkspaceModules(source.quickActions, fallback.quickActions, 6),
    processSteps: steps.length ? steps : fallback.processSteps,
    advancedModules: cleanWorkspaceModules(source.advancedModules, fallback.advancedModules, 8),
  };
}

function validProductPortalMode(value: unknown): AgencyProductPortalMode {
  return value === "designing" || value === "developed-launch" || value === "maintenance" ? value : "onboarding";
}

function cleanWorkspaceModules(value: unknown, fallback: AgencyProductWorkspaceModule[], limit: number): AgencyProductWorkspaceModule[] {
  if (!Array.isArray(value)) return fallback;
  return [...new Set(value.filter(isProductWorkspaceModule))].slice(0, limit);
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

function validPortalTemplateKey(value?: AgencyProductPortalTemplateKey): AgencyProductPortalTemplateKey | undefined {
  return value && PORTAL_PRODUCT_CATALOG.some(definition => definition.catalogKey === value) ? value : undefined;
}

function cleanPortalStageFocus(value: unknown): AgencyProduct["portalStageFocus"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const modes: AgencyProductPortalMode[] = ["onboarding", "designing", "developed-launch", "maintenance"];
  const cleaned = Object.fromEntries(modes.flatMap(mode => {
    const focus = clean(source[mode], 280);
    return focus ? [[mode, focus]] : [];
  })) as Partial<Record<AgencyProductPortalMode, string>>;
  return Object.keys(cleaned).length ? cleaned : undefined;
}

function validKind(value?: AgencyProductKind): AgencyProductKind {
  return value === "package" ? "package" : "product";
}

function defaultCategory(key: string): string {
  if (key === "social-ads") return "Growth";
  if (key === "photography" || key === "content" || key === "brand-identity") return "Creative";
  if (key === "ongoing-care") return "Support";
  if (key === "business-os" || key === "health-check") return "Lead magnets";
  return "Digital";
}
