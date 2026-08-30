"use client";

// Appearance — the modes, and your own stylesheet.
//
// Ed, 2026-08-29: *"in settings the modes like performance mode, cinematic
// mode, privacy mode, all of this should also be in here… and I'd like to add a
// CSS injection into settings."*
//
// ── Why these were hard to find ───────────────────────────────────────────
//
// Cinematic and performance mode live in the profile dropdown; privacy mode is
// a topbar button. Each is reachable, none is in Settings — so "turn off the
// animations" meant knowing which of three menus it hid in. They stay where
// they are (a mode you toggle mid-task belongs on the chrome) and are ALSO
// here, which is the same many-doors rule the rest of the hub follows.

import { useCallback, useEffect, useState } from "react";
import { Check, LoaderCircle, TriangleAlert } from "lucide-react";

import { CINEMATIC_MODE_EVENT, cinematicModeEnabled, setCinematicMode } from "@/lib/chrome/cinematicMode";
import { performanceModeCookieEnabled, setPerformanceModeCookie } from "@/lib/chrome/performanceMode";
import { MAX_CUSTOM_CSS_LENGTH, checkCustomCss } from "@/lib/chrome/customCss";
import { PRIVACY_MODE_EVENT, privacyModeEnabled, setPrivacyMode } from "@/lib/chrome/privacyMode";

export function AppearancePanel({ initialCss }: { initialCss: string }) {
  const [cinematic, setCinematic] = useState(false);
  const [performance, setPerformance] = useState(true);
  const [privacy, setPrivacy] = useState(false);
  const [css, setCss] = useState(initialCss);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  useEffect(() => {
    setCinematic(cinematicModeEnabled());
    setPerformance(performanceModeCookieEnabled());
    setPrivacy(privacyModeEnabled());
    const syncCinematic = () => setCinematic(cinematicModeEnabled());
    // The topbar button toggles the same thing; without this the panel would
    // show a stale state after using it.
    const syncPrivacy = () => setPrivacy(privacyModeEnabled());
    window.addEventListener(CINEMATIC_MODE_EVENT, syncCinematic);
    window.addEventListener(PRIVACY_MODE_EVENT, syncPrivacy);
    return () => {
      window.removeEventListener(CINEMATIC_MODE_EVENT, syncCinematic);
      window.removeEventListener(PRIVACY_MODE_EVENT, syncPrivacy);
    };
  }, []);

  // Checked as you type, so a rejected rule is caught before you hit save
  // rather than after — and the reason is the same one the server gives.
  const check = checkCustomCss(css);

  const save = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/portal/chrome/layout", {
        // PUT, not POST — the route exports GET/PUT/DELETE only, so every save
        // this panel ever made was a 405. Do NOT add a POST handler instead:
        // smoke-chrome-layout pins exactly three unauthorised guards there.
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customCss: css }),
      });
      if (!response.ok) throw new Error("save failed");
      setNote({ tone: "ok", text: "Saved. Reload to see it applied." });
    } catch {
      setNote({ tone: "bad", text: "Could not save your stylesheet." });
    } finally {
      setBusy(false);
    }
  }, [busy, css]);

  return (
    <div className="grid gap-8">
      <div>
        <h3 className="text-sm font-semibold text-black/80">Modes</h3>
        <p className="mt-1 text-xs text-black/50">
          These also live in the profile menu and the topbar — the same switches, wherever you are.
        </p>
        <div className="mt-3 grid gap-2">
          <Toggle
            label="Cinematic mode"
            detail="Transitions and load-in animations. Off is faster and calmer."
            checked={cinematic}
            onChange={next => { setCinematicMode(next); setCinematic(next); }}
          />
          <Toggle
            label="Privacy mode"
            detail="Blurs names, money and contact details until you hover. The topbar button does the same thing — this is the same switch."
            checked={privacy}
            onChange={next => { setPrivacyMode(next); setPrivacy(next); }}
          />
          <Toggle
            label="Performance mode"
            detail="Trims background work and effects. Leave on unless you are demoing."
            checked={performance}
            onChange={next => { setPerformanceModeCookie(next); setPerformance(next); }}
          />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-black/80">Custom CSS</h3>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-black/50">
          Your own stylesheet, applied to your workspace only — never to your team or your clients.
          If you ever style yourself into a corner, add <code className="rounded bg-black/[0.05] px-1 font-mono">?nocss=1</code> to
          any URL to load without it.
        </p>
        <textarea
          value={css}
          onChange={event => { setCss(event.target.value); setNote(null); }}
          spellCheck={false}
          rows={10}
          placeholder=".mm-sidebar-link { font-weight: 600; }"
          className="mt-3 w-full resize-y rounded-md border border-black/15 bg-white px-3 py-2 font-mono text-xs leading-5 text-black/80 outline-none focus:border-black/35"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <span className={`text-[11px] ${check.ok ? "text-black/40" : "text-amber-800"}`}>
            {check.ok
              ? `${css.length.toLocaleString()} / ${MAX_CUSTOM_CSS_LENGTH.toLocaleString()} characters`
              : <span className="inline-flex items-center gap-1.5"><TriangleAlert size={12} aria-hidden="true" />{check.reason}</span>}
          </span>
          <span className="flex items-center gap-3">
            {note ? <span role="status" className={`text-[11px] ${note.tone === "ok" ? "text-emerald-700" : "text-red-700"}`}>{note.text}</span> : null}
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || !check.ok}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/85 disabled:opacity-50"
            >
              {busy ? <LoaderCircle size={13} className="animate-spin" aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}
              Save stylesheet
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, detail, checked, onChange }: {
  label: string; detail: string; checked: boolean; onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-start gap-3 rounded-md border border-black/10 bg-white px-3 py-2.5 text-left hover:bg-black/[0.02]"
    >
      <span className={`mt-0.5 inline-flex h-4 w-7 shrink-0 items-center rounded-full transition ${checked ? "bg-[#0b6f6d]" : "bg-black/15"}`}>
        <span className={`ml-0.5 size-3 rounded-full bg-white transition ${checked ? "translate-x-3" : ""}`} />
      </span>
      <span>
        <strong className="block text-xs font-semibold text-black/80">{label}</strong>
        <span className="block text-[11px] leading-4 text-black/45">{detail}</span>
      </span>
    </button>
  );
}
