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
import { NotificationBell } from "@/components/chrome/NotificationBell";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { getPreviewPhase, escapeStyleContent, escapeScriptContent } from "@/lib/server/previewPhase";
import { getPhaseForClientStage } from "@/server/phases";
import { resolvePhaseTokens } from "@/server/phaseTokens";
import { getAgency } from "@/server/tenants";
import { WelcomeGate } from "@/components/chrome/WelcomeGate";
import { cookies } from "next/headers";
import { PortalRouteCanvas } from "@/components/chrome/PortalRouteCanvas";

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

  // Always-present workspace nav so the per-client sidebar isn't a
  // "No tools enabled" empty state when nothing is installed yet.
  // Ed's directive 2026-05-08 — "sidebar should always be toggleable"
  // (i.e. always populated). Provides at-minimum an escape hatch +
  // overview tabs as nav links.
  const overviewBase = `/portal/clients/${client.id}`;
  const workspacePanel: import("@/lib/chrome/sidebarLayout").NavPanel = {
    id: "main",
    label: "Workspace",
    order: 0,
    items: [
      { id: "back-to-agency", label: "← Back to agency", href: "/portal/agency", order: 0 },
      { id: "client-overview", label: "Overview", href: overviewBase, order: 10 },
      { id: "client-fulfilment", label: "Fulfilment", href: `${overviewBase}?tab=fulfilment`, order: 20 },
      { id: "client-kanban", label: "Tasks", href: `${overviewBase}?tab=kanban`, order: 30 },
    ],
  };
  let panels: import("@/lib/chrome/sidebarLayout").NavPanel[] = [
    workspacePanel,
    {
      id: "ops",
      label: "Manage",
      order: 50,
      items: [
        { id: "client-website", label: "Website", href: `${overviewBase}?tab=website`, order: 10 },
        { id: "client-properties", label: "Development", href: `${overviewBase}?tab=properties`, order: 20 },
        { id: "client-finance", label: "Finance", href: `${overviewBase}?tab=finance`, order: 30 },
        { id: "client-assets", label: "Assets", href: `${overviewBase}?tab=assets`, order: 40 },
        { id: "client-files", label: "Files", href: `${overviewBase}?tab=files`, order: 50 },
        { id: "client-sops", label: "Processes", href: `${overviewBase}?tab=sops`, order: 60 },
        { id: "client-systems", label: "Monitoring", href: `${overviewBase}?tab=systems`, order: 70 },
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

  // Phase sidebar override — when the active phase carries a custom
  // sidebar shape, replace the auto-built panels with a single
  // "Workspace" panel containing exactly the override entries. Lets a
  // phase like "Onboarding" present a minimal, focused nav.
  if (activePhase?.sidebarOverride && activePhase.sidebarOverride.length > 0) {
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
      <div className="mm-portal-root flex h-dvh overflow-hidden">
        <Sidebar panels={panels} tenantLabel={client.name} currentPath={currentPath} />
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
              ? <NotificationBell agencyId={session.agencyId} actor={session.userId} />
              : undefined}
          />
          <main id="main-content" className="mm-private-surface min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
            <ErrorBoundary label={`${client.name} workspace`}><PortalRouteCanvas>{children}</PortalRouteCanvas></ErrorBoundary>
          </main>
        </div>
      </div>
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
