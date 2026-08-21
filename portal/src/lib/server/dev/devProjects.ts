import "server-only";

import crypto from "node:crypto";

import {
  getIntegrationConnection,
  resolveIntegrationConnectionValues,
  resolveIntegrationValues,
} from "@/lib/server/integrations/integrationConnections";
import { logActivity } from "@/server/activity";
import { getState, mutate } from "@/server/storage";
import type { DevProject, DevProjectType } from "@/server/types";

/**
 * Dev Editor Engine projects.
 *
 * A project binds a repository to the connections that make it reachable —
 * which GitHub connection's token reads it, which Vercel connection deploys
 * it, which Aqua Tag install its site reports as. The engine opens a project
 * and adapts to its `type`; nothing here stores a credential, only the id of
 * a vault connection, so resolving a token is a per-request lookup that dies
 * with the connection when it is revoked.
 */

export const DEV_PROJECT_TYPES: readonly DevProjectType[] = ["software", "website", "portal"];

/**
 * `owner/name` as GitHub accepts it — one slash, no spaces, no `.git`. The
 * owner half admits `_` for Enterprise Managed User namespaces
 * (`handle_shortcode`); the name half refuses dot-only names (`.`/`..`),
 * which GitHub can never host and which URL normalization would silently
 * rewrite into a different API endpoint.
 */
const REPOSITORY_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?\/(?!\.+$)[A-Za-z0-9._-]+$/;

export interface SaveDevProjectInput {
  agencyId: string;
  projectId?: string;
  name: string;
  type: DevProjectType;
  repository: string;
  ref?: string;
  githubConnectionId?: string;
  vercelConnectionId?: string;
  aquaTagSiteId?: string;
  actorUserId: string;
  actorEmail?: string;
}

export function listDevProjects(agencyId: string): DevProject[] {
  return Object.values(getState().devProjects)
    .filter(project => project.agencyId === agencyId)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function getDevProject(agencyId: string, projectId: string): DevProject | null {
  const project = getState().devProjects[projectId];
  return project?.agencyId === agencyId ? project : null;
}

export function saveDevProject(input: SaveDevProjectInput): DevProject {
  const existing = input.projectId ? getDevProject(input.agencyId, input.projectId) : null;
  if (input.projectId && !existing) throw new Error("dev_project_not_found");

  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error("dev_project_name_required");
  if (!DEV_PROJECT_TYPES.includes(input.type)) throw new Error("dev_project_type_invalid");

  const repository = input.repository.trim().replace(/\.git$/, "");
  if (!REPOSITORY_PATTERN.test(repository)) throw new Error("dev_project_repository_invalid");

  const ref = (input.ref ?? "").trim() || "main";

  // A connection is only bindable when it exists in THIS agency's vault and is
  // for the provider the slot means. Binding another agency's connection id —
  // or a Stripe connection where a GitHub one belongs — is refused, not stored.
  const githubConnectionId = requireConnection(input.agencyId, input.githubConnectionId, "github");
  const vercelConnectionId = requireConnection(input.agencyId, input.vercelConnectionId, "vercel");

  const aquaTagSiteId = input.aquaTagSiteId?.trim() || undefined;
  if (aquaTagSiteId) {
    const site = getState().websiteSources?.[aquaTagSiteId];
    if (site?.agencyId !== input.agencyId) throw new Error("dev_project_aqua_tag_invalid");
  }

  const now = Date.now();
  const project: DevProject = {
    id: existing?.id ?? `devproj_${crypto.randomBytes(8).toString("hex")}`,
    agencyId: input.agencyId,
    name,
    type: input.type,
    repository,
    ref,
    githubConnectionId,
    vercelConnectionId,
    aquaTagSiteId,
    createdBy: existing?.createdBy ?? input.actorUserId,
    updatedBy: input.actorUserId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  mutate(state => { state.devProjects[project.id] = project; });
  logActivity({
    agencyId: input.agencyId,
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    category: "integrations",
    action: existing ? "dev-project.updated" : "dev-project.created",
    message: `${existing ? "Updated" : "Created"} dev project “${project.name}” (${project.repository}).`,
    metadata: { projectId: project.id, repository: project.repository, type: project.type },
  });
  return project;
}

export function deleteDevProject(input: {
  agencyId: string;
  projectId: string;
  actorUserId: string;
  actorEmail?: string;
}): DevProject {
  const existing = getDevProject(input.agencyId, input.projectId);
  if (!existing) throw new Error("dev_project_not_found");
  mutate(state => { delete state.devProjects[input.projectId]; });
  logActivity({
    agencyId: input.agencyId,
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    category: "integrations",
    action: "dev-project.deleted",
    message: `Deleted dev project “${existing.name}” (${existing.repository}).`,
    metadata: { projectId: existing.id, repository: existing.repository },
  });
  return existing;
}

export interface DevProjectGitHubSource {
  repository: string;
  ref: string;
  token: string;
}

/**
 * The repository read spec for a project: repo, ref, and the token that can
 * read it.
 *
 * The project's own GitHub connection wins. Without one — or when the bound
 * connection has been revoked — the workspace ladder applies:
 * `resolveIntegrationValues` picks the workspace-level GitHub connection and
 * already falls back to the environment token FOR THE FOUNDER'S AGENCY ONLY
 * (`mayUseEnvironmentCredentials`). No ungated env rung is added here — the
 * environment token is the founder's credential, and handing it to any other
 * agency's project would serve them a repository they were never granted.
 * Returns null when nothing this agency is entitled to can read the
 * repository, and the caller says so rather than showing an empty tree.
 */
export function resolveDevProjectGitHubSource(
  agencyId: string,
  project: DevProject,
): DevProjectGitHubSource | null {
  let token = "";
  if (project.githubConnectionId && getIntegrationConnection(agencyId, project.githubConnectionId)) {
    token = resolveIntegrationConnectionValues(agencyId, project.githubConnectionId).token ?? "";
  }
  if (!token) token = resolveIntegrationValues(agencyId, "github").token ?? "";
  if (!token) return null;
  return { repository: project.repository, ref: project.ref, token };
}

export interface DevProjectVercelConfig {
  token: string;
  teamId?: string;
}

/**
 * The Vercel credentials a project deploys with — the same ladder as GitHub:
 * the project's bound Vercel connection, else the workspace ladder (which
 * env-falls-back for the founder's agency only). Null means nothing this
 * agency is entitled to can deploy, and the caller says so.
 *
 * Shaped to feed `deployProjectPreviewToVercel`'s `config` seam directly.
 */
export function resolveDevProjectVercelConfig(
  agencyId: string,
  project: DevProject,
): DevProjectVercelConfig | null {
  let values: Record<string, string> = {};
  if (project.vercelConnectionId && getIntegrationConnection(agencyId, project.vercelConnectionId)) {
    values = resolveIntegrationConnectionValues(agencyId, project.vercelConnectionId);
  }
  if (!values.token) values = resolveIntegrationValues(agencyId, "vercel");
  if (!values.token) return null;
  return { token: values.token, teamId: values.teamId || undefined };
}

function requireConnection(
  agencyId: string,
  connectionId: string | undefined,
  provider: "github" | "vercel",
): string | undefined {
  const id = connectionId?.trim();
  if (!id) return undefined;
  const connection = getIntegrationConnection(agencyId, id);
  if (!connection || connection.provider !== provider) {
    throw new Error(`dev_project_connection_invalid:${provider}`);
  }
  return id;
}
