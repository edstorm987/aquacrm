import { redirect } from "next/navigation";

import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth/auth";
import { AGENCY_ROLES } from "@/server/types";
import { clientWorkspaceHref } from "@/lib/clients/clientWorkspace";
import { loadPortalStudioProps, type PortalStudioQuery } from "@/engines/editor/server/portalStudio";
import { loadEditorAssistant } from "@/engines/editor/server/editorAssistant";
import { DevEditor } from "@/engines/editor/DevEditor";
import {
  requireCurrentWorkspaceElementAccess,
  workspaceElementLevel,
} from "@/lib/server/access/workspaceElementAccess";

// The Portal Studio's own route. The loader it used to carry inline now lives
// in the editor engine (`@/engines/editor/server/portalStudio`) so the Dev Team
// editor mounts the SAME studio with the same data — one engine, two doors.
export default async function ClientPortalEditorPage({
  searchParams,
}: {
  searchParams: Promise<PortalStudioQuery>;
}) {
  await ensureHydrated();
  try {
    await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }

  const { actor, access } = await requireCurrentWorkspaceElementAccess("fulfilment", "fulfilment.portals", "manage");
  const agencyId = actor.resourceAgencyId;
  const query = await searchParams;
  const canManage = !actor.session.publicShowcase
    && workspaceElementLevel(access, "fulfilment.portals") === "manage";
  const canUseManagerTools = actor.session.role === "agency-owner" || actor.session.role === "agency-manager";
  const props = loadPortalStudioProps({ agencyId, userId: actor.session.userId, canManage, query });
  // Aqua Editor AI — its own assistant, its own token, configured per dev
  // project. This door has no project concept, so it opens unconfigured with a
  // reason saying so. Falling back to the agency assistant's key here would
  // undo the separation Ed asked for on the one route nobody would check.
  const assistant = actor.session.publicShowcase
    ? undefined
    : await loadEditorAssistant(agencyId, actor.session.userId);

  return (
    <DevEditor
      clients={props.clients}
      templates={props.templates}
      initialClientId={props.initialClientId}
      initialTemplateId={props.initialTemplateId}
      initialScope={props.initialScope}
      initialMode={props.initialMode}
      initialSection={props.initialSection}
      canManage={props.canManage}
      backHref={props.lockToClient ? clientWorkspaceHref(props.initialClientId, "portal") : undefined}
      backLabel={props.lockToClient ? "Back to client portal" : undefined}
      lockToClient={props.lockToClient}
      assistant={assistant}
      assistantCanManage={canUseManagerTools}
      canManageProjectConnections={canUseManagerTools}
      canRebindProjectConnections={canUseManagerTools}
      developerModeAvailable={!actor.session.publicShowcase && canUseManagerTools}
    />
  );
}
