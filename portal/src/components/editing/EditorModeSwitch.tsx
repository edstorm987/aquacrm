"use client";

import { useEffect, useRef, useState } from "react";
import { Code2, MessageSquareText, Paintbrush } from "lucide-react";

import { EDITING_MODES, editingMode, type EditingMode } from "@/engines/editor/editing/modes";
import { cinematicModeEnabled } from "@/lib/chrome/cinematicMode";

// ─── DEV EDITOR — the mode switch, and the cutscene between modes ────────────
//
// The depth was a small select buried in the right rail, which made the single
// most important choice in the editor — how much of it you want pointed at you
// — the least visible thing on screen. It now leads the top bar.
//
// Each mode gets its OWN accent, and switching plays a short cutscene in that
// accent. That is not decoration: three modes that look identical are three
// modes you have to read to tell apart, and a flash of colour tells you where you
// landed before you have read a word. The cutscene is a compact toast, never a
// full-screen wash — see the note at its render for why the browser pane must
// not be painted over.
//
// The cutscene reuses the machinery the Dev Team / Command Centre transitions
// already established — the cinematic-mode gate and prefers-reduced-motion —
// rather than inventing a second animation system.

export interface ModeSkin {
  accent: string;
  soft: string;
  line: string;
  label: string;
  blurb: string;
  icon: typeof Code2;
}

/** One skin per depth. Ordered as the ladder is: shallowest first. */
export const MODE_SKINS: Record<EditingMode, ModeSkin> = {
  assist: {
    accent: "#a78bfa", soft: "rgba(167,139,250,0.14)", line: "rgba(167,139,250,0.42)",
    label: "Just tell it", blurb: "The page and the assistant, together.", icon: MessageSquareText,
  },
  visual: {
    accent: "#f472b6", soft: "rgba(244,114,182,0.14)", line: "rgba(244,114,182,0.42)",
    label: "Visual builder", blurb: "Build it on top of the live page.", icon: Paintbrush,
  },
  developer: {
    accent: "#34d399", soft: "rgba(52,211,153,0.14)", line: "rgba(52,211,153,0.42)",
    label: "Dev", blurb: "The code and the repository.", icon: Code2,
  },
};

export function modeSkin(mode: EditingMode): ModeSkin {
  // The `??` is the stale-value guard: a "simple" that slips past the types
  // (the depth merged into Visual, 2026-08-22) wears visual's skin rather
  // than crashing on `.accent`.
  return MODE_SKINS[mode] ?? MODE_SKINS.visual;
}

export function EditorModeSwitch({
  mode,
  onChange,
  available,
}: {
  mode: EditingMode;
  onChange: (next: EditingMode) => void;
  /**
   * Optional narrowing. Deliberately unused by the editor: it is a UNIVERSAL
   * editor, and hiding modes based on what we guess you are building is how it
   * started refusing to show a browser to somebody making a game.
   */
  available?: EditingMode[];
}) {
  const options = EDITING_MODES.filter(item => !available || available.includes(item.id));
  const [cutscene, setCutscene] = useState<EditingMode | null>(null);
  const timer = useRef<number | null>(null);
  // The mode this switch last SAW. Seeded with the mounting mode, so on
  // arrival the stored value already equals `mode`.
  const seenMode = useRef<EditingMode>(mode);

  // Play on CHANGE, never on mount — arriving is not a transition.
  //
  // The guard is a VALUE COMPARE, not a consumable "first run" boolean, because
  // React 19 Strict Mode invokes an effect TWICE on mount (run → cleanup → run).
  // A boolean is spent by invocation 1, so invocation 2 falls straight through
  // and plays a 900ms full-screen wash over the editor on every dev load — the
  // exact thing this guard exists to prevent. Comparing the stored mode against
  // the current one gives the SAME answer however many times it runs, so both
  // invocations bail on mount. Splitting the effect would not help here; only
  // idempotence does.
  useEffect(() => {
    if (seenMode.current === mode) return;
    // Record the move BEFORE the motion gate: a change made with cinematic mode
    // off still counts as seen, otherwise a later switch BACK would compare
    // against a stale mode and be silently swallowed.
    seenMode.current = mode;
    const motionOk =
      cinematicModeEnabled() &&
      !(typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (!motionOk) return;
    setCutscene(mode);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCutscene(null), 900);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [mode]);

  return (
    <>
      <div
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/12 bg-black/30 p-1"
        role="group"
        aria-label="Editor mode"
      >
        {options.map(option => {
          const skin = modeSkin(option.id);
          const Icon = skin.icon;
          const active = mode === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              aria-pressed={active}
              title={editingMode(option.id).summary}
              className="inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold transition"
              style={active
                ? { background: skin.soft, color: skin.accent, boxShadow: `inset 0 0 0 1px ${skin.line}` }
                : { color: "rgba(255,255,255,0.45)" }}
            >
              <Icon size={15} aria-hidden />
              {/* Always labelled: this is the primary control in the editor, and a
                  row of unlabelled glyphs is something you have to learn. */}
              <span>{skin.label}</span>
            </button>
          );
        })}
      </div>

      {/* The cutscene. Pointer-events off throughout, so it can never swallow
          a click even if a timer is missed.

          ── A TOAST, not a wash — the browser pane must survive it ──────────
          This used to be a full-screen `inset-0` overlay: an accent wash over
          the whole editor plus a `backdrop-blur-md` card in the middle of the
          screen — which is the middle of the LIVE PAGE. Ed's walkthrough saw
          every mode click "white-flash the iframe for seconds", and driving
          the real DevEditor in a browser showed why: the iframe itself never
          reloads on a mode click (one load event across every switch — the
          element and its document survive), but a backdrop-filter painted
          over a cross-origin iframe forces the compositor to pull the frame's
          pixels into the main page, and Chromium blanks the frame white while
          it does. So the cutscene may not SAMPLE the page, and it may not
          cover it edge to edge. It is now a compact toast under the top bar:
          opaque (nothing to blur), pointer-events off, and the page behind it
          composites exactly as it did before the click. */}
      {cutscene ? (
        <div
          aria-hidden
          className="pointer-events-none fixed left-1/2 top-24 z-[95] -translate-x-1/2"
          style={{ animation: "mm-editor-mode-fade 900ms ease-out forwards" }}
        >
          <div
            className="relative flex items-center gap-3 rounded-lg border px-5 py-3"
            style={{
              borderColor: modeSkin(cutscene).line,
              background: "#111311",
              boxShadow: `0 12px 40px rgba(0,0,0,0.45), inset 0 0 0 1px ${modeSkin(cutscene).soft}`,
              animation: "mm-editor-mode-rise 900ms cubic-bezier(0.2,0.8,0.2,1) forwards",
            }}
          >
            {(() => { const Icon = modeSkin(cutscene).icon; return <Icon size={22} style={{ color: modeSkin(cutscene).accent }} aria-hidden />; })()}
            <span>
              <span className="block text-sm font-bold text-white">{modeSkin(cutscene).label}</span>
              <span className="block text-[11px] text-white/55">{modeSkin(cutscene).blurb}</span>
            </span>
          </div>
          <style>{`
            @keyframes mm-editor-mode-fade { 0% { opacity: 0 } 18% { opacity: 1 } 70% { opacity: 1 } 100% { opacity: 0 } }
            @keyframes mm-editor-mode-rise { 0% { transform: translateY(6px) scale(0.98) } 30% { transform: none } 100% { transform: none } }
          `}</style>
        </div>
      ) : null}
    </>
  );
}
