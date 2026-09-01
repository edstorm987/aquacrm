/**
 * Batch upload accounting for a product-workspace collection.
 *
 * The batch used to silently `slice(0, 30)` the selection, report the FULL
 * selection count as added, and throw away every per-file success when a later
 * file failed — so a retry re-uploaded the files that had already landed. This
 * module owns the counting and the partial-progress bookkeeping so the surface
 * can only report what actually happened.
 */

/** Files accepted per submission. Anything beyond it is declined out loud. */
export const WORKSPACE_UPLOAD_BATCH_LIMIT = 30;

export interface WorkspaceUploadCandidate {
  name: string;
  size: number;
  lastModified?: number;
}

/**
 * Stable-enough identity for "this exact file, already uploaded in this
 * session". Used so a retry after a mid-batch failure resumes rather than
 * duplicating the files that already converged.
 */
export function workspaceUploadFileKey(file: WorkspaceUploadCandidate): string {
  return `${file.name.trim().slice(0, 180)}:${file.size}:${file.lastModified ?? 0}`;
}

export interface WorkspaceUploadRecord {
  id: string;
  name: string;
  size?: number;
  contentType?: string;
  /** Server-computed digest; browser metadata alone is never replay proof. */
  contentSha256?: string;
  productId?: string;
  workspacePageId?: string;
  collectionId?: string;
  uploadKey?: string;
  workspaceAttachmentState?: "pending" | "attached";
}

export interface WorkspaceUploadReplayCandidate {
  name: string;
  size: number;
  contentType: string;
  contentSha256?: string;
  productId?: string;
  workspacePageId?: string;
  collectionId?: string;
  uploadKey?: string;
}

export type WorkspaceUploadReplay<TRecord extends WorkspaceUploadRecord> =
  | { status: "new" }
  | { status: "replay"; file: TRecord }
  | { status: "conflict"; file: TRecord };

/**
 * Resolve a retried upload against durable client-file records. The key is
 * scoped to the exact workspace collection, and the visible file identity is
 * rechecked so a forged/colliding key cannot silently substitute a different
 * binary.
 */
export function resolveWorkspaceUploadReplay<TRecord extends WorkspaceUploadRecord>(
  files: readonly TRecord[],
  candidate: WorkspaceUploadReplayCandidate,
): WorkspaceUploadReplay<TRecord> {
  const uploadKey = candidate.uploadKey?.trim();
  if (!uploadKey) return { status: "new" };
  const sameScope = files.find(file =>
    file.uploadKey === uploadKey
    && (file.productId ?? "") === (candidate.productId ?? "")
    && (file.workspacePageId ?? "") === (candidate.workspacePageId ?? "")
    && (file.collectionId ?? "") === (candidate.collectionId ?? ""));
  if (!sameScope) return { status: "new" };
  if (
    sameScope.name !== candidate.name
    || sameScope.size !== candidate.size
    || (sameScope.contentType ?? "") !== candidate.contentType
    || !candidate.contentSha256
    || !sameScope.contentSha256
    || sameScope.contentSha256 !== candidate.contentSha256
  ) return { status: "conflict", file: sameScope };
  return { status: "replay", file: sameScope };
}

/**
 * Rebuild retry progress after a reload. New records carry an explicit
 * attachment state; legacy rows are accepted only when the workspace itself
 * contains their file id, which is the durable proof that both halves landed.
 */
export function workspaceUploadCompletedKeys(
  files: readonly WorkspaceUploadRecord[],
  collectionId: string,
  attachedFileIds: ReadonlySet<string>,
): Set<string> {
  return new Set(files.flatMap(file => {
    if (!file.uploadKey || file.collectionId !== collectionId) return [];
    const attached = file.workspaceAttachmentState === "attached" || attachedFileIds.has(file.id);
    return attached ? [file.uploadKey] : [];
  }));
}

