// Per-client layout. The chrome's brand kit comes from the client (not
// the agency), so a client-side admin sees the portal painted as their
// own; an agency-side admin previewing the same path sees the same paint
// (which is the point — the portal looks like Felicia's, regardless of
// who's signed in).

import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { ensureHydrated } from "@/server/storage";
import { requireRoleForClient } from "@/lib/server/auth/auth";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import { devIconPreference } from "@/lib/server/devIconPreference";
import { SURFACE_ROLE_CEILING } from "@/built-ins/runtime/_pageScope";
import { getClientForAgency } from "@/server/tenants";
import { getUserById } from "@/server/users";
import { ThemeInjector } from "@/components/chrome/ThemeInjector";
import { Sidebar } from "@/components/chrome/Sidebar";
import { Topbar } from "@/components/chrome/Topbar";
import { NotificationCentreButton } from "@/components/chrome/NotificationCentreButton";
import { NotificationAttentionProvider } from "@/components/chrome/NotificationAttentionProvider";
import { AdvisorDrawerControl } from "@/components/chrome/AdvisorDrawerControl";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { getPreviewPhase, escapeStyleContent, escapeScriptContent } from "@/lib/server/portal/previewPhase";
import { getPhaseForClientStage } from "@/server/phases";
import { resolvePhaseTokens } from "@/server/phaseTokens";
import { getAgency } from "@/server/tenants";
import { WelcomeGate } from "@/components/chrome/WelcomeGate";
import { cookies } from "next/headers";
import { PortalRouteCanvas } from "@/components/chrome/PortalRouteCanvas";
import { listOperationalAlerts } from "@/lib/server/inbox/operationalAlerts";
import { listOperationalAlertViews } from "@/lib/server/inbox/operationalAlertPreferences";
import { ClientRadarQuickLookControl } from "@/components/chrome/ClientRadarQuickLookControl";
import { clientWorkspaceHref, resolveClientWorkspaceTab } from "@/lib/clients/clientWorkspace";
import { resolvePortalProductAssignment } from "@/lib/products/productAssignments";
import { listAgencyProducts } from "@/server/agencyProducts";
import { resolveClientPortalProvider } from "@/lib/server/clients/clientPortalProvider";
import { listGrantedDevWorkspaceProjects } from "@/lib/server/dev/devProjectAccess";
import {
  CLIENT_TAB_ELEMENT_KEYS,
  clientWorkspaceElementLevel,
  clientWorkspaceHasAnyVisibleElement,
  currentClientWorkspaceElementAccess,
} from "@/lib/server/access/clientWorkspaceElementAccess";
import type { AccessElementKey } from "@/server/types";

