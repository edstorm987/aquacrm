// /portal/* root layout. Requires session; redirects to /login when
// missing. Per-scope chrome lives one layer down: agency in
// /portal/agency/layout.tsx, client in /portal/clients/[clientId]/layout.tsx,
// end-customer in /portal/customer/layout.tsx.

import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ensureHydrated } from "@/server/storage";
import { getSession } from "@/lib/server/auth";
import { CommandCenterTransition } from "@/components/chrome/CommandCenterTransition";
import { ClientWorkspaceTransition } from "@/components/chrome/ClientWorkspaceTransition";
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
      {children}
      {internalOperator ? <SmartWorkSessionMonitor userName={currentUser?.name || session.email} /> : null}
    </>
  );
}
