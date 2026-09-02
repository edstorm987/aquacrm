import { notFound, redirect } from "next/navigation";

import { requireRole } from "@/lib/server/auth/auth";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import { AGENCY_ROLES } from "@/server/types";
import { ensureHydrated } from "@/server/storage";
import { loadPortalStudioProps, type PortalStudioQuery } from "@/engines/editor/server/portalStudio";
import { loadEditorAssistant } from "@/engines/editor/server/editorAssistant";
import { devProjectMapStatus, getDevProject } from "@/engines/editor/server/devProjects";
import { aquaTagBrowserUrl } from "@/engines/editor/editing/aquaTagBridge";

import { DevEditor } from "@/engines/editor/DevEditor";

// The Dev Editor itself — entered FOR a project, and exited back to the
// projects workspace.
//
// Ed's shape: pressing "Editor" in Dev Team lands on the projects workspace,
// not on a full-screen canvas over whatever happened to be first. You pick (or
// add) a project, open it here, and leaving returns you to the list — which is
// what makes several projects at once workable.
//
// Founder-only Dev Team access: role first, then `devDocsAccessible`. The studio's
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

  const props = loadPortalStudioProps({
    agencyId,
    userId: session.userId,
    canManage: session.role === "agency-owner" || session.role === "agency-manager",
    query,
  });
  // Aqua Editor AI is configured PER PROJECT and runs on its OWN token, so the
  // project is what selects which assistant this is. Without one it reports
  // itself unconfigured rather than borrowing the agency assistant's key.
  const assistant = await loadEditorAssistant(agencyId, session.userId, project?.id);

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
      backHref="/portal/dev-team/editor"
      backLabel="Back to projects"
      assistant={assistant}
      initialProjectId={project?.id ?? ""}
      projectName={project?.name}
      projectKind={project?.kind}
      // Whether there is a BROWSER — the Aqua Tag, and nothing else. Computed
      // by the same `devProjectMapStatus` the projects endpoint and the setup
      // screen use, so the three cannot disagree. Passed at render rather than
      // waited for: the editor's own projects fetch resolves a moment later,
      // and a browser that appears after the screen does reads as a bug.
      projectTagged={project ? devProjectMapStatus(project).browserAvailable : false}
      // Where the browser opens, and therefore the ONE origin the editor will
      // trust. The MAPPED address — MAP already followed the redirects and
      // recorded `finalUrl` — falling back to the typed `siteUrl`. Sending the
      // raw `siteUrl` is what made a bare-domain project (which redirects to
      // www, as most do) reject every message its own tag sent.
      projectBrowserUrl={aquaTagBrowserUrl(project)}
    />
  );
}
