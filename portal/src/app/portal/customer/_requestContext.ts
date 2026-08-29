import "server-only";

import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getAuthBrand } from "@/lib/brands/authBrand";
import { requireRole } from "@/lib/server/auth/auth";
import { resolveClientPortalProvider } from "@/lib/server/clients/clientPortalProvider";
import { ensureHydrated } from "@/server/storage";
import { getClientForAgency } from "@/server/tenants";
import { getUserById } from "@/server/users";
import { loadCustomerPortalData } from "./_portalData";
import { createCustomerPortalRequestLoader } from "./_requestCache";
import { CUSTOMER_PORTAL_ROLES } from "@/server/types";

function emailDisplayName(email: string): string {
  return (email.split("@")[0] || "there").replace(/[._-]+/g, " ").trim() || "there";
}

/**
 * The layout and page both need the signed-in customer identity. Resolving it
 * once also guarantees both halves of the portal agree on the same client and
 * provider when the underlying store changes during a render.
 */
export const loadCustomerPortalIdentity = createCustomerPortalRequestLoader(async () => {
  await ensureHydrated();
  const session = await requireRole([...CUSTOMER_PORTAL_ROLES]);
  const client = session.clientId
    ? getClientForAgency(session.agencyId, session.clientId)
    : null;
  const user = getUserById(session.userId);
  const cookieStore = await cookies();
  const authBrand = getAuthBrand(cookieStore.get("aqua_public_brand")?.value);
  const provider = client ? resolveClientPortalProvider(client, authBrand) : null;

  return { session, client, user, authBrand, provider };
});

/**
 * One immutable aggregate per RSC request. CustomerLayout consumes this for
 * chrome/attention and CustomerPortalView consumes the exact same object for
 * the body, collapsing the old duplicate Finance/inbox/enquiry reads.
 */
export const loadCustomerPortalRequestContext = createCustomerPortalRequestLoader(async () => {
  const identity = await loadCustomerPortalIdentity();
  if (!identity.client || !identity.provider) notFound();

  const fallbackName = identity.user?.name?.trim() || emailDisplayName(identity.session.email);
  const data = await loadCustomerPortalData(identity.client, fallbackName, identity.provider.name);

  return {
    ...identity,
    client: identity.client,
    provider: identity.provider,
    data,
  };
});
