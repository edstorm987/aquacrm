"use client";

import { Anvil, Flame, Hammer, Ship } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CINEMATIC_MODE_EVENT, CINEMATIC_MODE_STORAGE_KEY, cinematicModeEnabled } from "@/lib/chrome/cinematicMode";

// The Dev Team cutscene — the shipyard sibling of CommandCenterTransition (the
// bridge handshake). Where Command Centre is the bridge that commands the
// fleet, the Dev Team is the YARD where the vessel is forged and built, so the
// cutscene reads "Entering the shipyard / firing the forge": ember ignition and
// sparks in the FORGE (dark), a timber/sawdust reveal in the MILL (light). It
// mirrors CommandCenterTransition's machinery — the cinematic-mode gate, the
// engage → release phase timers, the documentElement dataset flag, and the
// prefers-reduced-motion handling — but fires on ENTERING the workspace: it is
// rendered only inside the Dev Team layout, so mounting IS the entry event and
// the persistent nested layout means inner-page navigation never re-fires it.

type TransitionPhase = "engage" | "release";

type ActiveTransition = {
  id: number;
  phase: TransitionPhase;
};

function reducedMotionPreferred(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isDevTeamPath(pathname: string | null): boolean {
  return Boolean(pathname && (pathname === "/portal/dev-team" || pathname.startsWith("/portal/dev-team/")));
}

export function DevTeamTransition() {
  const pathname = usePathname();
  const [active, setActive] = useState<ActiveTransition | null>(null);
  const activeRef = useRef<ActiveTransition | null>(null);
  const firedRef = useRef(false);
  const startedAtRef = useRef(0);
  const releaseTimerRef = useRef<number | null>(null);
  const clearTimerRef = useRef<number | null>(null);
  const failSafeTimerRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    for (const timer of [releaseTimerRef, clearTimerRef, failSafeTimerRef]) {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const clearTransition = useCallback((id: number) => {
    if (activeRef.current?.id !== id) return;
    activeRef.current = null;
    setActive(null);
    delete document.documentElement.dataset.devTeamTransition;
  }, []);

  const dismissTransition = useCallback(() => {
    clearTimers();
    activeRef.current = null;
    setActive(null);
    delete document.documentElement.dataset.devTeamTransition;
  }, [clearTimers]);

  const finishTransition = useCallback((id: number) => {
    const current = activeRef.current;
    if (!current || current.id !== id || current.phase === "release") return;

    const reduced = reducedMotionPreferred();
    const minimumHold = reduced ? 80 : 1_500;
    const remaining = Math.max(0, minimumHold - (performance.now() - startedAtRef.current));

    if (releaseTimerRef.current !== null) window.clearTimeout(releaseTimerRef.current);
    releaseTimerRef.current = window.setTimeout(() => {
      const latest = activeRef.current;
      if (!latest || latest.id !== id) return;
      const releasing = { ...latest, phase: "release" as const };
      activeRef.current = releasing;
      setActive(releasing);
      clearTimerRef.current = window.setTimeout(() => clearTransition(id), reduced ? 20 : 380);
    }, remaining);
  }, [clearTransition]);

  const beginTransition = useCallback((): number | null => {
    if (!cinematicModeEnabled()) {
      dismissTransition();
      return null;
    }
    clearTimers();
    const next = { id: Date.now(), phase: "engage" as const };
    startedAtRef.current = performance.now();
    activeRef.current = next;
    setActive(next);
    document.documentElement.dataset.devTeamTransition = "enter";
    failSafeTimerRef.current = window.setTimeout(() => finishTransition(next.id), 4_000);
    return next.id;
  }, [clearTimers, dismissTransition, finishTransition]);

  // Fire once, on entering the shipyard (this component only exists inside the
  // Dev Team layout). Split from the timer scheduling so a Strict-Mode double
  // invoke can't strand the state mid-engage.
  useEffect(() => {
    if (firedRef.current) return;
    if (!isDevTeamPath(pathname)) return;
    firedRef.current = true;
    const id = beginTransition();
    if (id !== null) window.setTimeout(() => finishTransition(id), 60);
  }, [beginTransition, finishTransition, pathname]);

  // Cinematic-mode preference — mirror the html attribute the CSS belt-and-
  // braces hide keys off, and drop the cutscene immediately if it goes OFF.
  useEffect(() => {
    const handlePreference = (event: Event) => {
      const enabled = (event as CustomEvent<{ enabled?: boolean }>).detail?.enabled;
      const next = typeof enabled === "boolean" ? enabled : cinematicModeEnabled();
      document.documentElement.dataset.cinematicMode = String(next);
      if (!next) dismissTransition();
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== CINEMATIC_MODE_STORAGE_KEY) return;
      const enabled = event.newValue !== "0";
      document.documentElement.dataset.cinematicMode = String(enabled);
      if (!enabled) dismissTransition();
    };
    document.documentElement.dataset.cinematicMode = String(cinematicModeEnabled());
    window.addEventListener(CINEMATIC_MODE_EVENT, handlePreference);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(CINEMATIC_MODE_EVENT, handlePreference);
      window.removeEventListener("storage", handleStorage);
    };
  }, [dismissTransition]);

  useEffect(() => () => {
    clearTimers();
    delete document.documentElement.dataset.devTeamTransition;
  }, [clearTimers]);

  if (!active) return null;

  const title = "Entering the shipyard";
  const detail = "Firing the forge — laying the keel, mounting docs, findings, tasks and workers on the slipway.";

  return (
    <div
      className="mm-dev-transition"
      data-phase={active.phase}
      role="status"
      aria-live="assertive"
      aria-label={title}
    >
      <div className="mm-dev-transition__gate mm-dev-transition__gate--left" aria-hidden="true" />
      <div className="mm-dev-transition__gate mm-dev-transition__gate--right" aria-hidden="true" />
      <div className="mm-dev-transition__grid" aria-hidden="true" />
      <div className="mm-dev-transition__sparks" aria-hidden="true">
        <span /><span /><span /><span /><span /><span />
      </div>

      <header className="mm-dev-transition__header" aria-hidden="true">
        <span><Ship size={14} /> AQUA SHIPYARD</span>
        <span>SLIPWAY 01</span>
      </header>

      <main className="mm-dev-transition__console">
        <div className="mm-dev-transition__side-data mm-dev-transition__side-data--left" aria-hidden="true">
          <span>FORGE / HEATING</span>
          <span>KEEL / LAID</span>
          <span>HULL / FRAMED</span>
          <span>TIDE / SLACK</span>
        </div>

        <div className="mm-dev-transition__forge" aria-hidden="true">
          <span className="mm-dev-transition__ember"><Flame size={38} strokeWidth={1.2} /></span>
        </div>

        <div className="mm-dev-transition__side-data mm-dev-transition__side-data--right" aria-hidden="true">
          <span>ANVIL / RINGING</span>
          <span>BELLOWS / DRAWN</span>
          <span>PLANS / PINNED</span>
          <span>YARD / MANNED</span>
        </div>

        <div className="mm-dev-transition__copy">
          <p>SLIPWAY COMING TO TEMPERATURE</p>
          <h2>{title}</h2>
          <span>{detail}</span>
        </div>

        <div className="mm-dev-transition__progress" aria-hidden="true">
          <span /><span /><span /><span /><span /><span /><span /><span />
        </div>

        <div className="mm-dev-transition__systems" aria-hidden="true">
          <span><Flame size={13} /> FORGE LIT</span>
          <span><Anvil size={13} /> ANVIL SET</span>
          <span><Hammer size={13} /> YARD READY</span>
        </div>
      </main>

      <footer className="mm-dev-transition__footer" aria-hidden="true">
        <span>DRYDOCK-01 / AQUAOASIS-WEB</span>
        <span>ALL HANDS TO THE SLIPWAY</span>
      </footer>
    </div>
  );
}
