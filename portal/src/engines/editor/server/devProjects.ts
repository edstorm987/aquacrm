import "server-only";

import crypto from "node:crypto";

import { logActivity } from "@/server/activity";
import { getState, mutate } from "@/server/storage";
import type { DevProject, DevProjectKind } from "@/server/types";
import { getIntegrationConnection, resolveIntegrationConnectionValues } from "@/lib/server/integrations/integrationConnections";

// ─── Dev Editor Engine — projects ────────────────────────────────────────────
//
// The binding that unifies the engine. Everything a project points at already
// existed — the repo/branch were typed ad-hoc into the code workspace, GitHub
// and Vercel credentials lived in `integrationConnections` (resolved per-agency,
// never per-project), and the Aqua Tag was mapped elsewhere. A DevProject ties
// one project's pieces together so the engine can host MANY projects, each with
// its own repo and its own token.
//
// Secrets never live here: a project stores CONNECTION IDS, and the token is
// resolved at call time from the encrypted vault, so credentials keep exactly
// one home.

const VALID_KINDS = new Set<DevProjectKind>(["software", "website", "portal"]);

function clean(value: string | undefined, max: number): string {
  return (value ?? "").trim().slice(0, max);
}

/** "owner/repository" or blank (blank = read the local working tree). */
export function normalizeRepository(value: string | undefined): string {
  const repository = clean(value, 200).replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "");
  if (!repository) return "";
  // Keep only owner/name — a deeper path is not a repository.
  const parts = repository.split("/").filter(Boolean);
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : "";
}

export function listDevProjects(agencyId: string): DevProject[] {
  return Object.values(getState().devProjects)
    .filter(project => project.agencyId === agencyId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getDevProject(agencyId: string, id: string): DevProject | null {
  const project = getState().devProjects[id];
  return project?.agencyId === agencyId ? project : null;
}

/** Projects for one client workspace — what Dev Mode injection reads. */
export function listDevProjectsForClient(agencyId: string, clientId: string): DevProject[] {
  return listDevProjects(agencyId).filter(project => project.clientId === clientId);
}

export interface SaveDevProjectInput {
  agencyId: string;
  id?: string;
  name: string;
  kind?: DevProjectKind;
  repository?: string;
  ref?: string;
  githubConnectionId?: string;
  vercelConnectionId?: string;
  aquaTagId?: string;
  clientId?: string;
  actorUserId: string;
  now?: number;
}

/**
 * Create or update a project.
 *
 * A referenced connection must exist AND belong to this agency — otherwise a
 * project could name another tenant's connection id and resolve their token.
 */
export function saveDevProject(input: SaveDevProjectInput): DevProject {
  const name = clean(input.name, 120);
  if (!name) throw new Error("Project name required.");

  const kind: DevProjectKind = input.kind && VALID_KINDS.has(input.kind) ? input.kind : "software";
  const now = input.now ?? Date.now();
  const existing = input.id ? getDevProject(input.agencyId, input.id) : null;
  if (input.id && !existing) throw new Error("project_not_found");

  const githubConnectionId = assertConnection(input.agencyId, input.githubConnectionId, "github");
  const vercelConnectionId = assertConnection(input.agencyId, input.vercelConnectionId, "vercel");

  const project: DevProject = {
    id: existing?.id ?? `devproj_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
    agencyId: input.agencyId,
    name,
    kind,
    repository: normalizeRepository(input.repository),
    ref: clean(input.ref, 120) || "main",
    githubConnectionId,
    vercelConnectionId,
    aquaTagId: clean(input.aquaTagId, 120) || undefined,
    clientId: clean(input.clientId, 120) || undefined,
    createdBy: existing?.createdBy ?? input.actorUserId,
    updatedBy: input.actorUserId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  mutate(state => { state.devProjects[project.id] = project; });
  logActivity({
    agencyId: input.agencyId,
    actorUserId: input.actorUserId,
    category: "settings",
    action: existing ? "dev_project.updated" : "dev_project.created",
    message: `${existing ? "Updated" : "Created"} dev project ${project.name}.`,
  });
  return project;
}

function assertConnection(agencyId: string, connectionId: string | undefined, provider: "github" | "vercel"): string | undefined {
  const id = clean(connectionId, 120);
  if (!id) return undefined;
  const connection = getIntegrationConnection(agencyId, id);
  // Tenant check first: a wrong-agency id must never resolve a token.
  if (!connection) throw new Error("integration_not_found");
  if (connection.provider !== provider) throw new Error(`connection_provider_mismatch:${provider}`);
  return id;
}

export function deleteDevProject(agencyId: string, id: string, actorUserId: string): DevProject | null {
  const project = getDevProject(agencyId, id);
  if (!project) return null;
  mutate(state => { delete state.devProjects[id]; });
  logActivity({
    agencyId,
    actorUserId,
    category: "settings",
    action: "dev_project.deleted",
    message: `Deleted dev project ${project.name}.`,
  });
  return project;
}

/**
 * The GitHub token for a project, or null when it has no connection bound.
 *
 * Resolved from the vault at call time — the project only ever holds an id.
 * Callers fall back to their existing agency-wide / environment resolution so
 * behaviour is unchanged for projects (and callers) with nothing bound.
 */
export function devProjectGitHubToken(agencyId: string, project: DevProject): string | null {
  if (!project.githubConnectionId) return null;
  try {
    const values = resolveIntegrationConnectionValues(agencyId, project.githubConnectionId);
    return values.token || null;
  } catch {
    return null;
  }
}

/** True when a project has an Aqua Tag mapped — what unlocks the visual editor. */
export function devProjectVisualEditorUnlocked(project: DevProject): boolean {
  return Boolean(project.aquaTagId) && project.kind !== "software";
}
