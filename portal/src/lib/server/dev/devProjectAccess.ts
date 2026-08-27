import "server-only";

import { getDevProject, listDevProjects } from "@/engines/editor/server/devProjects";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import { canUseDevMode } from "@/lib/server/dev/devModeAccess";
import {
  AccessControlError,
  resolveActorAccess,
  requireCurrentAccessActor,
  requireAccessCapability,
} from "@/server/accessControl";
import type {
  AccessCapability,
  DevProject,
} from "@/server/types";

/** Browser-door projection: exact projects only, never the agency catalogue. */
export async function listGrantedDevWorkspaceProjects(input: {
  /** Legacy caller fields are ignored; signed live identity is authoritative. */
  userId?: string;
  agencyId?: string;
  environment?: "live" | "sandbox";
  clientId?: string;
} = {}): Promise<Array<{ project: DevProject; capabilities: AccessCapability[] }>> {
  const actor = await requireCurrentAccessActor();
  return listDevProjects(actor.resourceAgencyId).flatMap(project => {
    if (input.clientId && project.clientId !== input.clientId) return [];
    const resolution = resolveActorAccess(actor, { kind: "project", id: project.id });
    return resolution.capabilities.includes("project.view")
      ? [{ project, capabilities: resolution.capabilities }]
      : [];
  });
}

/**
 * Resolve one project through the canonical access kernel.
 *
 * Routes use this instead of combining a broad global role check with a
 * tenant lookup. The capability check proves current identity, agency,
 * environment and resource ownership; the concrete lookup then returns only
 * the project inside that proven tenant.
 */
export async function requireDevProjectAccess(input: {
  projectId: string;
  capability: AccessCapability;
  elementCapability?: AccessCapability;
}): Promise<Awaited<ReturnType<typeof requireAccessCapability>> & {
  project: DevProject;
  /** Active data-realm tenant. Never substitute the live governance tenant. */
  resourceAgencyId: string;
}> {
  const projectId = input.projectId.trim();
  if (!projectId) {
    throw new AccessControlError(400, "project_required", "A project is required.");
  }
  const scope = { kind: "project" as const, id: projectId };
  // Resolve the current tenant and concrete project before capability
  // evaluation. A foreign id and an invented id therefore share the same 404
  // instead of leaking cross-tenant existence through a 403 ceiling reason.
  const actor = await requireCurrentAccessActor();
  const project = getDevProject(actor.resourceAgencyId, projectId);
  if (!project) {
    throw new AccessControlError(404, "project_not_found", "That project could not be found.");
  }
  const access = await requireAccessCapability({
    capability: input.capability,
    scope,
  });

  if (input.elementCapability) {
    await requireAccessCapability({
      capability: input.elementCapability,
      scope,
    });
  }

  return { ...access, project, resourceAgencyId: actor.resourceAgencyId };
}

/**
 * The checked-out Aqua working tree is an internal, local-only control plane.
 * A scoped project grant can authorize that project's configured repository,
 * but it must never turn into an indirect grant over `process.cwd()`.
 */
export async function requireWholeWorkingTreeFounderAccess() {
  const actor = await requireCurrentAccessActor();
  if (
    actor.user.role !== "agency-owner"
    || !devDocsAccessible(actor.session)
    || !canUseDevMode()
  ) {
    throw new AccessControlError(
      403,
      "local_working_tree_owner_required",
      "The local working tree is available only to the owner in local Dev Mode.",
    );
  }
  return actor;
}
