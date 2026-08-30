// /portal/* root layout. Requires session; redirects to /login when
// missing. Per-scope chrome lives one layer down: agency in
// /portal/agency/layout.tsx, client in /portal/clients/[clientId]/layout.tsx,
// end-customer in /portal/customer/layout.tsx.

import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { PortalViewportLoading } from "@/components/ui/PortalViewportLoading";
import { PortalLoadingCoordinator } from "@/components/ui/PortalLoadingCoordinator";
import { ensureHydrated } from "@/server/storage";
import { getSession, isSessionFresh } from "@/lib/server/auth/auth";
import { getUserChromeLayout } from "@/lib/server/chrome/userChromeLayout";
import { UserCssInjector } from "@/components/chrome/UserCssInjector";
import { buildCompanySwitcherState } from "@/lib/server/auth/companySwitcherState";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import { CommandCenterTransition } from "@/components/chrome/CommandCenterTransition";
import { ClientWorkspaceTransition } from "@/components/chrome/ClientWorkspaceTransition";
import { DevModeLoadIn } from "@/components/chrome/DevModeLoadIn";
import { DevModeSwitcher } from "@/components/chrome/DevModeSwitcher";
import { SandboxTopBar } from "@/components/chrome/SandboxTopBar";
import { SmartWorkSessionMonitor } from "@/components/chrome/SmartWorkSessionMonitor";
import { CompanySwitcherStateProvider } from "@/components/chrome/CompanySwitcher";
import { getUserById } from "@/server/users";
import { AGENCY_ROLES } from "@/server/types";
import { dashboardPlanningSnapshot } from "@/server/dashboardPlanning";

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <PortalLoadingCoordinator scope="workspace">
      <Suspense fallback={<PortalViewportLoading scope="workspace" label="Preparing your workspace…" />}>
        <AuthenticatedPortalLayout>{children}</AuthenticatedPortalLayout>
      </Suspense>
    </PortalLoadingCoordinator>
  );
}

async function AuthenticatedPortalLayout({ children }: { children: ReactNode }) {
  await ensureHydrated();
  const session = await getSession();
  if (!session) redirect("/login?brand=aquacrm&next=/portal");
  const currentUser = getUserById(session.userId);
  const internalOperator = AGENCY_ROLES.includes(session.role);
  // The person's own stylesheet — validated again on this read (the store
  // re-checks on the way out), injected by a client component so ?nocss=1 can
  // actually rescue a broken page. Empty string renders nothing.
  const userCss = getUserChromeLayout(session.agencyId, session.userId).customCss ?? "";
  const companySwitcherState = internalOperator && currentUser && isSessionFresh(session, currentUser)
    ? buildCompanySwitcherState(session, currentUser)
    : null;
  const workSessionNow = Date.now();
  const initialWorkSession = internalOperator
    ? dashboardPlanningSnapshot(session.agencyId, session.userId, undefined, workSessionNow).activeSession
    : null;

  return (
    <CompanySwitcherStateProvider initialState={companySwitcherState}>
      <CommandCenterTransition />
      <ClientWorkspaceTransition />
      <UserCssInjector css={userCss} />
      {/* The cinematic plays for TWO journeys, so it is mounted for both:
          a demo session (a persona hop — an identity change), and a founder in
          Dev Mode routing into the Dev Console workspace (plain navigation,
          same identity). It renders nothing unless the caller armed the
          one-shot sessionStorage flag, and it still respects "skip cinematic
          loading screens" + reduced motion. */}
      {(session.isDemo && !session.publicShowcase) || devDocsAccessible(session) ? <DevModeLoadIn /> : null}
      {/* Dev Mode POV switcher — rendered here (not in a scope Topbar) so it's
          reachable from EVERY persona, including the customer portal, which has
          its own chrome. Fixed + dev-scoped; the load-in (z-10002,
          pointer-events:none) sits above it during a swap. */}
      {/* Sandbox announces itself at the TOP of the page, in the flow, pushing
          the application down — see `SandboxTopBar`. It used to be a pill
          floating at `bottom-4`, which is a thing you stop seeing. Dev Mode's
          switcher keeps the floating treatment: it is a founder tool for
          hopping personas on LIVE data, not a warning about which dataset you
          are looking at. */}
      {session.sandbox ? null : session.isDemo && session.devReturnAgencyId ? (
        <div className="fixed inset-x-0 bottom-4 z-[9990] flex justify-center px-3">
          <DevModeSwitcher role={session.role} />
        </div>
      ) : null}
      {session.sandbox ? <SandboxTopBar environment={session.sandbox} role={session.role} /> : null}
      {children}
      {internalOperator ? <SmartWorkSessionMonitor userName={currentUser?.name || session.email} initialSession={initialWorkSession} initialNow={workSessionNow} /> : null}
    </CompanySwitcherStateProvider>
  );
}
