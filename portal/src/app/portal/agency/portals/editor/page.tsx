import { redirect } from "next/navigation";

import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth/auth";
import { AGENCY_ROLES } from "@/server/types";
import { clientWorkspaceHref } from "@/lib/clients/clientWorkspace";
import { loadPortalStudioProps, type PortalStudioQuery } from "@/engines/editor/server/portalStudio";
import { loadEditorAssistant } from "@/engines/editor/server/editorAssistant";
import { DevEditor } from "@/engines/editor/DevEditor";
import { requireCurrentWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";

// The Portal Studio's own route. The loader it used to carry inline now lives
// in the editor engine (`@/engines/editor/server/portalStudio`) so the Dev Team
// editor mounts the SAME studio with the same data — one engine, two doors.
export default async function ClientPortalEditorPage({
  searchParams,
}: {
  searchParams: Promise<PortalStudioQuery>;
}) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }

  const { actor } = await requireCurrentWorkspaceElementAccess("fulfilment", "fulfilment.portals", "manage");
  const agencyId = actor.resourceAgencyId;
  const query = await searchParams;
  const props = loadPortalStudioProps({ agencyId, userId: session.userId, role: session.role, query });
  // Aqua Editor AI — its own assistant, its own token, configured per dev
  // project. This door has no project concept, so it opens unconfigured with a
  // reason saying so. Falling back to the agency assistant's key here would
  // undo the separation Ed asked for on the one route nobody would check.
  const assistant = session.publicShowcase ? undefined : await loadEditorAssistant(agencyId, session.userId);

  return (
    <DevEditor
      clients={props.clients}
      templates={props.templates}
      initialClientId={props.initialClientId}
      initialTemplateId={props.initialTemplateId}
      initialScope={props.initialScope}
      initialMode={props.initialMode}
      initialSection={props.initialSection}
      canManage={session.publicShowcase ? false : props.canManage}
      backHref={props.lockToClient ? clientWorkspaceHref(props.initialClientId, "portal") : undefined}
      backLabel={props.lockToClient ? "Back to client portal" : undefined}
      lockToClient={props.lockToClient}
      assistant={assistant}
      developerModeAvailable={!session.publicShowcase}
    />
  );
}
