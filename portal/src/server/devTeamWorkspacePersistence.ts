import type { DevTeamWorkspaceFile, PortalState } from "./types";

export interface DevTeamWorkspaceFileCondition {
  exists: boolean;
  sha256?: string;
}

export interface DevTeamWorkspaceFileMutation {
  relPath: string;
  /** What the caller actually read before composing the replacement. */
  expected: DevTeamWorkspaceFileCondition;
  /** The immutable deployment/file snapshot when no durable overlay exists. */
  baseline: DevTeamWorkspaceFileCondition;
  /** A tombstone is a file with `deleted: true`; rows are never physically removed. */
  file: DevTeamWorkspaceFile;
}

export class DevTeamWorkspaceConflictError extends Error {
  readonly relPath: string;

  constructor(relPath: string) {
    super(`DEV_TEAM_WORKSPACE_CONFLICT:${relPath}`);
    this.name = "DevTeamWorkspaceConflictError";
    this.relPath = relPath;
  }
}

function effectiveCondition(
  overlay: DevTeamWorkspaceFile | undefined,
  baseline: DevTeamWorkspaceFileCondition,
): DevTeamWorkspaceFileCondition {
  if (!overlay) return baseline;
  if (overlay.deleted) return { exists: false };
  return { exists: true, sha256: overlay.sha256 };
}

function sameCondition(
  left: DevTeamWorkspaceFileCondition,
  right: DevTeamWorkspaceFileCondition,
): boolean {
  if (left.exists !== right.exists) return false;
  if (!left.exists) return true;
  return Boolean(left.sha256) && left.sha256 === right.sha256;
}

function validRelPath(value: string): boolean {
  return Boolean(value)
    && !value.startsWith("/")
    && !value.includes("\\")
    && !value.split("/").some(segment => !segment || segment === "." || segment === "..");
}

/**
 * Pure implementation used by memory tests and the direct Postgres backend.
 * Validate the whole batch before changing any row: a finding→plan operation
 * either commits every document or none of them.
 */
export function applyDevTeamWorkspaceFileMutations(
  state: PortalState,
  operations: readonly DevTeamWorkspaceFileMutation[],
): void {
  const seen = new Set<string>();
  const files = state.devTeamWorkspaceFiles ?? (state.devTeamWorkspaceFiles = {});

  for (const operation of operations) {
    if (!validRelPath(operation.relPath) || operation.file.relPath !== operation.relPath) {
      throw new Error("Invalid Dev Team workspace path.");
    }
    if (seen.has(operation.relPath)) {
      throw new Error(`Duplicate Dev Team workspace operation: ${operation.relPath}`);
    }
    seen.add(operation.relPath);

    const current = effectiveCondition(files[operation.relPath], operation.baseline);
    if (!sameCondition(current, operation.expected)) {
      throw new DevTeamWorkspaceConflictError(operation.relPath);
    }
  }

  for (const operation of operations) {
    files[operation.relPath] = structuredClone(operation.file);
  }
}

