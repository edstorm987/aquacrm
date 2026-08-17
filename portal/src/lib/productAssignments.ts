import type { AgencyProduct } from "@/server/types";
import {
  cleanPortalProducts,
  portalProductSelectionFromAgencyProduct,
  type PortalProductSelection,
} from "./portalProducts";
import { applyClientProductVariations } from "./clientProductVariations";

export interface PortalProductAssignmentMetadata {
  portalSelectedProductIds?: unknown;
  portalProductIds?: unknown;
  portalProducts?: unknown;
  products?: unknown;
  clientProductVariations?: unknown;
}

export interface AgencyProductAssignmentResolution {
  selectedIds: string[];
  selectedProducts: AgencyProduct[];
  effectiveIds: string[];
  effectiveProducts: AgencyProduct[];
  missingIds: string[];
  inactiveIds: string[];
}

export interface PortalProductAssignmentState extends AgencyProductAssignmentResolution {
  products: PortalProductSelection[];
  snapshotProducts: PortalProductSelection[];
  snapshotCurrent: boolean;
}

export function cleanAssignedProductIds(value: unknown, limit = 48): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap(item => {
    if (typeof item !== "string") return [];
    const id = item.trim().slice(0, 120);
    return id ? [id] : [];
  }))].slice(0, limit);
}

export function resolveAgencyProductAssignment(
  catalogue: readonly AgencyProduct[],
  selectedProductIds: readonly string[],
): AgencyProductAssignmentResolution {
  const byId = new Map(catalogue.map(product => [product.id, product]));
  const selectedIds = cleanAssignedProductIds(selectedProductIds);
  const missingIds = selectedIds.filter(id => !byId.has(id));
  const selectedProducts = selectedIds.flatMap(id => {
    const product = byId.get(id);
    return product ? [product] : [];
  });
  const effectiveProducts: AgencyProduct[] = [];
  const visited = new Set<string>();

  const include = (productId: string) => {
    if (visited.has(productId)) return;
    visited.add(productId);
    const product = byId.get(productId);
    if (!product) {
      if (!missingIds.includes(productId)) missingIds.push(productId);
      return;
    }
    effectiveProducts.push(product);
    for (const includedId of product.includedProductIds ?? []) include(includedId);
  };

  for (const productId of selectedIds) include(productId);

  return {
    selectedIds,
    selectedProducts,
    effectiveIds: effectiveProducts.map(product => product.id),
    effectiveProducts,
    missingIds,
    inactiveIds: effectiveProducts.filter(product => !product.active).map(product => product.id),
  };
}

export function selectedPortalProductIds(metadata: PortalProductAssignmentMetadata): string[] {
  const explicit = cleanAssignedProductIds(metadata.portalSelectedProductIds);
  if (explicit.length) return explicit;
  const effective = cleanAssignedProductIds(metadata.portalProductIds);
  if (effective.length) return effective;
  return cleanPortalProducts(metadata.portalProducts ?? metadata.products).map(product => product.id);
}

export function resolvePortalProductAssignment(
  metadata: PortalProductAssignmentMetadata,
  catalogue: readonly AgencyProduct[],
): PortalProductAssignmentState {
  const clientCatalogue = applyClientProductVariations(metadata, catalogue);
  const snapshotProducts = cleanPortalProducts(metadata.portalProducts ?? metadata.products);
  const selectedIds = selectedPortalProductIds(metadata);
  const storedEffectiveIds = cleanAssignedProductIds(metadata.portalProductIds);
  const expanded = resolveAgencyProductAssignment(clientCatalogue, selectedIds);
  const effectiveIds = storedEffectiveIds.length
    ? storedEffectiveIds
    : snapshotProducts.length
      ? snapshotProducts.map(product => product.id)
      : expanded.effectiveIds;
  const byId = new Map(clientCatalogue.map(product => [product.id, product]));
  const snapshotById = new Map(snapshotProducts.map(product => [product.id, product]));
  const products = effectiveIds.flatMap(id => {
    const live = byId.get(id);
    if (live) return [portalProductSelectionFromAgencyProduct(live)];
    const retained = snapshotById.get(id);
    return retained ? [retained] : [];
  });
  const currentSnapshots = expanded.effectiveProducts.map(portalProductSelectionFromAgencyProduct);

  return {
    ...expanded,
    effectiveIds,
    effectiveProducts: effectiveIds.flatMap(id => {
      const product = byId.get(id);
      return product ? [product] : [];
    }),
    inactiveIds: effectiveIds.filter(id => byId.get(id)?.active === false),
    products,
    snapshotProducts,
    snapshotCurrent: productSelectionFingerprint(snapshotProducts) === productSelectionFingerprint(currentSnapshots),
  };
}

export function productSelectionFingerprint(products: readonly PortalProductSelection[]): string {
  return JSON.stringify(products.map(product => ({
    id: product.id,
    catalogKey: product.catalogKey ?? "",
    name: product.name,
    description: product.description,
    deliverables: product.deliverables,
    buyerHeadline: product.buyerHeadline ?? "",
    coverImageUrl: product.coverImageUrl ?? "",
    accentColor: product.accentColor ?? "",
    portalHeadline: product.portalHeadline ?? "",
    portalWelcomeNote: product.portalWelcomeNote ?? "",
    stageFocusOverrides: product.stageFocusOverrides ?? {},
    supportCta: product.supportCta ?? "",
  })));
}
