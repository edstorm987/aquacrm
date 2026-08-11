import { redirect } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { AGENCY_ROLES } from "@/server/types";
import { PortalsWorkspace } from "./_PortalsWorkspace";
import { portalWorkspaceData } from "./_portalWorkspaceData";

export default async function PortalsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }

  const agencyId = session.activeAgencyId ?? session.agencyId;
  const requestedView = (await searchParams).view;
  if (requestedView === "editor") redirect("/portal/agency/portals/editor");
  const { portals, products } = portalWorkspaceData(agencyId, session.userId);

  return (
    <PortalsWorkspace
      portals={portals}
      products={products}
      initialView={requestedView === "templates" ? "templates" : "library"}
      canManage={session.role === "agency-owner" || session.role === "agency-manager"}
    />
  );
}
