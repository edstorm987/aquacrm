"use client";

// Save-target switch — Round-6 wires the editor's Save button to
// either:
//   - "shared-portal"  → existing flow via lib/editorPages.ts +
//                        lib/customPages.ts (writes to plugin storage,
//                        same multi-tenant app)
//   - "client-repo"    → calls into PortalExportPort to write into
//                        clients/<slug>/ for the client's per-deployment
//                        repo. Available only for Live clients whose
//                        portal has been materialized at least once.
//
// The default mode per phase is computed by `defaultSaveTargetForClient`:
//   - phase === "live"  AND  clients/<slug>/ exists  → "client-repo"
//   - everything else                                 → "shared-portal"
//
// When PortalExportPort isn't installed (T2 R11 not yet shipped), the
// toggle is hidden and every save falls through to shared-portal.
//
// The current selection is broadcast across the editor via storage
// event so the topbar indicator and the save pipeline stay in sync.

export type SaveTarget = "shared-portal" | "client-repo";

const STORAGE_KEY = "lk_editor_save_target_v1";
const EVENT = "lk-save-target-change";

// ─── Local cursor (per-browser, per-client) ────────────────────────────────

function key(clientId: string): string {
  return `${STORAGE_KEY}|${clientId || "_default"}`;
}

export function getSaveTarget(clientId: string): SaveTarget {
  if (typeof window === "undefined") return "shared-portal";
  try {
    const v = window.localStorage.getItem(key(clientId));
    return v === "client-repo" ? "client-repo" : "shared-portal";
  } catch { return "shared-portal"; }
}

export function setSaveTarget(clientId: string, target: SaveTarget): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key(clientId), target); } catch { /* sealed-off */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { clientId, target } }));
}

export function onSaveTargetChange(handler: (e: { clientId: string; target: SaveTarget }) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (e: Event) => {
    const detail = (e as CustomEvent).detail as { clientId?: string; target?: SaveTarget } | undefined;
    if (!detail?.target) return;
    handler({ clientId: detail.clientId ?? "", target: detail.target });
  };
  window.addEventListener(EVENT, listener as EventListener);
  return () => window.removeEventListener(EVENT, listener as EventListener);
}

// ─── Default-per-phase resolver ────────────────────────────────────────────

export interface ResolveDefaultInput {
  clientId: string;
  phase?: string | null;
  clientRepoExists?: boolean;
  portalExportAvailable?: boolean;
}

// Pure resolver — no side effects. Called by the editor topbar on
// first paint (and after the operator switches client) to decide what
// the toggle should default to.
export function defaultSaveTargetForClient(input: ResolveDefaultInput): SaveTarget {
  if (!input.portalExportAvailable) return "shared-portal";
  if (input.phase !== "live") return "shared-portal";
  if (!input.clientRepoExists) return "shared-portal";
  return "client-repo";
}

// Compute the *active* save target by combining the operator's
// localStorage choice with the default rules. If the operator has no
// saved choice yet, return the default.
export function resolveSaveTarget(input: ResolveDefaultInput): SaveTarget {
  if (typeof window === "undefined") return defaultSaveTargetForClient(input);
  if (!input.portalExportAvailable) return "shared-portal";
  // Operator choice wins when one exists; otherwise fall back to the
  // phase-derived default.
  const stored = window.localStorage.getItem(key(input.clientId));
  if (stored === "client-repo") return "client-repo";
  if (stored === "shared-portal") return "shared-portal";
  return defaultSaveTargetForClient(input);
}
