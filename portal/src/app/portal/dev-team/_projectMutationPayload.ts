import type { DevProject, DevProjectMapStatus } from "@/server/types";

export type DevProjectMutationAction = "save" | "delete" | "map" | "connect-tag";

export interface ProjectMutationPayload {
  ok?: boolean;
  project?: DevProject;
  projects?: DevProject[];
  status?: DevProjectMapStatus;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isDevProject(value: unknown): value is DevProject {
  const project = record(value);
  return nonBlank(project?.id)
    && nonBlank(project.agencyId)
    && nonBlank(project.name)
    && typeof project.repository === "string"
    && nonBlank(project.ref);
}

function isDevProjectMapStatus(value: unknown): value is DevProjectMapStatus {
  const status = record(value);
  const tagStates = new Set([
    "none", "unchecked", "unreachable", "absent", "foreign",
    "dead-snippet", "answering", "redirected",
  ]);
  return typeof status?.repoMapped === "boolean"
    && typeof status.tagged === "boolean"
    && typeof status.tagVerified === "boolean"
    && typeof status.browserAvailable === "boolean"
    && typeof status.neverMapped === "boolean"
    && Array.isArray(status.missing)
    && status.missing.every(item => typeof item === "string")
    && typeof status.tagState === "string"
    && tagStates.has(status.tagState)
    && typeof status.tagSentence === "string";
}

export function isProjectMutationPayload(
  value: unknown,
  action: DevProjectMutationAction,
  expectedId?: string,
): value is ProjectMutationPayload {
  const payload = record(value);
  if (payload?.ok !== true) return false;

  if (action === "delete") {
    return Array.isArray(payload.projects)
      && payload.projects.every(isDevProject)
      && (!expectedId || payload.projects.every(project => project.id !== expectedId));
  }

  if (!isDevProject(payload.project)) return false;
  if (expectedId && payload.project.id !== expectedId) return false;

  return action === "save" || isDevProjectMapStatus(payload.status);
}