export interface WorkspaceUploadBatchTransport<TFile, TWorkspace> {
  /** Store the binary and create its owning file record. Throws on failure. */
  upload(file: File): Promise<TFile>;
  /** Attach the stored file to the collection. Throws on failure. */
  attach(uploaded: TFile, workspace: TWorkspace): Promise<TWorkspace>;
  /**
   * Called after a file has BOTH uploaded and attached, before the next file is
   * started, so partial progress survives a later failure.
   */
  onFileCommitted?(uploaded: TFile, workspace: TWorkspace, key: string): void;
}

export interface WorkspaceUploadBatchOutcome<TFile, TWorkspace> {
  limit: number;
  /** Everything the person chose. */
  selected: number;
  /** Chosen but beyond the per-submission cap — never silently dropped. */
  declined: number;
  /** Already completed by an earlier attempt at this collection. */
  skipped: number;
  /** Files this run actually tried. */
  attempted: number;
  /** Files that uploaded AND attached, newest first. */
  completed: TFile[];
  /** The file the run stopped on, when it stopped. */
  failedFile?: string;
  error?: string;
  workspace: TWorkspace;
}

export async function runWorkspaceUploadBatch<TFile, TWorkspace>(
  selection: readonly File[],
  workspace: TWorkspace,
  transport: WorkspaceUploadBatchTransport<TFile, TWorkspace>,
  options: { limit?: number; alreadyCompleted?: ReadonlySet<string> } = {},
): Promise<WorkspaceUploadBatchOutcome<TFile, TWorkspace>> {
  const limit = options.limit ?? WORKSPACE_UPLOAD_BATCH_LIMIT;
  const alreadyCompleted = new Set(options.alreadyCompleted ?? []);
  // A completed file does not consume a slot on a retry. This matters after a
  // reload: 20 files may already have converged, and the next submission must
  // still be able to process 30 outstanding files rather than only the first
  // ten that happen to follow them in the original selection.
  const outstanding = selection.filter(file => !alreadyCompleted.has(workspaceUploadFileKey(file)));
  const accepted = outstanding.slice(0, limit);
  const outcome: WorkspaceUploadBatchOutcome<TFile, TWorkspace> = {
    limit,
    selected: selection.length,
    declined: Math.max(0, outstanding.length - accepted.length),
    skipped: selection.length - outstanding.length,
    attempted: 0,
    completed: [],
    workspace,
  };

  for (const file of accepted) {
    const key = workspaceUploadFileKey(file);
    if (alreadyCompleted.has(key)) {
      outcome.skipped += 1;
      continue;
    }
    outcome.attempted += 1;
    try {
      const uploaded = await transport.upload(file);
      outcome.workspace = await transport.attach(uploaded, outcome.workspace);
      outcome.completed.unshift(uploaded);
      alreadyCompleted.add(key);
      transport.onFileCommitted?.(uploaded, outcome.workspace, key);
    } catch (error) {
      outcome.failedFile = file.name;
      outcome.error = error instanceof Error ? error.message : `Could not add ${file.name}.`;
      return outcome;
    }
  }
  return outcome;
}

/**
 * One sentence stating exactly what happened. It never claims a file was added
 * that was not, and it never leaves a declined or skipped file unmentioned.
 */
export function workspaceUploadBatchNotice(
  outcome: WorkspaceUploadBatchOutcome<unknown, unknown>,
  collectionTitle: string,
): string {
  const added = outcome.completed.length;
  const parts: string[] = [];
  parts.push(added === 0
    ? `No files were added to ${collectionTitle}.`
    : `${added} ${added === 1 ? "file" : "files"} added to ${collectionTitle}.`);
  if (outcome.skipped > 0) {
    parts.push(`${outcome.skipped} already uploaded ${outcome.skipped === 1 ? "was" : "were"} skipped.`);
  }
  if (outcome.declined > 0) {
    parts.push(`${outcome.declined} not sent — ${outcome.limit} files per upload is the limit, so add the rest in another batch.`);
  }
  if (outcome.error) {
    // No promise about a future attempt: the resume set lives with the caller,
    // so this can only state what already landed, never guarantee that a later
    // retry will skip it.
    parts.push(`Stopped at ${outcome.failedFile ?? "a file"}: ${outcome.error} The files counted above were kept — re-select the remaining ones to carry on.`);
  }
  return parts.join(" ");
}
