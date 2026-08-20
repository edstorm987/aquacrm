// /portal/* root layout. Requires session; redirects to /login when
// missing. Per-scope chrome lives one layer down: agency in
// /portal/agency/layout.tsx, client in /portal/clients/[clientId]/layout.tsx,
// end-customer in /portal/customer/layout.tsx.

import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ensureHydrated } from "@/server/storage";
import { getSession } from "@/lib/server/auth/auth";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import { CommandCenterTransition } from "@/components/chrome/CommandCenterTransition";
import { ClientWorkspaceTransition } from "@/components/chrome/ClientWorkspaceTransition";
import { DevModeLoadIn } from "@/components/chrome/DevModeLoadIn";
import { DevModeSwitcher } from "@/components/chrome/DevModeSwitcher";
import { SmartWorkSessionMonitor } from "@/components/chrome/SmartWorkSessionMonitor";
import { getUserById } from "@/server/users";
import { AGENCY_ROLES } from "@/server/types";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  await ensureHydrated();
  const session = await getSession();
  if (!session) redirect("/login?brand=aquacrm&next=/portal");
  const currentUser = getUserById(session.userId);
  const internalOperator = AGENCY_ROLES.includes(session.role);

  return (
    <>
      <CommandCenterTransition />
      <ClientWorkspaceTransition />
      {/* The cinematic plays for TWO journeys, so it is mounted for both:
          a demo session (a persona hop — an identity change), and a founder in
          Dev Mode routing into the Dev Console workspace (plain navigation,
          same identity). It renders nothing unless the caller armed the
          one-shot sessionStorage flag, and it still respects "skip cinematic
          loading screens" + reduced motion. */}
      {session.isDemo || devDocsAccessible(session) ? <DevModeLoadIn /> : null}
      {/* Dev Mode POV switcher — rendered here (not in a scope Topbar) so it's
          reachable from EVERY persona, including the customer portal, which has
          its own chrome. Fixed + dev-scoped; the load-in (z-10002,
          pointer-events:none) sits above it during a swap. */}
      {session.isDemo && session.devReturnAgencyId ? (
        <div className="fixed inset-x-0 bottom-4 z-[9990] flex justify-center px-3">
          <DevModeSwitcher role={session.role} />
        </div>
      ) : null}
      {children}
      {internalOperator ? <SmartWorkSessionMonitor userName={currentUser?.name || session.email} /> : null}
    </>
  );
}
