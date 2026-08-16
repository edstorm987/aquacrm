"use client";

import { Anchor, Crosshair, RadioTower, ShieldCheck } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { isCommandCenterPath } from "@/lib/chrome/commandCenter";
import { clientWorkspaceRouteId } from "@/lib/chrome/clientWorkspaceRoute";
import { PERFORMANCE_MODE_EVENT, PERFORMANCE_MODE_STORAGE_KEY, performanceModeEnabled } from "@/lib/chrome/performanceMode";

type TransitionMode = "enter" | "exit";
type TransitionPhase = "engage" | "release";

type ActiveTransition = {
  id: number;
  mode: TransitionMode;
  phase: TransitionPhase;
};

function reducedMotionPreferred(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function CommandCenterTransition() {
  const pathname = usePathname();
  const [active, setActive] = useState<ActiveTransition | null>(null);
  const activeRef = useRef<ActiveTransition | null>(null);
  const previousPathRef = useRef<string | null>(null);
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
    delete document.documentElement.dataset.commandTransition;
  }, []);

  const dismissTransition = useCallback(() => {
    clearTimers();
    activeRef.current = null;
    setActive(null);
    delete document.documentElement.dataset.commandTransition;
  }, [clearTimers]);

  const finishTransition = useCallback((id: number) => {
    const current = activeRef.current;
    if (!current || current.id !== id || current.phase === "release") return;

    const reduced = reducedMotionPreferred();
    const minimumHold = reduced ? 80 : current.mode === "enter" ? 1_450 : 1_050;
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

  const beginTransition = useCallback((mode: TransitionMode): number | null => {
    if (performanceModeEnabled()) {
      dismissTransition();
      return null;
    }
    clearTimers();
    const next = { id: Date.now(), mode, phase: "engage" as const };
    startedAtRef.current = performance.now();
    activeRef.current = next;
    setActive(next);
    document.documentElement.dataset.commandTransition = mode;
    failSafeTimerRef.current = window.setTimeout(() => finishTransition(next.id), 4_000);
    return next.id;
  }, [clearTimers, dismissTransition, finishTransition]);

  useEffect(() => {
    const previousPath = previousPathRef.current;
    const wasCommandCenter = previousPath ? isCommandCenterPath(previousPath) : false;
    const isCommandCenter = isCommandCenterPath(pathname);

    if (previousPath === null) {
      previousPathRef.current = pathname;
      if (isCommandCenter) {
        const id = beginTransition("enter");
        if (id !== null) window.setTimeout(() => finishTransition(id), 60);
      }
      return;
    }

    previousPathRef.current = pathname;
    if (wasCommandCenter === isCommandCenter) return;
    if (!isCommandCenter && clientWorkspaceRouteId(pathname)) return;

    const mode: TransitionMode = isCommandCenter ? "enter" : "exit";
    const existing = activeRef.current;
    const id = existing?.mode === mode ? existing.id : beginTransition(mode);
    if (id !== null) finishTransition(id);
  }, [beginTransition, finishTransition, pathname]);

  useEffect(() => {
    const handleNavigationIntent = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.target === "_blank" || target.hasAttribute("download")) return;

      const destination = new URL(target.href, window.location.href);
      if (destination.origin !== window.location.origin) return;

      const currentlyCommandCenter = isCommandCenterPath(window.location.pathname);
      const destinationIsCommandCenter = isCommandCenterPath(destination.pathname);
      if (currentlyCommandCenter === destinationIsCommandCenter) return;
      if (!destinationIsCommandCenter && clientWorkspaceRouteId(destination.pathname)) return;

      beginTransition(destinationIsCommandCenter ? "enter" : "exit");
    };

    document.addEventListener("click", handleNavigationIntent, true);
    return () => document.removeEventListener("click", handleNavigationIntent, true);
  }, [beginTransition]);

  useEffect(() => {
    const handlePreference = (event: Event) => {
      const enabled = (event as CustomEvent<{ enabled?: boolean }>).detail?.enabled;
      const next = typeof enabled === "boolean" ? enabled : performanceModeEnabled();
      document.documentElement.dataset.performanceMode = String(next);
      if (next) dismissTransition();
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== PERFORMANCE_MODE_STORAGE_KEY) return;
      const enabled = event.newValue === "1";
      document.documentElement.dataset.performanceMode = String(enabled);
      if (enabled) dismissTransition();
    };
    document.documentElement.dataset.performanceMode = String(performanceModeEnabled());
    window.addEventListener(PERFORMANCE_MODE_EVENT, handlePreference);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(PERFORMANCE_MODE_EVENT, handlePreference);
      window.removeEventListener("storage", handleStorage);
    };
  }, [dismissTransition]);

  useEffect(() => () => {
    clearTimers();
    delete document.documentElement.dataset.commandTransition;
  }, [clearTimers]);

  if (!active) return null;

  const entering = active.mode === "enter";
  const title = entering ? "Entering command deck" : "Returning to workspace";
  const detail = entering
    ? "Synchronising Radar, evidence, watch control, and bridge stations."
    : "Preserving the command plot and handing control back to the workspace."

  return (
    <div
      className="mm-command-transition"
      data-mode={active.mode}
      data-phase={active.phase}
      role="status"
      aria-live="assertive"
      aria-label={title}
    >
      <div className="mm-command-transition__curtain mm-command-transition__curtain--left" aria-hidden="true" />
      <div className="mm-command-transition__curtain mm-command-transition__curtain--right" aria-hidden="true" />
      <div className="mm-command-transition__grid" aria-hidden="true" />
      <div className="mm-command-transition__scanline" aria-hidden="true" />

      <header className="mm-command-transition__header" aria-hidden="true">
        <span><Anchor size={14} /> AQUA COMMAND NETWORK</span>
        <span>{entering ? "BRIDGE HANDSHAKE 01" : "WATCH HANDOVER 04"}</span>
      </header>

      <main className="mm-command-transition__console">
        <div className="mm-command-transition__side-data mm-command-transition__side-data--left" aria-hidden="true">
          <span>LINK / SECURE</span>
          <span>BEARING / 000</span>
          <span>PICTURE / LIVE</span>
          <span>DEPTH / ALL</span>
        </div>

        <div className="mm-command-transition__core" aria-hidden="true">
          <span className="mm-command-transition__reticle"><Crosshair size={38} strokeWidth={1.2} /></span>
          <span className="mm-command-transition__sweep" />
          <span className="mm-command-transition__core-mark mm-command-transition__core-mark--north">N</span>
          <span className="mm-command-transition__core-mark mm-command-transition__core-mark--east">090</span>
          <span className="mm-command-transition__core-mark mm-command-transition__core-mark--south">180</span>
          <span className="mm-command-transition__core-mark mm-command-transition__core-mark--west">270</span>
        </div>

        <div className="mm-command-transition__side-data mm-command-transition__side-data--right" aria-hidden="true">
          <span>RADAR / {entering ? "ACQUIRE" : "STANDBY"}</span>
          <span>VAULT / SEALED</span>
          <span>STATIONS / LINKED</span>
          <span>CONTROL / MANNED</span>
        </div>

        <div className="mm-command-transition__copy">
          <p>{entering ? "TACTICAL PICTURE INITIALISING" : "COMMAND PICTURE PRESERVED"}</p>
          <h2>{title}</h2>
          <span>{detail}</span>
        </div>

        <div className="mm-command-transition__progress" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>

        <div className="mm-command-transition__systems" aria-hidden="true">
          <span><RadioTower size={13} /> {entering ? "RADAR ONLINE" : "RADAR STANDING BY"}</span>
          <span><ShieldCheck size={13} /> EVIDENCE SECURED</span>
          <span><Crosshair size={13} /> {entering ? "WATCH ACTIVE" : "HANDOVER COMPLETE"}</span>
        </div>
      </main>

      <footer className="mm-command-transition__footer" aria-hidden="true">
        <span>PPI-01 / AQUAOASIS-WEB</span>
        <span>{entering ? "ALL STATIONS SYNCHRONISING" : "NORMAL OPERATIONS RESUMING"}</span>
      </footer>
    </div>
  );
}
