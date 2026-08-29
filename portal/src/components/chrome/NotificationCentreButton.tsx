"use client";

import Link from "next/link";
import { Bell, Check, CheckCheck, ChevronRight, Clock3, RotateCcw, ShieldCheck, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useNotificationAttention } from "@/components/chrome/NotificationAttentionProvider";
import { formatUkDate } from "@/lib/shared/formatDateTime";
import type { OperationalAlertView } from "@/lib/intelligence/operationalAttention";
import {
  LATEST_RELEASE,
  RELEASE_SEEN_EVENT,
  RELEASE_STORAGE_KEY,
  formatReleaseDate,
} from "@/lib/projects/releases";

type CentreView = "attention" | "parked" | "read";

export function NotificationCentreButton({
  includeProductUpdates = true,
  updatesHref = "/portal/agency/settings#updates",
}: {
  includeProductUpdates?: boolean;
  updatesHref?: string;
} = {}) {
  const attention = useNotificationAttention();
  const alerts = attention?.alerts ?? [];
  const attentionWindow = attention?.attentionWindow;
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<CentreView>("attention");
  const [updateUnread, setUpdateUnread] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const syncReleaseState = () => {
      setUpdateUnread(includeProductUpdates && window.localStorage.getItem(RELEASE_STORAGE_KEY) !== LATEST_RELEASE.version);
    };
    syncReleaseState();
    window.addEventListener(RELEASE_SEEN_EVENT, syncReleaseState);
    return () => window.removeEventListener(RELEASE_SEEN_EVENT, syncReleaseState);
  }, [includeProductUpdates]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const groups = useMemo(() => ({
    attention: attentionWindow?.focus ?? alerts.filter(alert => alert.attention),
    parked: alerts.filter(alert => alert.state === "parked"),
    read: alerts.filter(alert => alert.state === "read"),
  }), [alerts, attentionWindow]);
  const visible = groups[view];
  const attentionTotal = attentionWindow?.total ?? groups.attention.length;
  const reserveCount = attentionWindow?.reserveCount ?? 0;
  const unread = groups.attention.length + (updateUnread ? 1 : 0);
  const display = unread > 99 ? "99+" : String(unread);

  function markReleaseRead() {
    window.localStorage.setItem(RELEASE_STORAGE_KEY, LATEST_RELEASE.version);
    window.dispatchEvent(new Event(RELEASE_SEEN_EVENT));
    setUpdateUnread(false);
  }

  function toggleNotifications() {
    if (!open) void attention?.refreshAlerts();
    setOpen(value => !value);
  }

  return (
    <div ref={rootRef} className="mm-has-attention-badge relative overflow-visible">
      <button
        type="button"
        aria-label={`Notifications, ${groups.attention.length} in focus${reserveCount ? ` and ${reserveCount} safely held in reserve` : ""}${updateUnread ? ", plus one product update" : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Notifications"
        onClick={toggleNotifications}
        className="relative grid size-9 place-items-center rounded-md border border-black/10 bg-white text-black/60 shadow-sm transition hover:border-black/20 hover:bg-black/[0.025]"
      >
        <Bell size={16} aria-hidden="true" />
        {unread > 0 ? (
          <span className="mm-attention-badge absolute -right-1.5 -top-1.5 z-10 grid min-h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[9px] font-semibold leading-none text-white ring-2 ring-white">
            {display}
          </span>
        ) : null}
      </button>

      {open ? (
        <section
          data-chrome-surface
          role="dialog"
          aria-label="Notification centre"
          className="mm-popover mm-notification-centre fixed right-3 top-14 z-50 flex max-h-[min(42rem,calc(100dvh-4.5rem))] w-[min(29rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-lg border border-black/10 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.18)] sm:absolute sm:right-0 sm:top-11"
        >
          <header className="flex items-center justify-between border-b border-black/10 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-black/85">{attentionWindow?.protected ? "Attention shield" : "Notifications"}</h2>
              <p className="mt-0.5 text-[11px] text-black/45">{attentionWindow?.protected ? `${groups.attention.length} in focus · ${reserveCount} safely held · nothing discarded.` : "Every signal keeps its destination and explanation."}</p>
            </div>
            {unread === 0 ? <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700"><Check size={12} />Up to date</span> : null}
          </header>

          <nav aria-label="Notification views" className="grid grid-cols-3 border-b border-black/10 px-3 pt-2">
            <CentreTab active={view === "attention"} label="Attention" count={attentionTotal} onClick={() => setView("attention")} />
            <CentreTab active={view === "parked"} label="Parked" count={groups.parked.length} onClick={() => setView("parked")} />
            <CentreTab active={view === "read"} label="Read" count={groups.read.length} onClick={() => setView("read")} />
          </nav>

          {view === "attention" && attentionWindow?.protected ? <AttentionShieldSummary window={attentionWindow} onNavigate={() => setOpen(false)} /> : null}

          <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-black/[0.07]">
            {visible.map(alert => (
              <NotificationRow
                key={alert.id}
                alert={alert}
                busy={attention?.isAlertBusy(alert.id) ?? false}
                onAction={(action, parkedUntil) => attention?.updateAlert(alert.id, action, parkedUntil) ?? Promise.resolve(false)}
                onNavigate={() => {
                  if (alert.attention) void attention?.updateAlert(alert.id, "read");
                  setOpen(false);
                }}
              />
            ))}
            {!visible.length ? <EmptyNotifications view={view} /> : null}
          </div>

          {attention?.error ? <p role="alert" className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{attention.error}</p> : null}

          {includeProductUpdates ? <Link
            href={updatesHref}
            onClick={() => { markReleaseRead(); setOpen(false); }}
            className="mm-notification-release group flex shrink-0 items-center gap-3 border-t border-black/10 bg-black/[0.018] px-4 py-3 transition hover:bg-black/[0.035]"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-700"><Sparkles size={15} aria-hidden /></span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2"><strong className="text-xs font-semibold text-black/70">AquaCRM {LATEST_RELEASE.version}</strong>{updateUnread ? <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-[9px] font-semibold uppercase text-white">New</span> : null}</span>
              <span className="mt-0.5 block truncate text-[11px] text-black/45">{LATEST_RELEASE.title} · {formatReleaseDate(LATEST_RELEASE.releasedAt)}</span>
            </span>
            <ChevronRight size={14} className="text-black/25" aria-hidden />
          </Link> : null}
        </section>
      ) : null}
    </div>
  );
}

function CentreTab({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`relative min-h-9 text-xs font-semibold ${active ? "text-black/80" : "text-black/40 hover:text-black/65"}`}>{label} <span className="ml-1 tabular-nums">{count}</span>{active ? <span className="mm-notification-tab-indicator absolute inset-x-2 bottom-0 h-0.5 bg-black" /> : null}</button>;
}

function AttentionShieldSummary({ window, onNavigate }: { window: NonNullable<ReturnType<typeof useNotificationAttention>>["attentionWindow"]; onNavigate: () => void }) {
  return <section className="mm-attention-shield-summary border-b border-emerald-200/70 bg-emerald-50/55 px-4 py-3" aria-label="Attention overload protection">
    <div className="flex items-start gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-emerald-100 text-emerald-800"><ShieldCheck size={15} /></span>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-xs font-semibold text-emerald-950">Overload protection is active</strong><span className="text-[9px] font-semibold uppercase text-emerald-800">{window.level}</span></div><p className="mt-1 text-[11px] leading-4 text-emerald-950/58">Work through this five-item window. As an item is resolved, parked or dismissed, the next highest-priority signal promotes automatically.</p></div>
    </div>
    {window.reserveDestinations.length ? <div className="mt-3 flex flex-wrap gap-1.5">{window.reserveDestinations.map(group => <Link key={group.key} href={group.href} onClick={onNavigate} title={`Open ${group.label}: ${group.count} held ${group.count === 1 ? "item" : "items"}`} className="inline-flex min-h-7 items-center gap-1.5 rounded-md border border-emerald-900/10 bg-white/75 px-2 text-[10px] font-semibold text-emerald-950/62 hover:bg-white"><span>{group.label}</span><span className="tabular-nums text-emerald-800">{group.count}</span></Link>)}</div> : null}
  </section>;
}

function NotificationRow({
  alert,
  busy,
  onAction,
  onNavigate,
}: {
  alert: OperationalAlertView;
  busy: boolean;
  onAction: (action: "read" | "unread" | "park" | "dismiss", parkedUntil?: number) => Promise<boolean>;
  onNavigate: () => void;
}) {
  const tone = alert.severity === "critical" ? "bg-red-50 text-red-700" : alert.severity === "warning" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700";
  return (
    <article title={`${alert.title}\n${alert.detail}`} className="mm-notification-row px-4 py-3.5 transition hover:bg-black/[0.018]">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-md ${tone}`}><Bell size={15} aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link href={alert.href} onClick={onNavigate} className="min-w-0 flex-1 hover:underline hover:decoration-black/20 hover:underline-offset-2">
              <strong className="block text-sm font-semibold leading-5 text-black/78">{alert.title}</strong>
            </Link>
            <span className="shrink-0 rounded-full bg-black/[0.045] px-2 py-0.5 text-[9px] font-semibold uppercase text-black/45">{alert.category}</span>
          </div>
          <p className="mt-1 text-xs leading-5 text-black/48">{alert.detail}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button type="button" disabled={busy} onClick={() => void onAction(alert.state === "read" ? "unread" : "read")} title={alert.state === "read" ? "Mark unread" : "Mark read"} aria-label={alert.state === "read" ? "Mark unread" : "Mark read"} className="grid size-8 place-items-center rounded-md border border-black/10 text-black/45 hover:bg-black/[0.04] disabled:opacity-40">
              {alert.state === "read" ? <RotateCcw size={14} /> : <CheckCheck size={14} />}
            </button>
            <ParkMenu disabled={busy} onPark={parkedUntil => void onAction("park", parkedUntil)} />
            <button type="button" disabled={busy} onClick={() => void onAction("dismiss")} title="Dismiss until this issue changes" aria-label="Dismiss notification" className="grid size-8 place-items-center rounded-md border border-black/10 text-black/45 hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"><X size={14} /></button>
            <span className="ml-auto text-[10px] text-black/35">{alert.state === "parked" && alert.parkedUntil ? `Returns ${formatReturnTime(alert.parkedUntil)}` : formatOccurredAt(alert.occurredAt)}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function ParkMenu({ disabled, onPark }: { disabled: boolean; onPark: (until: number) => void }) {
  const now = Date.now();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return (
    <details className="group/park relative">
      <summary title="Park for later" aria-label="Park notification for later" className={`grid size-8 cursor-pointer list-none place-items-center rounded-md border border-black/10 text-black/45 hover:bg-black/[0.04] [&::-webkit-details-marker]:hidden ${disabled ? "pointer-events-none opacity-40" : ""}`}><Clock3 size={14} /></summary>
      <div className="absolute left-0 top-9 z-20 w-36 overflow-hidden rounded-md border border-black/10 bg-white py-1 shadow-lg">
        <ParkOption label="For 1 hour" onClick={() => onPark(now + 60 * 60 * 1000)} />
        <ParkOption label="Until tomorrow" onClick={() => onPark(tomorrow.getTime())} />
        <ParkOption label="For 7 days" onClick={() => onPark(now + 7 * 24 * 60 * 60 * 1000)} />
      </div>
    </details>
  );
}

function ParkOption({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="block min-h-8 w-full px-3 text-left text-xs text-black/60 hover:bg-black/[0.04] hover:text-black">{label}</button>;
}

function EmptyNotifications({ view }: { view: CentreView }) {
  const copy = view === "attention" ? "Nothing currently needs your attention." : view === "parked" ? "No notifications are parked." : "No notifications have been marked read.";
  return <div className="px-5 py-10 text-center"><span className="mx-auto grid size-9 place-items-center rounded-full bg-emerald-50 text-emerald-700"><Check size={16} /></span><p className="mt-3 text-xs text-black/45">{copy}</p></div>;
}

function formatOccurredAt(value: number): string {
  return formatUkDate(value, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatReturnTime(value: number): string {
  return formatUkDate(value, { weekday: "short", hour: "2-digit", minute: "2-digit" });
}
