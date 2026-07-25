import "server-only";

import { getClientForAgency, updateClient } from "./tenants";

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

const PORTAL_VERSION = "milesymedia-customer-home-v2";

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
  const saved = updateClient(input.agencyId, input.clientId, {
    endCustomers: {
      signupsEnabled: true,
      postLoginReturnUrl: "/portal/customer",
    },
    metadata: {
      portalMode: "onboarding",
      portalBuiltAt: builtAt,
      portalShellVersion: PORTAL_VERSION,
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
