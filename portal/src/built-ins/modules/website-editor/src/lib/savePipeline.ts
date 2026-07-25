"use client";

// Save pipeline — dispatch on the active save target (shared portal
// vs client repo). Round-6.
//
// Callers (EditorPage, ThemeDetailPage, PortalsPage, PageDetailPage)
// hand the pipeline a typed "save intent" and an active save target;
// the pipeline either:
//   - "shared-portal"  → routes to the existing lib/editorPages.ts /
//                        lib/customPages.ts / lib/theme.ts surfaces.
//   - "client-repo"    → calls into PortalExportPort. If the port
//                        returns `fallbackToFullReexport: true`, the
//                        pipeline kicks off a `materialize()` call
//                        (slow but correct — Round-7 polish).
//
// The pipeline is the only file the editor's save UI talks to. New
// save kinds get added here, not in each consumer.

import type { EditorPage, UpdatePagePatch } from "../types/editorPage";
import type { CustomPage } from "./customPages";
import type { ThemeRecord, UpdateThemePatch } from "../types/theme";
import type { PortalRole } from "./portalRole";
import {
  updatePage as updateSharedPage,
  publishPage as publishSharedPage,
  setActivePortalVariant as setSharedActivePortalVariant,
} from "./editorPages";
import { updateTheme as updateSharedTheme } from "./theme";
import { saveCustomPage as saveSharedCustomPage, type CustomPage as SharedCustomPage } from "./customPages";
import {
  getPortalExportPort,
  isClientRepoModeAvailable,
  type PortalExportPort,
  type SaveResult as PortSaveResult,
  type FilePreviewEntry,
} from "../server/extensionPorts";
import type { SaveTarget } from "./saveTarget";

export interface PipelineSaveResult {
  ok: boolean;
  target: SaveTarget;
  changedFiles?: FilePreviewEntry[];
  // True when the port asked for a full re-export and the pipeline
  // ran one. The UI surfaces this so the operator knows to expect a
  // longer turnaround on the next save until R12 incremental lands.
  fellBackToFullReexport?: boolean;
  error?: string;
}

interface BaseInput {
  target: SaveTarget;
  clientId: string;
  siteId: string;
}

export interface SavePageInput extends BaseInput {
  page: EditorPage;
  patch?: UpdatePagePatch;
}

export interface SaveThemeInput extends BaseInput {
  theme: ThemeRecord;
  patch?: UpdateThemePatch;
}

export interface SaveCustomPageInput extends BaseInput {
  page: CustomPage;
}

export interface SetActivePortalVariantInput extends BaseInput {
  role: PortalRole;
  pageId: string | null;
}

// ─── Page save ─────────────────────────────────────────────────────────────

export async function savePage(input: SavePageInput): Promise<PipelineSaveResult> {
  if (input.target === "client-repo") {
    return runClientRepo(port => port.savePage({ clientId: input.clientId, page: input.page }), input);
  }
  // Shared-portal path — apply the patch via the existing API.
  try {
    const updated = await updateSharedPage(input.siteId, input.page.id, input.patch ?? { blocks: input.page.blocks });
    return { ok: !!updated, target: "shared-portal" };
  } catch (e) {
    return { ok: false, target: "shared-portal", error: e instanceof Error ? e.message : String(e) };
  }
}