export default async function ClientLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ clientId: string }>;
}) {
  await ensureHydrated();
  const { clientId } = await params;

  // The client WORKSPACE's own people: the agency's staff plus the client's
  // team. `requireRoleForClient` still enforces the tenant-scope match for
  // client-side roles; the role list answers the separate question of whether
  // this surface belongs to the caller at all.
  //
  // This was `[...ALL_ROLES]` — every role in the product — which meant an
  // `end-customer` attached to the client got the whole workspace chrome
  // rendered around whatever the page did: the client's name and stage, the
  // provider, and a sidebar naming Commercial / Client record / Fulfilment.
  // Refusing at the page but not here would leak the shape of the internal
  // record even when its contents 404. The ceiling is
  // `SURFACE_ROLE_CEILING.client`, the same one every plugin page under this
  // host is capped by, so the shell and its children agree by construction
  // rather than by two lists staying in step.
  let session;
  try {
    session = await requireRoleForClient([...SURFACE_ROLE_CEILING.client], clientId);
  } catch {
    redirect("/portal");
  }

  const client = getClientForAgency(session.agencyId, clientId);
  if (!client) notFound();
  const { access: clientAccess } = await currentClientWorkspaceElementAccess(client.id);
  if (!clientWorkspaceHasAnyVisibleElement(clientAccess)) redirect("/portal");
  const clientElementVisible = (key: AccessElementKey) => clientWorkspaceElementLevel(clientAccess, key) !== "hidden";
  const devProjects = await listGrantedDevWorkspaceProjects({
    userId: session.userId,
    agencyId: session.agencyId,
    environment: session.sandbox ? "sandbox" : "live",
    clientId: client.id,
  });
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
      ...(clientElementVisible("client.overview") ? [{ id: "client-overview", label: "Overview", href: clientWorkspaceHref(client.id, "overview"), order: 10 }] : []),
      ...(clientElementVisible("client.relationship") ? [{ id: "client-relationship", label: "Relationship", href: clientWorkspaceHref(client.id, "relationship"), order: 20 }] : []),
      ...(clientElementVisible("client.fulfilment") ? [{
        id: "client-delivery",
        label: "Fulfilment",
        href: clientWorkspaceHref(client.id, "delivery"),
        badge: assignedServices.length || "Set up",
        order: 30,
      }] : []),
      ...(clientElementVisible("client.commercial") ? [{ id: "client-finance", label: "Commercial", href: clientWorkspaceHref(client.id, "finance"), order: 40 }] : []),
      ...(clientElementVisible("client.record") ? [{ id: "client-notes", label: "Client record", href: clientWorkspaceHref(client.id, "notes"), order: 50 }] : []),
      ...(clientElementVisible("client.portal") ? [{ id: "client-portal", label: "Client portal", href: clientWorkspaceHref(client.id, "portal"), order: 60 }] : []),
    ],
  };
  let panels: import("@/lib/chrome/sidebarLayout").NavPanel[] = [workspacePanel];
  if (clientElementVisible("client.settings")) {
    panels.push({
      id: "settings",
      label: "Settings",
      order: 90,
      items: [
        {
          id: session.publicShowcase ? "showcase-permissions" : "client-settings",
          label: session.publicShowcase ? "Permissions" : "Client settings",
          href: session.publicShowcase ? "/portal/account/permissions" : `${overviewBase}/settings`,
          order: 100,
        },
      ],
    });
  }

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
        .filter(item => {
          const key = clientElementKeyForHref(item.href, client.id);
          return !key || clientElementVisible(key);
        })
        .sort((a, b) => a.order - b.order),
    }];
  }
  if (!session.publicShowcase && devProjects.length) {
    panels.push({
      id: "tools",
      label: "Development",
      order: 75,
      items: [
        { id: "dev-workspace", label: "Dev projects", href: "/portal/dev-workspace", panelId: "tools", order: 0, badge: devProjects.length },
        ...devProjects.map(({ project, capabilities }, index) => ({
          id: `dev-project-${project.id}`,
          label: project.name,
          href: `/portal/dev-workspace/${encodeURIComponent(project.id)}`,
          panelId: "tools",
          order: (index + 1) * 10,
          badge: capabilities.includes("element.project.editor.view") ? undefined : "Request",
        })),
      ],
    });
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
            inspecting={Boolean(session.previewReturnUserId)}
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
            sandboxMode={Boolean(session.sandbox)}
            publicShowcase={session.publicShowcase}
            devModeActive={Boolean(session.devReturnAgencyId)}
            devConsole={devDocsAccessible(session) && (await devIconPreference())}
            privacyTerms={[
              client.name,
              client.ownerEmail ?? "",
              typeof client.metadata?.contactName === "string" ? client.metadata.contactName : "",
              typeof client.metadata?.businessName === "string" ? client.metadata.businessName : "",
              typeof client.metadata?.phone === "string" ? client.metadata.phone : "",
            ]}
            previewActive={!!previewActive}
            notifications={session.role.startsWith("agency-") && !session.publicShowcase
              ? <NotificationCentreButton includeProductUpdates={false} />
              : undefined}
            radarControl={!session.publicShowcase && (session.role === "agency-owner" || session.role === "agency-manager") ? <ClientRadarQuickLookControl agencyId={session.agencyId} clientId={client.id} /> : null}
            advisorControl={!session.publicShowcase && (session.role === "agency-owner" || session.role === "agency-manager") ? (
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

function clientElementKeyForHref(href: string, clientId: string): AccessElementKey | null {
  const base = `/portal/clients/${encodeURIComponent(clientId)}`;
  if (!href.startsWith(base)) return null;
  const relative = href.slice(base.length);
  if (relative.startsWith("/settings")) return "client.settings";
  if (relative.startsWith("/")) return "client.systems";
  const query = href.includes("?") ? href.slice(href.indexOf("?") + 1).split("#", 1)[0] : "";
  const rawTab = new URLSearchParams(query).get("tab") ?? undefined;
  return CLIENT_TAB_ELEMENT_KEYS[resolveClientWorkspaceTab(rawTab)];
}
