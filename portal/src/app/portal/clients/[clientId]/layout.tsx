// Per-client layout. The chrome's brand kit comes from the client (not
// the agency), so a client-side admin sees the portal painted as their
// own; an agency-side admin previewing the same path sees the same paint
// (which is the point — the portal looks like Felicia's, regardless of
// who's signed in).

import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { ensureHydrated } from "@/server/storage";
import { requireRoleForClient } from "@/lib/server/auth";
import { ALL_ROLES } from "@/server/types";
import { getClientForAgency } from "@/server/tenants";
import { getUserById } from "@/server/users";
import { ThemeInjector } from "@/components/chrome/ThemeInjector";
import { Sidebar } from "@/components/chrome/Sidebar";
import { Topbar } from "@/components/chrome/Topbar";
import { NotificationCentreButton } from "@/components/chrome/NotificationCentreButton";
import { NotificationAttentionProvider } from "@/components/chrome/NotificationAttentionProvider";
import { AdvisorDrawerControl } from "@/components/chrome/AdvisorDrawerControl";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { getPreviewPhase, escapeStyleContent, escapeScriptContent } from "@/lib/server/previewPhase";
import { getPhaseForClientStage } from "@/server/phases";
import { resolvePhaseTokens } from "@/server/phaseTokens";
import { getAgency } from "@/server/tenants";
import { WelcomeGate } from "@/components/chrome/WelcomeGate";
import { cookies } from "next/headers";
import { PortalRouteCanvas } from "@/components/chrome/PortalRouteCanvas";
import { listOperationalAlerts } from "@/lib/server/operationalAlerts";
import { listOperationalAlertViews } from "@/lib/server/operationalAlertPreferences";
import { RadarQuickLookControl } from "@/components/chrome/RadarQuickLookControl";
import { clientWorkspaceHref } from "@/lib/clientWorkspace";
import { cleanPortalProducts } from "@/lib/portalProducts";
import { clientServiceCapabilities, inheritedClientServiceKeys } from "@/lib/clientServiceWorkspace";
import { listAgencyProducts } from "@/server/agencyProducts";

