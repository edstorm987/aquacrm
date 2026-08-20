"use client";

import { Crosshair, FlaskConical, Hammer, RadioTower, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { cinematicModeEnabled } from "@/lib/chrome/cinematicMode";
import { DEV_MODE_LOADIN_KEY, DEV_MODE_LOADIN_WORKSPACE } from "@/lib/chrome/devModeLoadIn";

// Dev Mode cinematic load-in. Reuses the existing command-transition CSS system
// (`.mm-command-transition`, gated by `html[data-cinematic-mode="false"]` — the
// same "Cinematic mode" toggle) so the swap feels like the rest of
// the app rather than a bespoke spinner. It's dev-scoped: the layout only
// mounts it on a demo session, and it renders nothing unless the switcher set
// the sessionStorage flag on the way in. Sits above the native transitions
// (z-index bump in globals.css) so it cleanly covers whichever one the landing
// path fires.

interface LoadInCopy {
  label: string;
  detail: string;
  /** The strap above the title. */
  eyebrow: string;
  title: string;
  /** Right-hand header slug. */
  stage: string;
  /** The three system lines along the bottom. Each must be TRUE of this journey. */
  systems: { icon: typeof Crosshair; text: string }[];
}

const PERSONA_COPY: Record<string, { label: string; detail: string }> = {
  owner: { label: "Owner", detail: "Loading the agency owner’s point of view on safe demo data." },
  staff: { label: "Staff", detail: "Loading a team member’s point of view on safe demo data." },
  customer: { label: "Customer", detail: "Loading the customer’s view of the portal on safe demo data." },
  freelancer: { label: "Freelancer", detail: "Loading the freelancer’s view of their assigned work on safe demo data." },
};

/**
 * Opening the workspace is NOT a persona hop — it is plain navigation that
 * keeps you signed in as yourself, on your real data. The overlay says exactly
 * that: no "demo tenant", no "fenced from live data", because neither is true
 * here and an overlay that lies about identity is worse than no overlay.
 */
const WORKSPACE_COPY: LoadInCopy = {
  label: "Dev Console",
  detail: "Opening plans, workers, findings and the library. You stay signed in as yourself.",
  eyebrow: "DEV CONSOLE WORKSPACE",
  title: "Opening the workspace",
  stage: "WORKSPACE HANDOFF",
  systems: [
    { icon: UserRound, text: "Still signed in as you" },
    { icon: ShieldCheck, text: "Your real data" },
    { icon: Hammer, text: "Dev Console" },
  ],
};

function copyFor(flag: string): LoadInCopy {
  if (flag === DEV_MODE_LOADIN_WORKSPACE) return WORKSPACE_COPY;
  const persona = PERSONA_COPY[flag] ?? { label: "Demo", detail: "Loading a demo point of view on safe data." };
  return {
    ...persona,
    eyebrow: "DEMO PROFILE INITIALISING",
    title: "Entering Dev Mode",
    stage: "PROFILE HANDSHAKE",
    systems: [
      { icon: RadioTower, text: "Demo tenant linked" },
      { icon: ShieldCheck, text: "Fenced from live data" },
      { icon: Crosshair, text: `${persona.label} view` },
    ],
  };
}

function reducedMotionPreferred(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function DevModeLoadIn() {
  const [persona, setPersona] = useState<string | null>(null);
  const [phase, setPhase] = useState<"engage" | "release">("engage");

  // Consume the one-shot flag exactly once → start the show. Kept SEPARATE
  // from the dismiss timers below: under React 19 Strict Mode the effect is
  // invoked twice, and if the flag-read and the timers shared one effect the
  // cleanup would cancel the timers while the second run found the flag already
  // consumed — stranding the overlay in `engage` forever (a full-screen click
  // trap). Splitting them lets the timer effect reschedule cleanly.
  useEffect(() => {
    let flag: string | null = null;
    try { flag = window.sessionStorage.getItem(DEV_MODE_LOADIN_KEY); } catch { /* private mode */ }
    if (!flag) return;
    try { window.sessionStorage.removeItem(DEV_MODE_LOADIN_KEY); } catch { /* ignore */ }
    // Respect Cinematic mode (OFF = skip) + reduced motion — exactly like
    // CommandCenterTransition / ClientWorkspaceTransition.
    if (!cinematicModeEnabled() || reducedMotionPreferred()) return;
    setPersona(flag);
  }, []);

  // Timed dismissal, driven off `persona` (stable state, not the one-shot
  // flag), so a Strict-Mode re-invoke reschedules rather than stranding it.
  // Guarantees the overlay always tears itself down.
  useEffect(() => {
    if (!persona) return;
    setPhase("engage");
    const release = window.setTimeout(() => setPhase("release"), 1_400);
    const clear = window.setTimeout(() => setPersona(null), 1_400 + 380);
    return () => {
      window.clearTimeout(release);
      window.clearTimeout(clear);
    };
  }, [persona]);

  if (!persona) return null;
  const copy = copyFor(persona);

  return (
    <div
      className="mm-command-transition mm-devmode-loadin"
      data-mode="enter"
      data-phase={phase}
      role="status"
      aria-live="assertive"
      aria-label={persona === DEV_MODE_LOADIN_WORKSPACE ? "Opening the Dev Console workspace" : `Loading Dev Mode — ${copy.label} view`}
    >
      <div className="mm-command-transition__curtain mm-command-transition__curtain--left" aria-hidden="true" />
      <div className="mm-command-transition__curtain mm-command-transition__curtain--right" aria-hidden="true" />
      <div className="mm-command-transition__grid" aria-hidden="true" />
      <div className="mm-command-transition__scanline" aria-hidden="true" />

      <header className="mm-command-transition__header" aria-hidden="true">
        <span><FlaskConical size={14} /> AQUA DEV MODE</span>
        <span>{copy.stage}</span>
      </header>

      <main className="mm-command-transition__console">
        <div className="mm-command-transition__core" aria-hidden="true">
          <span className="mm-command-transition__reticle"><Crosshair size={38} strokeWidth={1.2} /></span>
          <span className="mm-command-transition__sweep" />
        </div>

        <div className="mm-command-transition__copy">
          <p>{copy.eyebrow}</p>
          <h2>{copy.title}</h2>
          <span>{copy.detail}</span>
        </div>

        <div className="mm-command-transition__progress" aria-hidden="true">
          <span /><span /><span /><span /><span /><span /><span /><span />
        </div>

        <div className="mm-command-transition__systems" aria-hidden="true">
          {copy.systems.map(system => (
            <span key={system.text}><system.icon size={13} /> {system.text}</span>
          ))}
        </div>
      </main>
    </div>
  );
}
