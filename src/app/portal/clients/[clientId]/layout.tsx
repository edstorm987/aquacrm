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
import { listInstalledFor } from "@/server/pluginInstalls";
import { buildSidebar } from "@/lib/chrome/sidebarLayout";
import { effectiveRole } from "@/lib/server/effectiveRole";
import { ThemeInjector } from "@/components/chrome/ThemeInjector";
import { Sidebar } from "@/components/chrome/Sidebar";
import { Topbar } from "@/components/chrome/Topbar";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { getPreviewPhase, escapeStyleContent, escapeScriptContent } from "@/lib/server/previewPhase";
import { getPhaseForClientStage } from "@/server/phases";
import { resolvePhaseTokens } from "@/server/phaseTokens";
import { getAgency } from "@/server/tenants";
import { WelcomeGate } from "@/components/chrome/WelcomeGate";
import { cookies } from "next/headers";

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

  const installs = listInstalledFor({ agencyId: client.agencyId, clientId: client.id });
  const eff = effectiveRole(session);
  const dynamicPanels = buildSidebar({
    role: session.role,
    scope: "client",
    currentClient: client,
    installedPlugins: installs,
    permissions: eff.permissions,
    isFounder: eff.isFounder,
  });
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
      { id: "client-overview", label: "Overview",  href: overviewBase, order: 10 },
      { id: "client-website",  label: "Website",   href: `${overviewBase}?tab=website`,  order: 20 },
      { id: "client-portal",   label: "Portal",    href: `${overviewBase}?tab=portal`,   order: 30 },
      { id: "client-kanban",   label: "Kanban",    href: `${overviewBase}?tab=kanban`,   order: 40 },
      { id: "client-finance",  label: "Finance",   href: `${overviewBase}?tab=finance`,  order: 50 },
      { id: "client-assets",   label: "Assets",    href: `${overviewBase}?tab=assets`,   order: 60 },
      { id: "client-sops",     label: "SOPs",      href: `${overviewBase}?tab=sops`,     order: 70 },
      { id: "client-files",    label: "Files",     href: `${overviewBase}?tab=files`,    order: 80 },
      { id: "client-tools",    label: "Tools",     href: `${overviewBase}?tab=tools`,    order: 90 },
    ],
  };
  // Merge workspace panel with discovered plugin panels (workspace
  // first so it always sits at the top, dynamic plugin panels follow).
  let panels = [workspacePanel, ...dynamicPanels.filter(p => p.id !== "main")];

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
      <div className="flex min-h-screen">
        <Sidebar panels={panels} tenantLabel={client.name} currentPath={currentPath} />
        <div className="flex flex-1 flex-col">
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
            previewActive={!!previewActive}
          />
          <main id="main-content" className="flex-1 px-8 py-6">
            <ErrorBoundary label={`${client.name} workspace`}>{children}</ErrorBoundary>
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
