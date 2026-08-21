"use client";

import { useEffect, useRef, useState } from "react";
import { Code2, Gauge, MessageSquareText, Paintbrush, Type } from "lucide-react";

import { EDITING_MODES, editingMode, type EditingMode } from "@/engines/editor/editing/modes";
import { cinematicModeEnabled } from "@/lib/chrome/cinematicMode";

// ─── DEV EDITOR — the mode switch, and the cutscene between modes ────────────
//
// The depth was a small select buried in the right rail, which made the single
// most important choice in the editor — how much of it you want pointed at you
// — the least visible thing on screen. It now leads the top bar.
//
// Each mode gets its OWN accent, and switching plays a short cutscene in that
// accent. That is not decoration: four modes that look identical are four modes
// you have to read to tell apart, and a wash of colour tells you where you
// landed before you have read a word.
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
    label: "Just tell it", blurb: "Describe the change. It does the rest.", icon: MessageSquareText,
  },
  simple: {
    accent: "#fbbf24", soft: "rgba(251,191,36,0.14)", line: "rgba(251,191,36,0.42)",
    label: "Just the words", blurb: "Change the text. Nothing can break.", icon: Type,
  },
  visual: {
    accent: "#f472b6", soft: "rgba(244,114,182,0.14)", line: "rgba(244,114,182,0.42)",
    label: "Design it", blurb: "Move blocks, pages and brand.", icon: Paintbrush,
  },
  developer: {
    accent: "#34d399", soft: "rgba(52,211,153,0.14)", line: "rgba(52,211,153,0.42)",
    label: "Developer", blurb: "Everything, including the code.", icon: Code2,
  },
};

export function modeSkin(mode: EditingMode): ModeSkin {
  return MODE_SKINS[mode] ?? MODE_SKINS.visual;
}

export function EditorModeSwitch({
  mode,
  onChange,
  available,
}: {
  mode: EditingMode;
  onChange: (next: EditingMode) => void;
  /** Modes worth offering here — a repository has no "Design it". */
  available?: EditingMode[];
}) {
  const options = EDITING_MODES.filter(item => !available || available.includes(item.id));
  const [cutscene, setCutscene] = useState<EditingMode | null>(null);
  const timer = useRef<number | null>(null);
  const first = useRef(true);

  // Play on CHANGE, never on mount — arriving is not a transition.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
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
        className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-white/10 bg-black/25 p-1"
        role="group"
        aria-label="How deep do you want to go?"
      >
        <Gauge size={12} aria-hidden className="mx-1 shrink-0 text-white/25" />
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
              className="inline-flex min-h-8 items-center gap-1.5 rounded px-2.5 text-[11px] font-semibold transition"
              style={active
                ? { background: skin.soft, color: skin.accent, boxShadow: `inset 0 0 0 1px ${skin.line}` }
                : { color: "rgba(255,255,255,0.45)" }}
            >
              <Icon size={13} aria-hidden />
              <span className="hidden sm:inline">{skin.label}</span>
            </button>
          );
        })}
      </div>

      {/* The cutscene. Pointer-events off throughout, so it can never swallow
          a click even if a timer is missed. */}
      {cutscene ? (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[95] grid place-items-center"
          style={{ animation: "mm-editor-mode-fade 900ms ease-out forwards" }}
        >
          <div className="absolute inset-0" style={{ background: modeSkin(cutscene).soft }} />
          <div
            className="relative flex items-center gap-3 rounded-lg border px-5 py-3 backdrop-blur-md"
            style={{
              borderColor: modeSkin(cutscene).line,
              background: "rgba(10,12,10,0.72)",
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
