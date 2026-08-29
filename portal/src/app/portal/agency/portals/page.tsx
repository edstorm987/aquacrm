import { redirect } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth/auth";
import { AGENCY_ROLES } from "@/server/types";
import { requireCurrentWorkspaceElementAccess, workspaceElementLevel } from "@/lib/server/access/workspaceElementAccess";

export default async function PortalsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }

  // ── Redirect stub. The Portals library lives in FULFILMENT. ───────────────
  //
  // Ed, 2026-08-27: "this should mean it all lives in fulfilment" — and the
  // authority always did: every page here gates on `fulfilment.portals`, the
  // sidebar has no Portals row and instead lights up FULFILMENT for this path
  // ("Fulfilment's widened surfaces"), and the Fulfilment workspace already
  // mounts this very component with the same data.
  //
  // So this address was a second door onto one room. It now forwards, following
  // the pattern Dev Team used for its moved sections rather than deleting a URL
  // somebody may have bookmarked. The element gate is still resolved FIRST, so a
  // person without Portals access is bounced by their access rather than being
  // handed a redirect that reveals the surface exists.
  //
  // `/portal/agency/portals/editor` and `/forms` are NOT stubs: the editor is the
  // template-editing mount, and both remain the canonical addresses for their job.
  const { access } = await requireCurrentWorkspaceElementAccess("fulfilment", "fulfilment.portals", "view");
  const canManage = workspaceElementLevel(access, "fulfilment.portals") === "manage";
  const requestedView = (await searchParams).view;
  if (requestedView === "editor") redirect(canManage ? "/portal/agency/portals/editor" : "/portal/agency/fulfilment?view=portals");
  redirect(requestedView === "templates"
    ? "/portal/agency/fulfilment?view=portals&portalView=templates"
    : "/portal/agency/fulfilment?view=portals");
}