export async function publishPage(input: BaseInput & { pageId: string }): Promise<PipelineSaveResult> {
  if (input.target === "client-repo") {
    // Client-repo publish = materialize the new page state to disk.
    return runClientRepo(port => port.materialize({ clientId: input.clientId, reason: `publish page ${input.pageId}` }), input);
  }
  try {
    const r = await publishSharedPage(input.siteId, input.pageId);
    return { ok: !!r, target: "shared-portal" };
  } catch (e) {
    return { ok: false, target: "shared-portal", error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Theme save ────────────────────────────────────────────────────────────

export async function saveTheme(input: SaveThemeInput): Promise<PipelineSaveResult> {
  if (input.target === "client-repo") {
    return runClientRepo(port => port.saveTheme({ clientId: input.clientId, theme: input.theme }), input);
  }
  try {
    const updated = await updateSharedTheme(input.siteId, input.theme.id, input.patch ?? { tokens: input.theme.tokens });
    return { ok: !!updated, target: "shared-portal" };
  } catch (e) {
    return { ok: false, target: "shared-portal", error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── CustomPage save ───────────────────────────────────────────────────────

export async function saveCustomPage(input: SaveCustomPageInput): Promise<PipelineSaveResult> {
  if (input.target === "client-repo") {
    return runClientRepo(port => port.saveCustomPage({ clientId: input.clientId, page: input.page }), input);
  }
  // Shared-portal path is synchronous (localStorage).
  saveSharedCustomPage(input.page satisfies SharedCustomPage);
  return { ok: true, target: "shared-portal" };
}

// ─── Active portal variant ─────────────────────────────────────────────────

export async function setActivePortalVariant(input: SetActivePortalVariantInput): Promise<PipelineSaveResult> {
  if (input.target === "client-repo") {
    return runClientRepo(
      port => port.setActivePortalVariant({ clientId: input.clientId, role: input.role, variantId: input.pageId }),
      input,
    );
  }
  try {
    await setSharedActivePortalVariant(input.siteId, input.role, input.pageId);
    return { ok: true, target: "shared-portal" };
  } catch (e) {
    return { ok: false, target: "shared-portal", error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Diff preview ──────────────────────────────────────────────────────────

export interface PreviewChangesInput extends BaseInput {
  page?: EditorPage;
  customPage?: CustomPage;
  theme?: ThemeRecord;
  activeVariant?: { role: PortalRole; variantId: string | null };
}

export interface PreviewChangesResult {
  available: boolean;          // false when port missing or shared-portal mode
  files: FilePreviewEntry[];
  summary?: string;
  error?: string;
}

export async function previewChanges(input: PreviewChangesInput): Promise<PreviewChangesResult> {
  if (input.target !== "client-repo" || !isClientRepoModeAvailable()) {
    return { available: false, files: [] };
  }
  const port = getPortalExportPort();
  if (!port) return { available: false, files: [] };
  try {
    const r = await port.previewChanges({
      clientId: input.clientId,
      ...(input.page ? { page: input.page } : {}),
      ...(input.customPage ? { customPage: input.customPage } : {}),
      ...(input.theme ? { theme: input.theme } : {}),
      ...(input.activeVariant ? { activeVariant: input.activeVariant } : {}),
    });
    return { available: true, files: r.files, summary: r.summary };
  } catch (e) {
    return {
      available: true,
      files: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ─── Internal client-repo runner ───────────────────────────────────────────

async function runClientRepo(
  call: (port: PortalExportPort) => Promise<PortSaveResult>,
  input: BaseInput,
): Promise<PipelineSaveResult> {
  const port = getPortalExportPort();
  if (!port) {
    // Port wasn't injected — graceful degradation: silently fall
    // through to shared-portal storage so the operator never sees a
    // "save failed" error in dev mode. The topbar should already
    // have hidden the toggle when port is unavailable; this is a
    // defensive fallback.
    if (typeof console !== "undefined") {
      console.warn("[website-editor] save-target=client-repo but PortalExportPort not installed — falling through to shared-portal.");
    }
    return { ok: false, target: "shared-portal", error: "PortalExportPort not installed." };
  }
  try {
    const r = await call(port);
    if (r.fallbackToFullReexport) {
      // T2 R11 ships materialize(); R12 polish ships incremental
      // saves. Until then, full re-export is the correct (if slow)
      // path on every save in client-repo mode.
      const fallback = await port.materialize({ clientId: input.clientId, reason: "save fallback" });
      return {
        ok: fallback.ok,
        target: "client-repo",
        ...(fallback.changedFiles ? { changedFiles: fallback.changedFiles } : {}),
        fellBackToFullReexport: true,
        ...(fallback.error ? { error: fallback.error } : {}),
      };
    }
    return {
      ok: r.ok,
      target: "client-repo",
      ...(r.changedFiles ? { changedFiles: r.changedFiles } : {}),
      ...(r.error ? { error: r.error } : {}),
    };
  } catch (e) {
    return {
      ok: false,
      target: "client-repo",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
