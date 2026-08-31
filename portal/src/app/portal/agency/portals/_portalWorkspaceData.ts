import "server-only";

import { phaseLabel } from "@/server/phases";
import { agencyProductsForRead, listAgencyProducts } from "@/server/agencyProducts";
import { listClientPortalUpdateOffers, productPortalTemplatesForRead } from "@/server/clientPortalDesigns";
import { listClients } from "@/server/tenants";
import { listTradingCompanies } from "@/server/tradingCompanies";
import { resolvePortalProductAssignment } from "@/lib/products/productAssignments";
import type { PortalTemplateProductRecord, PortalWorkspaceRecord } from "./_PortalsWorkspace";

type PortalMode = PortalWorkspaceRecord["portalMode"];

/**
 * `userId` is kept in the signature but no longer used: since issue #21 this
 * loader writes nothing, so there is no actor to attribute a write to. Callers
 * still pass it, and a future write-on-demand here would need it back.
 */
export function portalWorkspaceData(agencyId: string, userId: string) {
  void userId;
  const companies = new Map(listTradingCompanies(agencyId).map(company => [company.id, company.name]));
  const clients = listClients(agencyId, { includeArchived: true });
  agencyProductsForRead(agencyId);
  const agencyProducts = listAgencyProducts(agencyId, true);
  // Read-only (issue #21): `ensureProductPortalTemplates` seeded a template for
  // every product with a portal every time Fulfilment was rendered.
  const productTemplates = new Map(productPortalTemplatesForRead(agencyId, agencyProducts)
    .map(template => [template.productId, template]));

  const products: PortalTemplateProductRecord[] = agencyProducts.map(product => ({
    id: product.id,
    name: product.name,
    active: product.active,
    portalRequirement: product.portalRequirement,
    portalTemplateKey: product.portalTemplateKey,
    portalHeadline: product.portalHeadline,
    portalWelcomeNote: product.portalWelcomeNote,
    portalStageFocus: product.portalStageFocus,
    portalSupportCta: product.portalSupportCta,
    accentColor: product.accentColor,
    deliverables: product.deliverables,
    portalDesignTemplateId: productTemplates.get(product.id)?.id,
    portalDesignVersionId: productTemplates.get(product.id)?.publishedVersionId,
    portalDesignUpdatedAt: productTemplates.get(product.id)?.updatedAt,
  }));

  // What each client's portal would be offered from its template right now.
  // Read-only: computing an offer changes nothing.
  const offers = new Map(listClientPortalUpdateOffers(agencyId).map(offer => [offer.clientId, offer]));

  const portals: PortalWorkspaceRecord[] = clients.map(client => {
    const metadata = client.metadata ?? {};
    const productAssignment = resolvePortalProductAssignment(metadata, agencyProducts);
    return {
      id: client.id,
      name: client.name,
      ownerEmail: client.ownerEmail,
      status: client.status,
      stageLabel: phaseLabel(client.stage),
      companyName: client.companyId ? companies.get(client.companyId) : undefined,
      accentColor: cleanColor(typeof metadata.portalAccentColor === "string" ? metadata.portalAccentColor : client.brand.primaryColor),
      portalBuiltAt: numberValue(metadata.portalBuiltAt),
      portalUpdatedAt: numberValue(metadata.portalAccessUpdatedAt),
      portalAccessSentAt: numberValue(metadata.portalAccessSentAt),
      portalAccessPreparedAt: numberValue(metadata.portalAccessPreparedAt),
      portalLoginEmail: stringValue(metadata.portalLoginEmail),
      portalMode: cleanMode(metadata.portalMode),
      portalServicePlan: stringValue(metadata.portalServicePlan),
      productCount: productAssignment.products.length,
      templateUpdate: offers.get(client.id)
        ? {
            summary: offers.get(client.id)!.summary,
            onCurrentVersion: offers.get(client.id)!.onCurrentVersion,
            changeCount: offers.get(client.id)!.changeCount,
            conflictCount: offers.get(client.id)!.conflictCount,
          }
        : undefined,
    };
  });

  return { portals, products };
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function cleanMode(value: unknown): PortalMode {
  return value === "designing" || value === "developed-launch" || value === "maintenance" ? value : "onboarding";
}

function cleanColor(value: unknown): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : "#166f73";
}
