import { redirect } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth/auth";
import { AGENCY_ROLES } from "@/server/types";
import { PortalsWorkspace } from "./_PortalsWorkspace";
import { portalWorkspaceData } from "./_portalWorkspaceData";
import { requireCurrentWorkspaceElementAccess, workspaceElementLevel } from "@/lib/server/access/workspaceElementAccess";

export default async function PortalsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }

  const { actor, access } = await requireCurrentWorkspaceElementAccess("fulfilment", "fulfilment.portals", "view");
  const agencyId = actor.resourceAgencyId;
  const canManage = workspaceElementLevel(access, "fulfilment.portals") === "manage";
  const requestedView = (await searchParams).view;
  if (requestedView === "editor") redirect(canManage ? "/portal/agency/portals/editor" : "/portal/agency/fulfilment?view=portals");
  const { portals, products } = portalWorkspaceData(agencyId, session.userId);

  return (
    <PortalsWorkspace
      portals={portals}
      products={products}
      initialView={requestedView === "templates" ? "templates" : "library"}
      canManage={canManage}
    />
  );
}
