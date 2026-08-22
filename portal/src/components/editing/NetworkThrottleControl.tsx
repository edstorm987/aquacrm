"use client";

import { useEffect, useRef, useState } from "react";
import { Wifi, WifiOff, X } from "lucide-react";

import {
  aquaTagThrottle,
  parseAquaTagThrottleProfile,
  type AquaTagThrottleProfile,
} from "@/engines/editor/editing/aquaTagBridge";

// ─── DEV EDITOR — network throttling, honestly ───────────────────────────────
//
// Ed: "in the dev editor have a wifi sign icon with a modal so i can simulate
// throttling".
//
// The one constraint that shaped everything here: a parent page CANNOT
// throttle a cross-origin iframe's document, stylesheet or image loads — only
// DevTools can. What IS real: the Aqua Tag runs INSIDE the page, so it wraps
// window.fetch and XMLHttpRequest and applies genuine latency, bandwidth
// pacing and offline failure to everything the page's own scripts request.
// So that is exactly what this control offers, and exactly what its panel
// says. Nothing here fakes a slow page load with CSS or delayed iframes, and
// nothing ever should.
//
// Two rules keep the icon honest:
//   • `active` is what the TAG confirmed via `throttle-applied` — the icon
//     turns amber on the page's answer, never on our own request.
//   • A request nobody answers times out into words ("no answer — the tag on
//     this page may be an older cached build") instead of hanging on hope.
//     The tag is served with stale-while-revalidate, so pre-throttle builds
//     really are out there.
//
// Wired like its cluster siblings: DevEditor passes its existing `sendToTag`,
// keeps the confirmed profile in state from the message handler, and remembers
// the wanted profile so a reload can re-apply it (the wrap dies with the
// page). This component owns only the chrome and the sending.

/** One named speed. The numbers follow the DevTools presets people already know. */
export interface ThrottlePreset {
  id: string;
  label: string;
  hint: string;
  profile: AquaTagThrottleProfile;
}

export const THROTTLE_PRESETS: ThrottlePreset[] = [
  {
    id: "offline",
    label: "Offline",
    hint: "Script requests fail like a dead network",
    profile: { latencyMs: 0, downKbps: 0, offline: true },
  },
  {
    id: "slow-3g",
    label: "Slow 3G",
    hint: "2000 ms latency · 400 kbps",
    profile: { latencyMs: 2000, downKbps: 400, offline: false },
  },
  {
    id: "fast-3g",
    label: "Fast 3G",
    hint: "560 ms latency · 1500 kbps",
    profile: { latencyMs: 560, downKbps: 1500, offline: false },
  },
  {
    id: "4g",
    label: "4G",
    hint: "170 ms latency · 9000 kbps",
    profile: { latencyMs: 170, downKbps: 9000, offline: false },
  },
];

/**
 * The scope, said plainly. Shown in the panel every time it opens — this is
 * the sentence that keeps the whole feature honest, so it is exported and
 * pinned by test rather than living as an editable string in JSX.
 */
export const THROTTLE_SCOPE_NOTE =
  "Throttles what this page's scripts request — fetch and XHR get real latency, paced responses and offline failures. " +
  "The page load itself (document, stylesheets, images) still arrives at full speed; only browser DevTools can slow those.";

/** "Slow 3G" when the numbers match a preset, otherwise the numbers themselves. */
export function throttleProfileLabel(profile: AquaTagThrottleProfile | null): string {
  if (!profile) return "Full speed";
  const preset = THROTTLE_PRESETS.find(
    item =>
      item.profile.latencyMs === profile.latencyMs &&
      item.profile.downKbps === profile.downKbps &&
      item.profile.offline === profile.offline,
  );
  if (preset) return preset.label;
  if (profile.offline) return "Offline";
  return `Custom · ${profile.latencyMs} ms · ${profile.downKbps || "any"} kbps`;
}

const sameProfile = (a: AquaTagThrottleProfile | null, b: AquaTagThrottleProfile | null) =>
  (a === null && b === null) ||
  (a !== null && b !== null && a.latencyMs === b.latencyMs && a.downKbps === b.downKbps && a.offline === b.offline);

/** How long a throttle request waits for the page's answer before saying so. */
const CONFIRM_TIMEOUT_MS = 2_500;

