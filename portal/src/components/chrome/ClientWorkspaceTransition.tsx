"use client";

import { Building2, Files, MessagesSquare, ShieldCheck } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { clientWorkspaceRouteId } from "@/lib/chrome/clientWorkspaceRoute";
import { isCommandCenterPath } from "@/lib/chrome/commandCenter";
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

export function ClientWorkspaceTransition() {
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
    delete document.documentElement.dataset.clientWorkspaceTransition;
  }, []);

  const dismissTransition = useCallback(() => {
    clearTimers();
    activeRef.current = null;
    setActive(null);
    delete document.documentElement.dataset.clientWorkspaceTransition;
  }, [clearTimers]);

  const finishTransition = useCallback((id: number) => {
    const current = activeRef.current;
    if (!current || current.id !== id || current.phase === "release") return;

    const reduced = reducedMotionPreferred();
    const minimumHold = reduced ? 50 : current.mode === "enter" ? 760 : 520;
    const remaining = Math.max(0, minimumHold - (performance.now() - startedAtRef.current));

    if (releaseTimerRef.current !== null) window.clearTimeout(releaseTimerRef.current);
    releaseTimerRef.current = window.setTimeout(() => {
      const latest = activeRef.current;
      if (!latest || latest.id !== id) return;
      const releasing = { ...latest, phase: "release" as const };
      activeRef.current = releasing;
      setActive(releasing);
      clearTimerRef.current = window.setTimeout(() => clearTransition(id), reduced ? 20 : 240);
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
    document.documentElement.dataset.clientWorkspaceTransition = mode;
    failSafeTimerRef.current = window.setTimeout(() => finishTransition(next.id), 2_500);
    return next.id;
  }, [clearTimers, dismissTransition, finishTransition]);

  useEffect(() => {
    const previousPath = previousPathRef.current;
    const currentClientId = clientWorkspaceRouteId(pathname);

    if (previousPath === null) {
      previousPathRef.current = pathname;
      if (currentClientId) {
        const id = beginTransition("enter");
        if (id !== null) window.setTimeout(() => finishTransition(id), 40);
      }
      return;
    }

    const previousClientId = clientWorkspaceRouteId(previousPath);
    previousPathRef.current = pathname;
    if (previousClientId === currentClientId) return;

    if (currentClientId) {
      const existing = activeRef.current;
      const id = existing?.mode === "enter" ? existing.id : beginTransition("enter");
      if (id !== null) finishTransition(id);
      return;
    }

    if (previousClientId && !isCommandCenterPath(pathname)) {
      const existing = activeRef.current;
      const id = existing?.mode === "exit" ? existing.id : beginTransition("exit");
      if (id !== null) finishTransition(id);
    }
  }, [beginTransition, finishTransition, pathname]);

  useEffect(() => {
    const handleNavigationIntent = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.target === "_blank" || target.hasAttribute("download")) return;

      const destination = new URL(target.href, window.location.href);
      if (destination.origin !== window.location.origin) return;

      const currentClientId = clientWorkspaceRouteId(window.location.pathname);
      const destinationClientId = clientWorkspaceRouteId(destination.pathname);
      if (currentClientId === destinationClientId) return;

      if (destinationClientId) {
        beginTransition("enter");
      } else if (currentClientId && !isCommandCenterPath(destination.pathname)) {
        beginTransition("exit");
      }
    };

    document.addEventListener("click", handleNavigationIntent, true);
    return () => document.removeEventListener("click", handleNavigationIntent, true);
  }, [beginTransition]);

  useEffect(() => {
    const handlePreference = (event: Event) => {
      const enabled = (event as CustomEvent<{ enabled?: boolean }>).detail?.enabled;
      const next = typeof enabled === "boolean" ? enabled : performanceModeEnabled();
      if (next) dismissTransition();
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== PERFORMANCE_MODE_STORAGE_KEY) return;
      if (event.newValue === "1") dismissTransition();
    };
    window.addEventListener(PERFORMANCE_MODE_EVENT, handlePreference);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(PERFORMANCE_MODE_EVENT, handlePreference);
      window.removeEventListener("storage", handleStorage);
    };
  }, [dismissTransition]);

  useEffect(() => () => {
    clearTimers();
    delete document.documentElement.dataset.clientWorkspaceTransition;
  }, [clearTimers]);

  if (!active) return null;

  const entering = active.mode === "enter";
  const title = entering ? "Opening client workspace" : "Closing client workspace";
  const detail = entering
    ? "Synchronising relationship, delivery, files, finance, and the client record."
    : "Securing the client record and returning control to the agency workspace.";

  return (
    <div
      className="mm-client-workspace-transition"
      data-mode={active.mode}
      data-phase={active.phase}
      role="status"
      aria-live="assertive"
      aria-label={title}
    >
      <div className="mm-client-workspace-transition__grid" aria-hidden="true" />
      <div className="mm-client-workspace-transition__scan" aria-hidden="true" />
      <div className="mm-client-workspace-transition__console">
        <div className="mm-client-workspace-transition__mark" aria-hidden="true">
          <Building2 size={31} strokeWidth={1.45} />
          <span />
        </div>
        <div className="mm-client-workspace-transition__copy">
          <p>AQUA CLIENT OPERATIONS · SECURE HANDOFF</p>
          <h2>{title}</h2>
          <span>{detail}</span>
        </div>
        <div className="mm-client-workspace-transition__progress" aria-hidden="true">
          <span /><span /><span /><span /><span />
        </div>
        <div className="mm-client-workspace-transition__systems" aria-hidden="true">
          <span><MessagesSquare size={13} /> Relationship linked</span>
          <span><Files size={13} /> Records mounted</span>
          <span><ShieldCheck size={13} /> Access verified</span>
        </div>
      </div>
    </div>
  );
}
