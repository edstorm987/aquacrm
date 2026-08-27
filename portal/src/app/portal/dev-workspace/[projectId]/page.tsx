import { notFound, redirect } from "next/navigation";

import { AccessSnapshotProvider } from "@/components/access/AccessSnapshot";
import { DevEditor } from "@/engines/editor/DevEditor";
import { aquaTagBrowserUrl } from "@/engines/editor/editing/aquaTagBridge";
import { devProjectMapStatus, getDevProject } from "@/engines/editor/server/devProjects";
import { loadEditorAssistant } from "@/engines/editor/server/editorAssistant";
import { requireCurrentAccessActor, resolveActorAccess } from "@/server/accessControl";
import { ProjectAccessRequest } from "../_ProjectAccessRequest";

export const dynamic = "force-dynamic";

export default async function GovernedDevProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  let actor: Awaited<ReturnType<typeof requireCurrentAccessActor>>;
  try {
    actor = await requireCurrentAccessActor();
  } catch {
    redirect(`/login?next=${encodeURIComponent(`/portal/dev-workspace/${projectId}`)}`);
  }

  const project = getDevProject(actor.resourceAgencyId, projectId);
  if (!project) notFound();

  const resolution = resolveActorAccess(actor, { kind: "project", id: project.id });
  const capabilities = resolution.capabilities;
  const canOpen = capabilities.includes("project.view")
    && capabilities.includes("element.project.editor.view");
  if (!canOpen) {
    return <ProjectAccessRequest projectId={project.id} environment={actor.environment} />;
  }

  const canEdit = capabilities.includes("project.edit")
    && capabilities.includes("element.project.editor.use");
  const canViewAi = capabilities.includes("project.ai")
    && capabilities.includes("element.development.ai.view");
  const canUseAi = capabilities.includes("project.ai")
    && capabilities.includes("element.development.ai.use");
  const canManageAi = capabilities.includes("project.ai")
    && capabilities.includes("element.development.ai.manage");
  const canManageProjectConnections = capabilities.includes("project.connection.manage");
  const canRebindProjectConnections = canManageProjectConnections
    && (actor.user.role === "agency-owner" || actor.user.role === "agency-manager");
  const canReadCode = capabilities.includes("element.development.code.view");
  const canExploreSource = capabilities.includes("element.development.explorer.view");
  const assistant = canViewAi
    ? await loadEditorAssistant(actor.resourceAgencyId, actor.user.id, project.id)
    : undefined;

  return (
    <AccessSnapshotProvider
      scope={{ kind: "project", id: project.id }}
      environment={actor.environment}
      initialResolution={resolution}
    >
      <DevEditor
        clients={[]}
        templates={[]}
        initialClientId=""
        initialTemplateId=""
        initialScope="client"
        initialMode="onboarding"
        initialSection="home"
        canManage={canEdit}
        backHref="/portal/dev-workspace"
        backLabel="Back to my projects"
        lockToClient
        assistant={assistant}
        assistantCanUse={canUseAi}
        assistantCanManage={canManageAi}
        canManageProjectConnections={canManageProjectConnections}
        canRebindProjectConnections={canRebindProjectConnections}
        initialProjectId={project.id}
        projectName={project.name}
        projectKind={project.kind}
        projectTagged={devProjectMapStatus(project).browserAvailable}
        projectBrowserUrl={aquaTagBrowserUrl(project)}
        developerModeAvailable={canReadCode || canExploreSource}
        repositoryPreviewAvailable
        accessCapabilities={capabilities}
      />
    </AccessSnapshotProvider>
  );
}
