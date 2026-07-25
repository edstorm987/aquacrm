// Round-6 optional ports the editor accepts via container builder.
//
// Both ports are **optional**: when undefined, the editor's save UI
// gracefully degrades (toggle hidden, saves fall back to shared
// portal storage). T1's foundation broker resolves them when:
//   - PortalExportPort: T2 R11 `@aqua/plugin-portal-export` is
//                       installed for the agency.
//   - GitOpsPort:       T6's deployment work ships a candidate impl.
//
// The shapes here are the contract this plugin commits to. Other
// plugins implement them; the foundation injects them.

import type { AgencyId, ClientId } from "../lib/tenancy";
import type { Block } from "../types/block";
import type { EditorPage } from "../types/editorPage";
import type { CustomPage } from "../lib/customPages";
import type { ThemeRecord } from "../types/theme";

// ─── PortalExportPort (T2 R11) ─────────────────────────────────────────────
//
// Per-client save API. T2's portal-export plugin owns the actual file
// IO — this port is the small client-side surface the editor calls.
//
// `slugForClient(clientId)` lets the editor map a clientId → folder
// slug under `clients/<slug>/` without re-reading the foundation
// tenant store.
//
// `clientRepoExists(clientId)` is what the topbar consults to decide
// whether "client-repo" mode is even available — `true` means the
// initial materialize has already been done at least once.
//
// `savePage / saveCustomPage / saveTheme / setActivePortalVariant`
// are incremental writes. T2 R11 may only expose initial materialize;
// the editor's pipeline falls back to a full re-export when these
// return `{ ok: false, fallbackToFullReexport: true }`.
//
// `previewChanges` returns the file-list (and optional unified diff)
// of what would change in `clients/<slug>/` if the supplied save
// happened. The editor renders the file list inline; clicking an
// entry in the GitStatusPage opens the diff.

export interface FilePreviewEntry {
  path: string;            // relative to clients/<slug>/
  kind: "added" | "modified" | "deleted";
  diff?: string;           // unified diff if the port can produce one
  byteCount?: number;
}

export interface SaveResult {
  ok: boolean;
  // When true the editor should run a full materialize() to flush
  // the current state. Used as a fallback when an incremental API is
  // missing.
  fallbackToFullReexport?: boolean;
  changedFiles?: FilePreviewEntry[];
  error?: string;
}

export interface PreviewResult {
  files: FilePreviewEntry[];
  // Aggregate summary line ("3 files changed").
  summary?: string;
}

export interface PortalExportPort {
  // Identity
  slugForClient(clientId: ClientId): Promise<string | null>;
  clientRepoExists(clientId: ClientId): Promise<boolean>;

  // Incremental writes (R11 may only expose `materialize` + return
  // `fallbackToFullReexport: true` from these).
  savePage(input: { clientId: ClientId; page: EditorPage }): Promise<SaveResult>;
  saveCustomPage(input: { clientId: ClientId; page: CustomPage }): Promise<SaveResult>;
  saveTheme(input: { clientId: ClientId; theme: ThemeRecord }): Promise<SaveResult>;
  setActivePortalVariant(input: { clientId: ClientId; role: string; variantId: string | null }): Promise<SaveResult>;

  // Diff preview before save.
  previewChanges(input: {
    clientId: ClientId;
    page?: EditorPage;
    customPage?: CustomPage;
    theme?: ThemeRecord;
    activeVariant?: { role: string; variantId: string | null };
    blocks?: Block[];           // arbitrary block-tree edit
  }): Promise<PreviewResult>;

  // Full re-export (fallback when incremental save isn't available).
  // T2 R11 always exposes this; R12 polish lands the incremental APIs.
  materialize(input: { clientId: ClientId; reason?: string }): Promise<SaveResult>;
}

// ─── GitOpsPort (T6 R1) ────────────────────────────────────────────────────
//
// Per-client repo git surface. Drives the GitStatusPage admin
// surface. Implementations run git commands via foundation's
// ProcessPort or a JS git library — the editor doesn't care.

export interface GitFileStatus {
  path: string;
  status: "added" | "modified" | "deleted" | "untracked" | "renamed";
  staged: boolean;
}

export interface GitStatus {
  branch: string;
  ahead: number;       // commits ahead of upstream
  behind: number;      // commits behind upstream
  files: GitFileStatus[];
  hasRemote: boolean;
}

export interface GitCommitResult {
  ok: boolean;
  sha?: string;
  error?: string;
}

export interface GitPushResult {
  ok: boolean;
  remoteBranch?: string;
  error?: string;
}

export interface GitOpsPort {
  status(input: { clientId: ClientId; agencyId: AgencyId }): Promise<GitStatus>;
  stage(input: { clientId: ClientId; files: string[] }): Promise<{ ok: boolean }>;
  unstage(input: { clientId: ClientId; files: string[] }): Promise<{ ok: boolean }>;
  commit(input: { clientId: ClientId; message: string; author?: string }): Promise<GitCommitResult>;
  push(input: { clientId: ClientId; branch?: string }): Promise<GitPushResult>;
  // Open a GitHub PR for the current branch. Lifts the existing
  // promote.ts flow's GitHub-app-token integration when available.
  openPullRequest(input: { clientId: ClientId; title: string; body?: string }): Promise<{ ok: boolean; url?: string; error?: string }>;
}

// ─── Container injection point ─────────────────────────────────────────────
//
// The editor's container builder accepts both ports as optional. The
// foundation calls `setPortalExportPort` / `setGitOpsPort` once at
// boot when the implementing plugins are present.

let portalExportPort: PortalExportPort | null = null;
let gitOpsPort: GitOpsPort | null = null;

export function setPortalExportPort(impl: PortalExportPort | null): void {
  portalExportPort = impl;
}

export function setGitOpsPort(impl: GitOpsPort | null): void {
  gitOpsPort = impl;
}

export function getPortalExportPort(): PortalExportPort | null {
  return portalExportPort;
}

export function getGitOpsPort(): GitOpsPort | null {
  return gitOpsPort;
}

// Convenience for the topbar's availability check — the toggle
// hides when this returns false.
export function isClientRepoModeAvailable(): boolean {
  return portalExportPort !== null;
}
