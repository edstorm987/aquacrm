"use client";

import {
  Activity,
  BellRing,
  BriefcaseBusiness,
  Check,
  Clock3,
  Coffee,
  Laptop,
  LoaderCircle,
  Pause,
  Square,
  TimerReset,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { DashboardWorkActivityMode, DashboardWorkSession } from "@/server/types";

const HEARTBEAT_MS = 60_000;
const LOCAL_IDLE_PROMPT_MS = 10 * 60_000;

interface PlanningPayload {
  today: string;
  weekStart: string;
  weekPlan: unknown;
  dayPlan: unknown;
  weekPlans: unknown[];
  sessions: DashboardWorkSession[];
  activeSession: DashboardWorkSession | null;
}

type ActivityChoice = Exclude<DashboardWorkActivityMode, "unconfirmed">;

export function SmartWorkSessionMonitor({ userName, initialSession, initialNow }: { userName?: string; initialSession: DashboardWorkSession | null; initialNow: number }) {
  const [session, setSession] = useState<DashboardWorkSession | null>(initialSession);
  const [open, setOpen] = useState(Boolean(initialSession?.needsActivityConfirmation));
  const [choice, setChoice] = useState<ActivityChoice>("aqua");
  const [focus, setFocus] = useState("");
  const [note, setNote] = useState("");
  const [checkInMinutes, setCheckInMinutes] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(initialNow);
  const [snoozedUntil, setSnoozedUntil] = useState(0);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unavailable">("unavailable");
  const sessionRef = useRef<DashboardWorkSession | null>(initialSession);
  const lastInteractionRef = useRef(Date.now());
  const requestBusyRef = useRef(false);
  const lastDesktopPingRef = useRef("");
  const mountedRef = useRef(false);
  const monitoringActive = session !== null;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const acceptPlanning = useCallback((planning: PlanningPayload, broadcast = true) => {
    if (!mountedRef.current) return;
    sessionRef.current = planning.activeSession;
    setSession(planning.activeSession);
    setNow(Date.now());
    if (planning.activeSession?.needsActivityConfirmation && Date.now() >= snoozedUntil) setOpen(true);
    if (!planning.activeSession) setOpen(false);
    if (broadcast) window.dispatchEvent(new CustomEvent("aqua-work-session:planning", { detail: planning }));
  }, [snoozedUntil]);

  const requestPlanning = useCallback(async (body: Record<string, unknown>) => {
    if (requestBusyRef.current) return null;
    requestBusyRef.current = true;
    try {
      const response = await fetch("/api/portal/dashboard-planning", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; planning?: PlanningPayload } | null;
      if (!response.ok || !result?.ok || !result.planning) throw new Error(result?.error || "Work-session evidence could not update.");
      acceptPlanning(result.planning);
      return result.planning;
    } finally {
      requestBusyRef.current = false;
    }
  }, [acceptPlanning]);

  const heartbeat = useCallback(async () => {
    if (!sessionRef.current) return;
    try {
      await requestPlanning({
        action: "heartbeat",
        date: localDate(),
        visible: document.visibilityState === "visible",
        lastInteractionAt: lastInteractionRef.current,
        currentPath: window.location.pathname,
      });
    } catch {
      // The visible control will retry. A dropped heartbeat becomes uncertainty server-side.
    }
  }, [requestPlanning]);

  useEffect(() => {
    if (!monitoringActive) return;
    setNotificationPermission("Notification" in window ? Notification.permission : "unavailable");
  }, [monitoringActive]);

  useEffect(() => {
    if (!monitoringActive) return;
    const markActive = () => { lastInteractionRef.current = Date.now(); };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "scroll", "touchstart"];
    events.forEach(event => window.addEventListener(event, markActive, { passive: true }));
    const onVisibilityChange = () => { if (document.visibilityState === "visible") lastInteractionRef.current = Date.now(); void heartbeat(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", markActive);
    return () => {
      events.forEach(event => window.removeEventListener(event, markActive));
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", markActive);
    };
  }, [heartbeat, monitoringActive]);

  useEffect(() => {
    if (!monitoringActive) return;
    const interval = window.setInterval(() => {
      const stamp = Date.now();
      setNow(stamp);
      const active = sessionRef.current;
      if (active?.currentMode === "aqua" && stamp - lastInteractionRef.current >= LOCAL_IDLE_PROMPT_MS && stamp >= snoozedUntil) {
        setOpen(true);
      }
      void heartbeat();
    }, HEARTBEAT_MS);
    return () => window.clearInterval(interval);
  }, [heartbeat, monitoringActive, snoozedUntil]);

  useEffect(() => {
    function planningUpdated(event: Event) {
      const detail = (event as CustomEvent<PlanningPayload>).detail;
      if (detail?.activeSession !== undefined) acceptPlanning(detail, false);
    }
    function openCheckIn() {
      if (!sessionRef.current) return;
      setChoice(sessionRef.current.currentMode === "external" || sessionRef.current.currentMode === "break" ? sessionRef.current.currentMode : "aqua");
      setFocus(sessionRef.current.focus ?? "");
      setOpen(true);
    }
    window.addEventListener("aqua-work-session:updated", planningUpdated);
    window.addEventListener("aqua-work-session:check-in", openCheckIn);
    return () => {
      window.removeEventListener("aqua-work-session:updated", planningUpdated);
      window.removeEventListener("aqua-work-session:check-in", openCheckIn);
    };
  }, [acceptPlanning]);

  useEffect(() => {
    if (!session) return;
    if (!session.needsActivityConfirmation || now < snoozedUntil) return;
    setOpen(true);
    const pingKey = `${session.id}:${session.currentModeSince ?? session.updatedAt}`;
    if (document.visibilityState === "hidden" && notificationPermission === "granted" && lastDesktopPingRef.current !== pingKey) {
      new Notification("Aqua work check", { body: `${firstNameFrom(userName)}, Aqua cannot confirm your current activity. Open the work check or declare what you are doing.` });
      lastDesktopPingRef.current = pingKey;
    }
  }, [notificationPermission, now, session, snoozedUntil, userName]);

  async function resolveActivity(mode: ActivityChoice) {
    if (mode === "external" && !focus.trim()) {
      setError("Name the work you are doing outside Aqua first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await requestPlanning({
        action: "resolve-activity",
        date: localDate(),
        activityMode: mode,
        activityFocus: focus,
        notes: note,
        nextCheckInMinutes: checkInMinutes,
      });
      lastInteractionRef.current = Date.now();
      setOpen(false);
      setNote("");
      setSnoozedUntil(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The work check-in could not save.");
    } finally {
      setBusy(false);
    }
  }

  function requestClockOutReview() {
    setSnoozedUntil(Date.now() + 10 * 60_000);
    setOpen(false);
    if (window.location.pathname === "/portal/agency" || window.location.pathname === "/portal/agency/command-center") {
      window.dispatchEvent(new Event("aqua-work-session:clock-out-review"));
      return;
    }
    window.location.assign("/portal/agency?station=day&review=clock-out");
  }

  function remindLater() {
    setSnoozedUntil(Date.now() + 5 * 60_000);
    setOpen(false);
  }

  async function enableDesktopPings() {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  }

  if (!session) return null;
  const mode = session.currentMode ?? "unconfirmed";
  const modeLabel = workModeLabel(mode);
  const unconfirmed = session.needsActivityConfirmation || mode === "unconfirmed";
  const unconfirmedMinutes = Math.max(0, Math.round((session.unconfirmedIdleMs ?? 0) / 60_000));
  const firstName = userName?.trim().split(/\s+/)[0] || "there";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`mm-smart-clock-chip ${unconfirmed ? "mm-smart-clock-chip-attention" : ""}`} title="Open smart work-session check-in">
        <span className="mm-smart-clock-chip-pulse" />
        <span className="min-w-0 text-left"><strong>{unconfirmed ? "Work check needed" : modeLabel}</strong><small>{formatElapsed(now - session.startedAt)} clocked in</small></span>
      </button>

      {open ? (
        <section role="dialog" aria-modal="false" aria-labelledby="smart-work-check-heading" className="mm-smart-clock-prompt">
          <header className="mm-smart-clock-prompt-header">
            <span className="mm-smart-clock-prompt-icon"><Activity size={18} /></span>
            <div className="min-w-0 flex-1">
              <p className="mm-smart-clock-eyebrow">Smart employee clock</p>
              <h2 id="smart-work-check-heading">{unconfirmed ? `What are you doing, ${firstName}?` : "Update your work status"}</h2>
            </div>
            {!unconfirmed ? <button type="button" onClick={() => setOpen(false)} aria-label="Close work check" className="mm-smart-clock-close"><X size={17} /></button> : null}
          </header>

          <div className="mm-smart-clock-body">
            <p className="mm-smart-clock-explanation">
              {unconfirmed
                ? `Aqua cannot verify ${unconfirmedMinutes ? `${unconfirmedMinutes} minute${unconfirmedMinutes === 1 ? "" : "s"}` : "the latest part"} of this session. You may still be working; tell it what is happening so your timesheet and Advisor stay honest.`
                : "Choose the activity that should be accountable from this point. Aqua records interaction, not keystrokes or screen contents."}
            </p>

            <div className="mm-smart-clock-choice-grid" role="group" aria-label="Current work status">
              <ModeButton active={choice === "aqua"} icon={<Laptop size={16} />} label="Working in Aqua" detail="Interaction monitored" onClick={() => setChoice("aqua")} />
              <ModeButton active={choice === "external"} icon={<BriefcaseBusiness size={16} />} label="Working elsewhere" detail="Declare the task" onClick={() => setChoice("external")} />
              <ModeButton active={choice === "break"} icon={<Coffee size={16} />} label="Taking a break" detail="Exclude from work" onClick={() => setChoice("break")} />
            </div>

            {(choice === "external" || choice === "aqua") ? (
              <label className="mm-smart-clock-field">
                <span>{choice === "external" ? "What are you working on?" : "Current focus (optional)"}</span>
                <input value={focus} onChange={event => setFocus(event.target.value)} autoFocus={choice === "external"} maxLength={180} placeholder={choice === "external" ? "Editing the client site, on a call, filming..." : "The result you are moving forward"} />
              </label>
            ) : null}

            {choice !== "aqua" ? (
              <div className="mm-smart-clock-field">
                <span>Check back in</span>
                <div className="mm-smart-clock-duration" role="group" aria-label="Next work check-in">
                  {[15, 30, 60, 90].map(minutes => <button key={minutes} type="button" aria-pressed={checkInMinutes === minutes} onClick={() => setCheckInMinutes(minutes)}>{minutes}m</button>)}
                </div>
              </div>
            ) : null}

            <label className="mm-smart-clock-field">
              <span>Context for the record (optional)</span>
              <textarea value={note} onChange={event => setNote(event.target.value)} rows={2} maxLength={500} placeholder="Anything the Advisor should understand later" />
            </label>

            <div className="mm-smart-clock-evidence" aria-label="Current accountable time">
              <EvidenceStat icon={<Laptop size={13} />} label="Aqua" value={formatDuration(session.aquaActiveMs)} />
              <EvidenceStat icon={<BriefcaseBusiness size={13} />} label="External" value={formatDuration(session.externalWorkMs)} />
              <EvidenceStat icon={<Pause size={13} />} label="Break" value={formatDuration(session.breakMs)} />
              <EvidenceStat icon={<TimerReset size={13} />} label="Unconfirmed" value={formatDuration(session.unconfirmedIdleMs)} attention={unconfirmedMinutes > 0} />
            </div>

            {error ? <p role="alert" className="mm-smart-clock-error">{error}</p> : null}
            <div className="mm-smart-clock-actions">
              <button type="button" disabled={busy} onClick={() => void resolveActivity(choice)} className="mm-smart-clock-primary">
                {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}
                Confirm status
              </button>
              <button type="button" disabled={busy} onClick={requestClockOutReview} className="mm-smart-clock-secondary"><Square size={14} />Review & clock out</button>
              {unconfirmed ? <button type="button" disabled={busy} onClick={remindLater} className="mm-smart-clock-tertiary"><Clock3 size={14} />Ask in 5m</button> : null}
              {notificationPermission === "default" ? <button type="button" disabled={busy} onClick={() => void enableDesktopPings()} className="mm-smart-clock-tertiary"><BellRing size={14} />Enable desktop pings</button> : null}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}

function ModeButton({ active, icon, label, detail, onClick }: { active: boolean; icon: React.ReactNode; label: string; detail: string; onClick: () => void }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={active ? "is-active" : ""}><span>{icon}</span><strong>{label}</strong><small>{detail}</small></button>;
}

function EvidenceStat({ icon, label, value, attention = false }: { icon: React.ReactNode; label: string; value: string; attention?: boolean }) {
  return <div className={attention ? "is-attention" : ""}><span>{icon}{label}</span><strong>{value}</strong></div>;
}

function workModeLabel(mode: DashboardWorkActivityMode): string {
  if (mode === "aqua") return "Active in Aqua";
  if (mode === "external") return "External work";
  if (mode === "break") return "On a break";
  return "Unconfirmed time";
}

function formatElapsed(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60_000));
  return `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

function formatDuration(value = 0): string {
  const totalMinutes = Math.max(0, Math.round(value / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function localDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function firstNameFrom(value?: string): string {
  return value?.trim().split(/\s+/)[0] || "there";
}
