import { notFound, redirect } from "next/navigation";

import { requireRole } from "@/lib/server/auth/auth";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import { AGENCY_ROLES } from "@/server/types";
import { ensureHydrated } from "@/server/storage";
import { loadPortalStudioProps, type PortalStudioQuery } from "@/engines/editor/server/portalStudio";
import { loadEditorAssistant } from "@/engines/editor/server/editorAssistant";
import { getDevProject } from "@/engines/editor/server/devProjects";

import { ClientPortalStudio } from "../../../agency/portals/editor/_ClientPortalStudio";

// The Dev Editor itself — entered FOR a project, and exited back to the
// projects workspace.
//
// Ed's shape: pressing "Editor" in Dev Team lands on the projects workspace,
// not on a full-screen canvas over whatever happened to be first. You pick (or
// add) a project, open it here, and leaving returns you to the list — which is
// what makes several projects at once workable.
//
// Founder + Dev Mode only: role first, then `devDocsAccessible`. The studio's
// own API routes assert their scope again.
export const dynamic = "force-dynamic";

export default async function DevEditorStudioPage({
  searchParams,
}: {
  searchParams: Promise<PortalStudioQuery & { project?: string }>;
}) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }
  if (!devDocsAccessible(session)) notFound();

  const agencyId = session.activeAgencyId ?? session.agencyId;
  const query = await searchParams;

  // No project named, or one that is not this agency's — go back and choose.
  const project = query.project ? getDevProject(agencyId, query.project) : null;
  if (query.project && !project) redirect("/portal/dev-team/editor");

  const props = loadPortalStudioProps({ agencyId, userId: session.userId, role: session.role, query });
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
      backHref="/portal/dev-team/editor"
      backLabel="Back to projects"
      assistant={assistant}
      initialProjectId={project?.id ?? ""}
      projectName={project?.name}
      projectKind={project?.kind}
    />
  );
}
