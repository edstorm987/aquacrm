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
import { ClientRadarQuickLookControl } from "@/components/chrome/ClientRadarQuickLookControl";
import { clientWorkspaceHref } from "@/lib/clientWorkspace";
import { resolvePortalProductAssignment } from "@/lib/productAssignments";
import { listAgencyProducts } from "@/server/agencyProducts";
import { resolveClientPortalProvider } from "@/lib/server/clientPortalProvider";

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
  const serviceCatalogue = listAgencyProducts(session.agencyId, true);
  const assignedServices = resolvePortalProductAssignment(client.metadata ?? {}, serviceCatalogue).products;
  const agency = getAgency(client.agencyId);
  const providerFallback = agency?.name?.trim() || "AquaOasis-Web";
  const providerName = resolveClientPortalProvider(client, { name: providerFallback, mark: providerFallback.charAt(0) }).name;

  // Always-present workspace nav so the per-client sidebar isn't a
  // "No tools enabled" empty state when nothing is installed yet.
  // Ed's directive 2026-05-08 — "sidebar should always be toggleable"
  // (i.e. always populated). Provides at-minimum an escape hatch +
  // overview tabs as nav links.
  const overviewBase = `/portal/clients/${client.id}`;
  const canReturnToAgency = session.role === "agency-owner" || session.role === "agency-manager";
  const workspacePanel: import("@/lib/chrome/sidebarLayout").NavPanel = {
    id: "main",
    label: "Client workspace",
    order: 0,
    items: [
      ...(canReturnToAgency ? [{ id: "back-to-agency", label: "← Back to agency", href: "/portal/agency", order: 0 }] : []),
      { id: "client-overview", label: "Overview", href: clientWorkspaceHref(client.id, "overview"), order: 10 },
      { id: "client-relationship", label: "Relationship", href: clientWorkspaceHref(client.id, "relationship"), order: 20 },
      {
        id: "client-delivery",
        label: "Fulfilment",
        href: clientWorkspaceHref(client.id, "delivery"),
        badge: assignedServices.length || "Set up",
        order: 30,
      },
      { id: "client-finance", label: "Commercial", href: clientWorkspaceHref(client.id, "finance"), order: 40 },
      { id: "client-notes", label: "Client record", href: clientWorkspaceHref(client.id, "notes"), order: 50 },
      { id: "client-portal", label: "Client portal", href: clientWorkspaceHref(client.id, "portal"), order: 60 },
    ],
  };
  let panels: import("@/lib/chrome/sidebarLayout").NavPanel[] = [
    workspacePanel,
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
      <NotificationAttentionProvider initialAlerts={alertViews} clientId={client.id}>
      <div className="mm-portal-root mm-client-workspace-shell flex h-dvh overflow-hidden" data-workspace-shell="client">
        <Sidebar panels={panels} tenantLabel={client.name} currentPath={currentPath} navAlignment="start" variant="client" />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar
            title={client.name}
            subtitle={`${providerName} · ${client.stage.replaceAll("-", " ")}`}
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
              ? <NotificationCentreButton includeProductUpdates={false} />
              : undefined}
            radarControl={session.role === "agency-owner" || session.role === "agency-manager" ? <ClientRadarQuickLookControl agencyId={session.agencyId} clientId={client.id} /> : null}
            advisorControl={session.role === "agency-owner" || session.role === "agency-manager" ? (
              <AdvisorDrawerControl agencyId={session.agencyId} userId={session.userId} userName={sessionUser?.name || session.email} />
            ) : null}
          />
          <main id="main-content" className="mm-private-surface mm-client-workspace-main min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
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
            agencyName: agency?.name ?? "",
          })}
        />
      )}
    </>
  );
}