export function NetworkThrottleControl({
  send,
  active,
  onChange,
}: {
  /** DevEditor's `sendToTag`: posts one message to the tagged page, or returns false. */
  send: (payload: object) => boolean;
  /** The profile the TAG confirmed is in force (from `throttle-applied`) — never our own assumption. */
  active: AquaTagThrottleProfile | null;
  /** Records what the operator wants, so DevEditor can re-apply it when a reload starts the page unwrapped. */
  onChange: (wanted: AquaTagThrottleProfile | null) => void;
}) {
  const [open, setOpen] = useState(false);
  /** The last profile asked for and not yet confirmed — null when nothing is in flight. */
  const [requested, setRequested] = useState<AquaTagThrottleProfile | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState<"send" | "silence" | null>(null);
  const [customLatency, setCustomLatency] = useState("500");
  const [customKbps, setCustomKbps] = useState("1000");
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const confirmTimer = useRef<number | null>(null);
  // Mirrors `waiting` for the timeout callback — a timer firing after the page
  // already answered must be a no-op, and reading state there would be stale.
  const waitingRef = useRef(false);

  // The page answered. Whatever it said IS the state now — stop waiting.
  useEffect(() => {
    if (!waiting) return;
    if (!sameProfile(active, requested)) return;
    waitingRef.current = false;
    setWaiting(false);
    setFailed(null);
    if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
  }, [active, requested, waiting]);

  useEffect(() => () => { if (confirmTimer.current) window.clearTimeout(confirmTimer.current); }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  function apply(profile: AquaTagThrottleProfile | null) {
    onChange(profile);
    setRequested(profile);
    const posted = send(aquaTagThrottle(profile));
    if (!posted) { waitingRef.current = false; setWaiting(false); setFailed("send"); return; }
    waitingRef.current = true;
    setWaiting(true);
    setFailed(null);
    if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
    confirmTimer.current = window.setTimeout(() => {
      // Only a still-unanswered request becomes a failure — the effect above
      // already dropped the flag if the page confirmed in time.
      if (!waitingRef.current) return;
      waitingRef.current = false;
      setWaiting(false);
      setFailed("silence");
    }, CONFIRM_TIMEOUT_MS);
  }

  function applyCustom() {
    const profile = parseAquaTagThrottleProfile({
      latencyMs: Math.max(0, Number(customLatency) || 0),
      downKbps: Math.max(0, Number(customKbps) || 0),
      offline: false,
    });
    // All-zeroes is not a throttle; the tag would clear, so say that by doing it.
    apply(profile && (profile.latencyMs > 0 || profile.downKbps > 0) ? profile : null);
  }

  const throttled = active !== null;
  const Icon = active?.offline ? WifiOff : Wifi;
  const stateLabel = throttled ? `Network throttling — ${throttleProfileLabel(active)} in force` : "Network throttling";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={stateLabel}
        title={stateLabel}
        className={`grid size-8 place-items-center rounded outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 ${
          throttled
            ? "bg-amber-400/15 text-amber-300 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.4)]"
            : "text-white/40 hover:text-white/75"
        }`}
      >
        <Icon size={15} aria-hidden />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Network throttling"
          className="absolute right-0 top-full z-[90] mt-1.5 w-72 overflow-hidden rounded-lg border border-white/12 bg-[#171a17] shadow-2xl shadow-black/50"
        >
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-white/80">Network throttling</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="grid size-5 place-items-center rounded text-white/35 outline-none hover:bg-white/10 hover:text-white/80 focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <X size={11} aria-hidden />
            </button>
          </div>

          {/* The honest scope — always visible, never behind a tooltip. */}
          <p className="border-b border-white/10 px-3 py-2 text-[10.5px] leading-relaxed text-white/45">
            {THROTTLE_SCOPE_NOTE}
          </p>

          <p role="status" aria-live="polite" className="px-3 pt-2 text-[10.5px] font-medium">
            {failed === "send" ? (
              <span className="text-rose-300/90">The page could not be reached — is the tag still connected?</span>
            ) : failed === "silence" ? (
              <span className="text-rose-300/90">No answer from the page — the tag there may be an older cached build without throttling. Reload the page and try again.</span>
            ) : waiting ? (
              <span className="text-white/50">Waiting for the page to confirm…</span>
            ) : throttled ? (
              <span className="text-amber-300/90">{throttleProfileLabel(active)} in force — the page confirmed it.</span>
            ) : (
              <span className="text-white/50">Off — everything at full speed.</span>
            )}
          </p>

          <div className="p-1.5" role="group" aria-label="Throttle presets">
            {THROTTLE_PRESETS.map(preset => {
              const current = sameProfile(active, preset.profile);
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => apply(preset.profile)}
                  aria-pressed={current}
                  className={`flex w-full items-baseline justify-between gap-2 rounded-md px-2.5 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50 ${
                    current ? "bg-amber-400/10 text-amber-200" : "text-white/75 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span className="text-[11px] font-semibold">{preset.label}</span>
                  <span className={`truncate text-[10px] ${current ? "text-amber-200/70" : "text-white/35"}`}>{preset.hint}</span>
                </button>
              );
            })}
          </div>

          <div className="border-t border-white/10 p-2.5">
            <p className="pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/35">Custom</p>
            <div className="flex items-center gap-1.5">
              <label className="inline-flex h-8 min-w-0 flex-1 items-center gap-1 rounded-md border border-white/10 bg-white/[0.06] px-2 font-mono text-[11px] text-white/70 focus-within:border-amber-300/40">
                <span className="sr-only">Latency in milliseconds</span>
                <input
                  type="number"
                  min={0}
                  value={customLatency}
                  onChange={event => setCustomLatency(event.target.value)}
                  className="w-full min-w-0 bg-transparent text-right outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="shrink-0 text-white/35">ms</span>
              </label>
              <label className="inline-flex h-8 min-w-0 flex-1 items-center gap-1 rounded-md border border-white/10 bg-white/[0.06] px-2 font-mono text-[11px] text-white/70 focus-within:border-amber-300/40">
                <span className="sr-only">Download speed in kilobits per second</span>
                <input
                  type="number"
                  min={0}
                  value={customKbps}
                  onChange={event => setCustomKbps(event.target.value)}
                  className="w-full min-w-0 bg-transparent text-right outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="shrink-0 text-white/35">kbps</span>
              </label>
              <button
                type="button"
                onClick={applyCustom}
                className="h-8 shrink-0 rounded-md border border-white/12 px-2.5 text-[11px] font-semibold text-white/75 outline-none hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-amber-300/50"
              >
                Apply
              </button>
            </div>
          </div>

          <div className="border-t border-white/10 p-2.5">
            <button
              type="button"
              onClick={() => apply(null)}
              disabled={!throttled && !waiting}
              className="h-8 w-full rounded-md border border-white/12 text-[11px] font-semibold text-white/75 outline-none enabled:hover:bg-white/5 enabled:hover:text-white disabled:opacity-35 focus-visible:ring-2 focus-visible:ring-white/40"
            >
              Back to normal
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
