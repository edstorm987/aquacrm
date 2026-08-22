// ─── AQUA EDITOR AI — the editor's clothes, not the dev workspace's ──────────
//
// Ed's complaint, and the reason this file exists: panels dropped into the Dev
// Editor kept arriving wearing the dev workspace's `--dt-*` tokens — light
// cards, hairlines, a different type scale — inside a dark, translucent,
// full-screen editor. Two design systems on one screen reads as a bug even when
// every pixel is deliberate.
//
// So: the editor's vocabulary, written down once.
//
//   • dark and translucent — `border-white/10`, `bg-black/30`, `bg-white/[0.05]`
//   • ONE accent, `--mode-accent`, which the editor root repaints on every mode
//     change (see `DevEditor.tsx` and `EditorModeSwitch.tsx`)
//   • NO `--dt-*` tokens. Not one. They belong to `/portal/dev-team/**`.
//
// ── Why the accent is re-declared as `--aqua-ai-accent` ──────────────────────
//
// `var(--mode-accent, #67e8f9)` inside a Tailwind arbitrary value would carry a
// comma through the class scanner. The panel root sets ONE token from it
// instead, so every class below can reference a single, comma-free name and the
// fallback still applies on a surface that is not the editor.

import type { CSSProperties } from "react";

export const ACCENT_VAR = "--aqua-ai-accent";

/** Put this on the panel root. Everything below reads from it. */
export const accentStyle = { [ACCENT_VAR]: "var(--mode-accent, #67e8f9)" } as CSSProperties;

export const ACCENT_TEXT = "text-[color:var(--aqua-ai-accent)]";
export const ACCENT_BG = "bg-[color:var(--aqua-ai-accent)]";
export const ACCENT_BORDER = "border-[color:var(--aqua-ai-accent)]";

/**
 * A visible keyboard focus state, on every interactive element.
 *
 * `outline-none` alone is how a keyboard user loses the caret entirely, so it
 * is never used here without a ring replacing it. The offset colour is the
 * editor's panel ground (`#141614`), so the ring reads as a ring rather than a
 * halo bleeding into the surface.
 */
export const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--aqua-ai-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#141614]";

/**
 * Text colours, floored at AA on the editor's panel ground.
 *
 * Measured against `#141614`, the inspector's background. White at 45% alpha
 * composites to roughly 4.4:1 — under the 4.5:1 AA threshold for normal text,
 * and these are 10–12px labels, which is normal text. So the dimmest thing in
 * this panel is 58%, not the 32–35% that appears elsewhere in the editor for
 * decorative captions:
 *
 *   white/58 ≈ 6.7:1   white/72 ≈ 9.6:1   white/85 ≈ 12.8:1
 *
 * Nothing below `MUTED` is used for a word anybody has to read.
 */
export const MUTED = "text-white/58";
export const BODY = "text-white/72";
export const STRONG = "text-white/88";

/** The panel's own ground, so a child panel matches the inspector behind it. */
export const PANEL = "rounded-lg border border-white/10 bg-black/30";
export const FIELD =
  "w-full rounded-md border border-white/12 bg-black/30 px-2.5 py-2 text-xs text-white/88 placeholder:text-white/55";

/** A small square control — icon only. `min-h`/`min-w` keeps the tap target. */
export const ICON_BUTTON =
  "grid size-8 shrink-0 place-items-center rounded-md border border-white/12 bg-white/[0.05] text-white/72 transition hover:bg-white/10 hover:text-white disabled:opacity-40";

/** A small labelled control. */
export const CHIP_BUTTON =
  "inline-flex min-h-8 items-center gap-1.5 rounded-md border border-white/12 bg-white/[0.05] px-2.5 text-[11px] font-semibold text-white/72 transition hover:bg-white/10 hover:text-white disabled:opacity-40";

/** The one filled control on a surface: send, save. Dark ink on the accent. */
export const PRIMARY_BUTTON =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md px-3 text-[11px] font-bold text-[#0d120f] transition hover:brightness-110 disabled:opacity-40";

/** Something has gone wrong, or is about to. Red on dark, still readable. */
export const DANGER_BUTTON =
  "inline-flex min-h-8 items-center gap-1.5 rounded-md border border-red-300/30 bg-red-300/[0.08] px-2.5 text-[11px] font-semibold text-red-200 transition hover:bg-red-300/15 disabled:opacity-40";