export default async function ClientLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ clientId: string }>;
}) {
  await ensureHydrated();
  const { clientId } = await params;

  // All roles (except end-customer's own scope) can hit this layout, but
  // requireRoleForClient enforces tenant-scope match for client-* roles.
  let session;
  try {
    session = await requireRoleForClient([...ALL_ROLES], clientId);
  } catch {
    redirect("/portal");
  }

  const client = getClientForAgency(session.agencyId, clientId);
  if (!client) notFound();
  const assignedServices = cleanPortalProducts(client.metadata?.portalProducts);
  const serviceCatalogue = listAgencyProducts(session.agencyId);
  const serviceCapabilities = clientServiceCapabilities(
    assignedServices,
    inheritedClientServiceKeys(assignedServices, serviceCatalogue),
  );

  // Always-present workspace nav so the per-client sidebar isn't a
  // "No tools enabled" empty state when nothing is installed yet.
  // Ed's directive 2026-05-08 — "sidebar should always be toggleable"
  // (i.e. always populated). Provides at-minimum an escape hatch +
  // overview tabs as nav links.
  const overviewBase = `/portal/clients/${client.id}`;
  const deliveryItems: import("@/lib/chrome/sidebarLayout").NavPanel["items"] = serviceCapabilities.hasServices
    ? [
        { id: "client-delivery", label: "Delivery overview", href: clientWorkspaceHref(client.id, "delivery"), order: 10 },
        ...assignedServices.map((product, index) => ({
          id: `client-service-${product.catalogKey ?? "custom"}-${product.id}`,
          label: product.name,
          href: clientWorkspaceHref(client.id, "delivery", { product: product.id }),
          order: 20 + index,
        })),
        ...(serviceCapabilities.marketing ? [{ id: "client-marketing", label: "Social and paid media", href: clientWorkspaceHref(client.id, "marketing"), order: 50 }] : []),
        ...(serviceCapabilities.systems ? [{ id: "client-systems", label: "Systems and development", href: clientWorkspaceHref(client.id, "systems"), order: 60 }] : []),
        { id: "client-files", label: "Files and assets", href: clientWorkspaceHref(client.id, "files"), order: 70 },
        { id: "client-portal", label: "Client portal", href: clientWorkspaceHref(client.id, "portal"), order: 80 },
      ]
    : [{ id: "client-assign-services", label: "Assign services", href: `${clientWorkspaceHref(client.id, "delivery")}#service-assignment`, order: 10 }];
  const workspacePanel: import("@/lib/chrome/sidebarLayout").NavPanel = {
    id: "main",
    label: "Workspace",
    order: 0,
    items: [
      { id: "back-to-agency", label: "← Back to agency", href: "/portal/agency", order: 0 },
      { id: "client-overview", label: "Client overview", href: clientWorkspaceHref(client.id, "overview"), order: 10 },
      { id: "client-relationship", label: "Relationship", href: clientWorkspaceHref(client.id, "relationship"), order: 20 },
      { id: "client-communications", label: "Communications", href: clientWorkspaceHref(client.id, "communications"), order: 30 },
    ],
  };
  let panels: import("@/lib/chrome/sidebarLayout").NavPanel[] = [
    workspacePanel,
    {
      id: "fulfillment",
      label: "Delivery",
      order: 30,
      items: deliveryItems,
    },
    {
      id: "ops",
      label: "Operations",
      order: 50,
      items: [
        { id: "client-finance", label: "Finance", href: clientWorkspaceHref(client.id, "finance"), order: 20 },
        { id: "client-notes", label: "Internal notes", href: clientWorkspaceHref(client.id, "notes"), order: 30 },
      ],
    },
    {
      id: "settings",
      label: "Settings",
      order: 90,
      items: [
        {
          id: "client-settings",
          label: "Client settings",
          href: `${overviewBase}/settings`,
          order: 100,
        },
      ],
    },
  ];

  // Phase sidebar override — read AFTER activePhase resolved below.
  // Computed inline once `activePhase` is available (further down).

  const h = await headers();
  const currentPath = h.get("x-invoke-path") ?? h.get("x-pathname") ?? `/portal/clients/${client.id}`;

  // Preview-phase override (founder uses /portal/agency/phases). When the
  // cookie is set + the phase belongs to this client's agency, inject
  // its operator-authored CSS / JS into the portal head. NOT sanitised
  // — author scope is gated to founder + agency-manager (chapter
  // `04-phases-preview-ui.md` documents the trade-off).
  const previewPhase = await getPreviewPhase();
  const previewActive = previewPhase && previewPhase.agencyId === client.agencyId;

  // Welcome gate — phase-driven, first-landing only. Skipped during
  // phase preview (operator perspective) and when the phase has no
  // welcome copy authored. Cookie key is per-client + per-phase so
  // moving the client to a new phase re-prompts with the new welcome.
  const activePhase = previewActive
    ? previewPhase
    : getPhaseForClientStage(client.agencyId, client.stage);
  const cookieJar = await cookies();
  const welcomeCookie = activePhase
    ? cookieJar.get(`mm-welcomed-${client.id}-${activePhase.id}`)?.value
    : undefined;
  const showWelcome =
    !previewActive &&
    !!activePhase &&
    !!activePhase.welcomeHeading &&
    !!activePhase.welcomeBody &&
    !welcomeCookie;
  const sessionUser = getUserById(session.userId);
  const alertViews = session.role.startsWith("agency-")
    ? listOperationalAlertViews(session.agencyId, session.userId, await listOperationalAlerts(session.agencyId))
    : [];

  // Phase sidebar override — when the active phase carries a custom
  // sidebar shape, replace the auto-built panels with a single
  // "Workspace" panel containing exactly the override entries. Lets a
  // phase like "Onboarding" present a minimal, focused nav.
  if ((!session.role.startsWith("agency-") || previewActive) && activePhase?.sidebarOverride && activePhase.sidebarOverride.length > 0) {
    panels = [{
      id: "main",
      label: "Workspace",
      order: 0,
      items: activePhase.sidebarOverride
        .map((item, idx) => ({
          id: item.id,
          label: item.label,
          href: item.href.replaceAll("[clientId]", client.id),
          order: item.order ?? (idx + 1) * 10,
        }))
        .sort((a, b) => a.order - b.order),
    }];
  }

  return (
    <>
      {previewActive && previewPhase?.customCss ? (
        <style
          data-phase-preview={previewPhase.id}
          dangerouslySetInnerHTML={{ __html: escapeStyleContent(previewPhase.customCss) }}
        />
      ) : null}
      {previewActive && previewPhase?.customJs ? (
        <script
          data-phase-preview={previewPhase.id}
          dangerouslySetInnerHTML={{ __html: escapeScriptContent(previewPhase.customJs) }}
        />
      ) : null}
      <ThemeInjector brand={client.brand} scope="client" />
      <NotificationAttentionProvider initialAlerts={alertViews}>
      <div className="mm-portal-root flex h-dvh overflow-hidden">
        <Sidebar panels={panels} tenantLabel={client.name} currentPath={currentPath} navAlignment="start" variant="client" />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar
            title={client.name}
            subtitle={`Stage · ${client.stage}`}
            role={session.role}
            email={session.email}
            name={getUserById(session.userId)?.name}
            avatarUrl={getUserById(session.userId)?.avatarUrl}
            panels={panels}
            tenantLabel={client.name}
            currentPath={currentPath}
            sidebarVariant="client"
            isDemo={session.isDemo}
            showcaseMode={Boolean(session.showcaseReturnAgencyId)}
            privacyTerms={[
              client.name,
              client.ownerEmail ?? "",
              typeof client.metadata?.contactName === "string" ? client.metadata.contactName : "",
              typeof client.metadata?.businessName === "string" ? client.metadata.businessName : "",
              typeof client.metadata?.phone === "string" ? client.metadata.phone : "",
            ]}
            previewActive={!!previewActive}
            notifications={session.role.startsWith("agency-")
              ? <NotificationCentreButton />
              : undefined}
            radarControl={session.role === "agency-owner" || session.role === "agency-manager" ? <RadarQuickLookControl agencyId={session.agencyId} /> : null}
            advisorControl={session.role === "agency-owner" || session.role === "agency-manager" ? (
              <AdvisorDrawerControl agencyId={session.agencyId} userId={session.userId} userName={sessionUser?.name || session.email} />
            ) : null}
          />
          <main id="main-content" className="mm-private-surface min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
            <ErrorBoundary label={`${client.name} workspace`}><PortalRouteCanvas>{children}</PortalRouteCanvas></ErrorBoundary>
          </main>
        </div>
      </div>
      </NotificationAttentionProvider>
      {showWelcome && activePhase && (
        <WelcomeGate
          clientId={client.id}
          phaseId={activePhase.id}
          heading={activePhase.welcomeHeading!}
          body={activePhase.welcomeBody!}
          tokens={resolvePhaseTokens({
            user: sessionUser,
            client,
            agencyName: getAgency(client.agencyId)?.name ?? "",
          })}
        />
      )}
    </>
  );
}
