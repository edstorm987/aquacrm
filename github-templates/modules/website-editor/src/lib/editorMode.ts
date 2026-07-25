"use client";

// Editor complexity + mode preferences. Faithful port of
// `02/src/lib/admin/editorMode.ts` — adds the COMPLEXITY_OPTIONS table
// + onEditorComplexityChange listener used by EditorPage and
// CustomisePage. The mode (live/block/code) lookup is unchanged from
// Round 1.
//
// Stored in localStorage so the choice survives reloads. Per-operator
// (not per-org).

const COMPLEXITY_KEY = "lk_editor_complexity_v1";
const COMPLEXITY_EVENT = "lk-editor-complexity-change";
const MODE_KEY = "aqua.editor.mode";

export type EditorComplexity = "simple" | "full" | "pro";
export type EditorMode = "live" | "block" | "code";

export const COMPLEXITY_OPTIONS: Array<{ id: EditorComplexity; label: string; description: string }> = [
  {
    id: "simple",
    label: "Simple",
    description: "Just the canvas. Click to edit. No outliner, no properties panel — perfect for fast copy tweaks.",
  },
  {
    id: "full",
    label: "Full",
    description: "Default. Outliner on the left, properties on the right, all three modes (Live · Block · Code).",
  },
  {
    id: "pro",
    label: "Pro",
    description: "Everything in Full, plus power-user surfaces — custom head/foot, layout overrides, theme tokens.",
  },
];

const VALID = new Set<EditorComplexity>(["simple", "full", "pro"]);

export function getEditorComplexity(): EditorComplexity {
  if (typeof window === "undefined") return "full";
  const raw = window.localStorage.getItem(COMPLEXITY_KEY);
  if (raw && VALID.has(raw as EditorComplexity)) return raw as EditorComplexity;
  return "full";
}

export function setEditorComplexity(c: EditorComplexity): void {
  if (typeof window === "undefined") return;
  if (!VALID.has(c)) return;
  window.localStorage.setItem(COMPLEXITY_KEY, c);
  window.dispatchEvent(new Event(COMPLEXITY_EVENT));
}

export function onEditorComplexityChange(handler: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const listener = () => handler();
  window.addEventListener(COMPLEXITY_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(COMPLEXITY_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

// ─── Round-1 mode helpers (kept for callers using them) ───────────────────

export function getComplexity(): EditorComplexity { return getEditorComplexity(); }
export function setComplexity(v: EditorComplexity): void { setEditorComplexity(v); }

export function getMode(): EditorMode {
  if (typeof window === "undefined") return "live";
  const v = window.localStorage.getItem(MODE_KEY);
  return v === "live" || v === "block" || v === "code" ? v : "live";
}

export function setMode(v: EditorMode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MODE_KEY, v);
}
