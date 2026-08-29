import { redirect, notFound } from "next/navigation";
import { cookies, headers } from "next/headers";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth/auth";
import { getClientForAgency } from "@/server/tenants";
import { ThemeInjector } from "@/components/chrome/ThemeInjector";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { PortalLoadingCoordinator } from "@/components/ui/PortalLoadingCoordinator";
import { CustomerPortalChrome } from "./_CustomerPortalChrome";
import { customerPortalModeLabel } from "./_portalData";
import { loadCustomerPortalIdentity, loadCustomerPortalRequestContext } from "./_requestContext";
import { portalProjectLabel } from "@/lib/portal/portalProducts";
import { getAuthBrand } from "@/lib/brands/authBrand";
import { resolveClientPortalProvider } from "@/lib/server/clients/clientPortalProvider";
import { buildCustomerPortalAttention } from "@/lib/portal/customerPortalAttention";
import { listAccessibleClientPortals } from "@/server/clientRelationships";
import { listInstalledForClientOnly } from "@/server/pluginInstalls";
import { listPlugins } from "@/built-ins/runtime/_registry";
import { resolveCustomerAccountActivityCapabilities } from "@/lib/portal/customerAccountActivity";
import { listGrantedDevWorkspaceProjects } from "@/lib/server/dev/devProjectAccess";
import { sandboxModeAvailable } from "@/lib/server/sandbox/sandboxEnvironment";
import { CUSTOMER_PORTAL_ROLES } from "@/server/types";

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const authBrand = getAuthBrand(cookieStore.get("aqua_public_brand")?.value);
  try {
    await ensureHydrated();
    const session = await requireRole([...CUSTOMER_PORTAL_ROLES]);
    const client = session.clientId ? getClientForAgency(session.agencyId, session.clientId) : null;
    if (client) {
      const provider = resolveClientPortalProvider(client, authBrand);
      return { title: `${provider.name} client portal` };
    }
  } catch {
    // The layout owns authentication and redirect behaviour; metadata stays neutral here.
  }
  return {
    title: `${authBrand.name} client portal`,
  };
}

export default async function CustomerLayout({ children }: { children: ReactNode }) {
  let identity;
  try {
    identity = await loadCustomerPortalIdentity();
  } catch {
    redirect("/portal");
  }
  const { session, client, user, authBrand, provider } = identity;

  // End-customer must be tied to a client.
  if (!session.clientId) redirect("/login");

  // Never been through setup — they were signed in by a link and have no
  // password of their own yet. Dropping them straight into the portal leaves
  // somebody who cannot get back in once the link is used.
  if (user && !user.welcomeCompletedAt) redirect("/setup");
  if (!client || !provider) notFound();

  const h = await headers();

  const embed = h.get("cookie")?.includes("lk_demo_embed=1") ?? false;
  if (embed) {
    return (
      <>
        <ThemeInjector brand={client.brand} scope="customer" />
        <main id="main-content" data-testid="portal-customer-embed" data-portal-loading-theme="client" className="mm-portal-root relative min-h-screen overflow-hidden px-4 py-4">
          <PortalLoadingCoordinator>
            <ErrorBoundary label="customer (embed)">{children}</ErrorBoundary>
          </PortalLoadingCoordinator>
        </main>
      </>
    );
  }

  const { data: portalData } = await loadCustomerPortalRequestContext();
  const accessiblePortals = listAccessibleClientPortals(session.agencyId, client.id, session.email);
  const accountActivityCapabilities = resolveCustomerAccountActivityCapabilities({
    registeredPluginIds: listPlugins().map(plugin => plugin.id),
    enabledPluginIds: listInstalledForClientOnly({ agencyId: session.agencyId, clientId: client.id })
      .filter(install => install.enabled)
      .map(install => install.pluginId),
  });
  const devProjects = (await listGrantedDevWorkspaceProjects({
    userId: session.userId,
    agencyId: session.agencyId,
    environment: session.sandbox ? "sandbox" : "live",
    clientId: client.id,
  })).map(({ project, capabilities }) => ({
    id: project.id,
    name: project.name,
    editorVisible: capabilities.includes("element.project.editor.view"),
  }));

  return (
    <>
      <ThemeInjector brand={client.brand} scope="customer" />
      <CustomerPortalChrome
        viewerRole={session.role}
        clientName={client.name}
        email={session.email}
        name={user?.name}
        avatarUrl={user?.avatarUrl}
        modeLabel={customerPortalModeLabel(portalData)}
        presentation={portalData.presentation}
        presentationProductId={portalData.presentationProductId}
        productPresentations={portalData.productPresentations}
        logoUrl={portalData.logoUrl}
        accentColor={portalData.accentColor}
        projectLabel={portalProjectLabel(portalData.products)}
        products={portalData.products}
        providerName={provider.name}
        providerMark={provider.mark}
        attention={buildCustomerPortalAttention(portalData)}
        accountActivityCapabilities={accountActivityCapabilities}
        devProjects={devProjects}
        safeSandboxEntry={!session.sandbox && sandboxModeAvailable(session, user)}
        workspaces={accessiblePortals.map(workspace => {
          const workspaceProvider = resolveClientPortalProvider(workspace, authBrand);
          return {
            id: workspace.id,
            name: workspace.name,
            label: workspace.workspaceLabel,
            providerName: workspaceProvider.name,
            current: workspace.id === client.id,
          };
        })}
      >
        <ErrorBoundary label="client portal">{children}</ErrorBoundary>
      </CustomerPortalChrome>
    </>
  );
}
