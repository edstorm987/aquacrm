import { redirect } from "next/navigation";

import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth/auth";
import { AGENCY_ROLES } from "@/server/types";
import { clientWorkspaceHref } from "@/lib/clients/clientWorkspace";
import { loadPortalStudioProps, type PortalStudioQuery } from "@/engines/editor/server/portalStudio";
import { loadEditorAssistant } from "@/engines/editor/server/editorAssistant";
import { ClientPortalStudio } from "./_ClientPortalStudio";

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

  const agencyId = session.activeAgencyId ?? session.agencyId;
  const query = await searchParams;
  const props = loadPortalStudioProps({ agencyId, userId: session.userId, role: session.role, query });
  // Aqua Editor AI — the same assistant engine the Advisor and Librarian use.
  const assistant = await loadEditorAssistant(agencyId, session.userId);

  return (
    <ClientPortalStudio
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
    />
  );
}
