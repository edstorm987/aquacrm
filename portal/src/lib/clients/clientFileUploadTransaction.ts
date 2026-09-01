import {
  resolveWorkspaceUploadReplay,
  type WorkspaceUploadReplayCandidate,
  type WorkspaceUploadRecord,
} from "@/lib/portal/productWorkspaceUploadBatch";

export type ClientFileUploadDecision<T extends WorkspaceUploadRecord & { id: string }> =
  | { status: "attach"; files: T[] }
  | { status: "replay"; file: T; files: T[] }
  | { status: "conflict"; file: T; files: T[] };

/**
 * Reconcile against the collection read while the per-client transaction is
 * held. The pre-storage check is only an optimisation; this is the authority.
 */
export function reconcileClientFileUpload<T extends WorkspaceUploadRecord & { id: string }>(
  latestFiles: readonly T[],
  candidate: T,
  replayInput: WorkspaceUploadReplayCandidate,
): ClientFileUploadDecision<T> {
  const files = [...latestFiles];
  const replay = resolveWorkspaceUploadReplay(files, replayInput);
  if (replay.status === "replay") return { status: "replay", file: replay.file, files };
  if (replay.status === "conflict") return { status: "conflict", file: replay.file, files };
  return {
    status: "attach",
    // Merge by immutable row identity. Never write a request-start snapshot
    // over files that arrived while the binary provider was being awaited.
    files: [candidate, ...files.filter(file => file.id !== candidate.id)],
  };
}

/** Rollback is a fresh-state subtraction, never restoration of an old array. */
export function rollbackClientFileUpload<T extends { id: string }>(
  latestFiles: readonly T[],
  candidateId: string,
): T[] {
  return latestFiles.filter(file => file.id !== candidateId);
}
