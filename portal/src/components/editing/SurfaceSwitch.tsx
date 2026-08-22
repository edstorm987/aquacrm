"use client";

import { Globe2, SquareDashedBottomCode } from "lucide-react";

import { EDITOR_SURFACES, type EditorSurface, type ResolvedSurface } from "@/engines/editor/editing/surfaces";

// ─── DEV EDITOR — the third switcher ─────────────────────────────────────────
//
// Ed: *"i suppose 2 of them in total projects selector and the navigation
// selector"*, then *"maybe its worth having a 3rd switcher to switch what it
// is"*. This is the third. The first says WHICH PROJECT, the second says WHICH
// PAGE, and this one says WHAT THIS IS — Website or Normal.
//
// It is a two-button group rather than a select, on purpose: with exactly two
// options a select hides one of them behind a click, and this choice changes
// what the editor OFFERS (the SEO panel appears or does not). A control whose
// effect is a whole panel should show both of its states at rest.
//
// The line underneath is the same discipline the navigator's is: it says WHY
// the editor thinks what it thinks — "an Aqua Tag is answering on beast-marks
// .vercel.app" — and when the operator has overridden the evidence it says
// both halves. A default with no stated reason is indistinguishable from a
// guess, and this one IS a guess until it says what it is guessing from.

const SURFACE_ICONS: Record<EditorSurface, typeof Globe2> = {
  website: Globe2,
  normal: SquareDashedBottomCode,
};

export function SurfaceSwitch({
  resolved,
  onChange,
  disabled,
}: {
  /** `resolveSurface(...)` — the surface in force, plus the sentence for it. */
  resolved: ResolvedSurface;
  onChange: (next: EditorSurface) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 sm:shrink-0">
      <div
        className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-white/10 bg-black/25 p-1"
        role="group"
        aria-label="Editor surface"
      >
        {EDITOR_SURFACES.map(surface => {
          const Icon = SURFACE_ICONS[surface.id];
          const active = resolved.surface === surface.id;
          return (
            <button
              key={surface.id}
              type="button"
              onClick={() => onChange(surface.id)}
              aria-pressed={active}
              disabled={disabled}
              title={surface.summary}
              className={`inline-flex min-h-8 items-center gap-1.5 rounded px-2.5 text-[11px] font-semibold transition disabled:opacity-40 ${
                active ? "text-white" : "text-white/40 enabled:hover:text-white/75"
              }`}
              style={active ? { background: "var(--mode-soft)", boxShadow: "inset 0 0 0 1px var(--mode-line)" } : undefined}
            >
              <Icon size={14} aria-hidden />
              <span>{surface.label}</span>
            </button>
          );
        })}
      </div>
      {/* WHY. Truncated in the toolbar, whole in the title, never dropped. */}
      <p className="truncate text-[10px] leading-tight text-white/40" title={resolved.sentence}>
        {resolved.sentence}
      </p>
    </div>
  );
}
