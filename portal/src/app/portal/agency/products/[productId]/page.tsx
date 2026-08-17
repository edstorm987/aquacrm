import { notFound } from "next/navigation";

import { requireRole } from "@/lib/server/auth";
import { ensureDefaultAgencyProducts, getAgencyProduct, listAgencyProducts } from "@/server/agencyProducts";
import { listSops } from "@/server/sops";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import { ProductDetailWorkspace } from "./_ProductDetailWorkspace";
import { listTradingCompanies } from "@/server/tradingCompanies";
import { listClients } from "@/server/tenants";
import { ensureProductPortalTemplate, getClientPortalInstance } from "@/server/clientPortalDesigns";
import { productSelectionFingerprint, resolveAgencyProductAssignment, resolvePortalProductAssignment } from "@/lib/productAssignments";
import { portalProductSelectionFromAgencyProduct } from "@/lib/portalProducts";
import { clientProductVariations } from "@/lib/clientProductVariations";
import type { ProductRolloutClient } from "./_ProductRolloutCentre";

export default async function ProductDetailPage({ params, searchParams }: { params: Promise<{ productId: string }>; searchParams: Promise<{ edit?: string }> }) {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  ensureDefaultAgencyProducts(session.agencyId);
  const { productId } = await params;
  const requested = await searchParams;
  const product = getAgencyProduct(session.agencyId, productId);
  if (!product) notFound();
  const products = listAgencyProducts(session.agencyId, true);
  const portalTemplate = product.portalRequirement !== "none"
    ? ensureProductPortalTemplate(session.agencyId, product, session.userId)
    : null;
  const currentProduct = portalProductSelectionFromAgencyProduct(product);
  const rolloutClients: ProductRolloutClient[] = listClients(session.agencyId, { includeArchived: true }).flatMap(client => {
    const assignment = resolvePortalProductAssignment(client.metadata ?? {}, products);
    const variations = clientProductVariations(client.metadata ?? {});
    const effectiveProduct = assignment.products.find(item => item.id === product.id);
    const effectiveCurrentProduct = effectiveProduct ?? currentProduct;
    const currentScope = resolveAgencyProductAssignment(products, assignment.selectedIds);
    if (!assignment.effectiveIds.includes(product.id) && !currentScope.effectiveIds.includes(product.id)) return [];
    const snapshot = assignment.snapshotProducts.find(item => item.id === product.id);
    const instance = getClientPortalInstance(session.agencyId, client.id);
    const templateStatus: ProductRolloutClient["templateStatus"] = !instance
      ? "not-built"
      : portalTemplate && instance.templateId === portalTemplate.id
        ? instance.templateVersionId === portalTemplate.publishedVersionId ? "current" : "outdated"
        : "shared";
    return [{
      id: client.id,
      name: client.name,
      effectiveName: effectiveProduct?.name ?? product.name,
      variation: Boolean(variations[product.id]),
      variationUpdatedAt: variations[product.id]?.updatedAt,
      portalBuilt: Boolean(instance),
      catalogueCurrent: snapshot ? productSelectionFingerprint([snapshot]) === productSelectionFingerprint([effectiveCurrentProduct]) : false,
      packageScopeCurrent: assignment.effectiveIds.length === currentScope.effectiveIds.length
        && assignment.effectiveIds.every(id => currentScope.effectiveIds.includes(id)),
      templateStatus,
      assignmentLabel: currentScope.selectedProducts.map(item => item.name).join(" + ") || product.name,
    }];
  }).sort((left, right) => Number(!right.catalogueCurrent || !right.packageScopeCurrent || right.templateStatus === "outdated") - Number(!left.catalogueCurrent || !left.packageScopeCurrent || left.templateStatus === "outdated") || left.name.localeCompare(right.name));

  return (
    <ProductDetailWorkspace
      initialProduct={product}
      initialEditing={requested.edit === "stages" || requested.edit === "service"}
      products={products}
      sops={listSops(session.agencyId)}
      companies={listTradingCompanies(session.agencyId, true)}
      rolloutClients={rolloutClients}
      productTemplateNeedsRefresh={Boolean(portalTemplate && (portalTemplate.productSourceUpdatedAt ?? 0) < product.updatedAt)}
    />
  );
}
