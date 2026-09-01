export interface ClientFileDeleteRecord {
  id: string;
  deleteState?: "deleting" | "delete-failed";
  deleteError?: string;
  deleteStartedAt?: number;
  deleteFailedAt?: number;
}

/**
 * Build the durable delete-intent view from the freshest file collection.
 * Callers must re-read the owning client immediately before using this helper;
 * it deliberately changes only the target row so unrelated concurrent work is
 * preserved.
 */
export function beginClientFileDeletion<T extends ClientFileDeleteRecord>(
  files: readonly T[],
  fileId: string,
  now = Date.now(),
): T[] {
  return files.map(file => file.id === fileId
    ? {
        ...file,
        deleteState: "deleting" as const,
        deleteStartedAt: now,
        deleteError: undefined,
        deleteFailedAt: undefined,
      }
    : file);
}

/** Keep the provider refusal and retry handle without reverting other writes. */
export function failClientFileDeletion<T extends ClientFileDeleteRecord>(
  files: readonly T[],
  fileId: string,
  error: string | undefined,
  now = Date.now(),
): T[] {
  return files.map(file => file.id === fileId
    ? {
        ...file,
        deleteState: "delete-failed" as const,
        deleteError: error,
        deleteFailedAt: now,
      }
    : file);
}

/** Remove only the converged row from a freshly-read collection. */
export function finishClientFileDeletion<T extends ClientFileDeleteRecord>(
  files: readonly T[],
  fileId: string,
): T[] {
  return files.filter(file => file.id !== fileId);
}
