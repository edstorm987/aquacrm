import "server-only";

import { resolvePortalProductAssignment } from "@/lib/productAssignments";
import { getClientForAgency, updateClient } from "./tenants";
import { getAgencyProduct, listAgencyProducts } from "./agencyProducts";
import { ensureClientPortalInstance, ensureProductPortalTemplate } from "./clientPortalDesigns";
import { reconcileClientProductWorkspaces } from "./productWorkspaces";

export interface ClientPortalSetupMetadata {
  phase?: string;
  planTier?: string;
  therapistName?: string;
  practiceName?: string;
  onboardingStartedAt?: string;
}

export type ClientPortalSetupResult =
  | {
      ok: true;
      variantId: string;
      pageId: string;
      siteId: string;
      installedWebsiteEditor: false;
    }
  | { ok: false; error: string; installedWebsiteEditor: false };

const PORTAL_VERSION = "stunning-standard-v1";

/**
 * Provisions the core Milesymedia customer home.
 *
 * Customer identities are created later by the single-use invitation flow,
 * so a new client never receives a broad password account by accident.
 */
export async function setupClientStarterPortal(input: {
  agencyId: string;
  clientId: string;
  actor?: string;
  metadata?: ClientPortalSetupMetadata;
  ensureWebsiteEditor?: boolean;
}): Promise<ClientPortalSetupResult> {
  const client = getClientForAgency(input.agencyId, input.clientId);
  if (!client) {
    return { ok: false, error: "client not found", installedWebsiteEditor: false };
  }

  const metadata = input.metadata ?? {};
  const builtAt = Date.now();
  const portalProducts = resolvePortalProductAssignment(client.metadata ?? {}, listAgencyProducts(input.agencyId, true)).products;
  const productId = portalProducts.length === 1
    ? portalProducts[0].id
    : typeof client.metadata?.agencyProductId === "string" ? client.metadata.agencyProductId : "";
  const product = productId ? getAgencyProduct(input.agencyId, productId) : null;
  const productTemplate = product && product.portalRequirement !== "none"
    ? ensureProductPortalTemplate(input.agencyId, product, input.actor)
    : null;
  const portalInstance = ensureClientPortalInstance({
    agencyId: input.agencyId,
    clientId: input.clientId,
    actorUserId: input.actor,
    accentColor: typeof client.metadata?.portalAccentColor === "string" ? client.metadata.portalAccentColor : undefined,
    templateId: productTemplate?.id,
  });
  const saved = updateClient(input.agencyId, input.clientId, {
    endCustomers: {
      signupsEnabled: true,
      postLoginReturnUrl: "/portal/customer",
    },
    metadata: {
      portalMode: "onboarding",
      portalBuiltAt: builtAt,
      portalShellVersion: PORTAL_VERSION,
      portalTemplateId: portalInstance.templateId,
      portalTemplateVersionId: portalInstance.templateVersionId,
      portalDesignVersionId: portalInstance.publishedVersionId,
      portalProvisioningSource: "built-in",
      portalAccessUpdatedAt: builtAt,
      portalServicePlan: metadata.planTier?.trim()
        || (typeof client.metadata?.portalServicePlan === "string"
          ? client.metadata.portalServicePlan
          : "Milesymedia custom plan"),
      portalContactName: metadata.therapistName?.trim()
        || (typeof client.metadata?.portalContactName === "string"
          ? client.metadata.portalContactName
          : client.name),
      onboardingStartedAt: metadata.onboardingStartedAt,
      portalProductWorkspaces: reconcileClientProductWorkspaces(client, portalProducts, "onboarding"),
    },
  });

  if (!saved) {
    return { ok: false, error: "customer portal could not be saved", installedWebsiteEditor: false };
  }

  return {
    ok: true,
    variantId: PORTAL_VERSION,
    pageId: "customer-home",
    siteId: input.clientId,
    installedWebsiteEditor: false,
  };
}
