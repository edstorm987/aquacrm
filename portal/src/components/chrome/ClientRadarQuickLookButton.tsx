"use client";

import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CheckCircle2, EyeOff, LoaderCircle, Radar, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ClientRadarSnapshot } from "@/engines/data/radar/businessRadar";
import { clientWorkspaceHref } from "@/lib/clients/clientWorkspace";

export function ClientRadarQuickLookButton({ initialRadar }: { initialRadar: ClientRadarSnapshot }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [radar, setRadar] = useState(initialRadar);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const attentionCount = radar.totals.critical + radar.totals.warning + radar.totals.watch;
  const issues = useMemo(() => radar.issues.slice(0, 3), [radar.issues]);
  const radarHref = `${clientWorkspaceHref(radar.clientId, "overview")}#client-radar`;

  useEffect(() => {
    if (initialRadar.generatedAt >= radar.generatedAt) setRadar(initialRadar);
  }, [initialRadar, radar.generatedAt]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    window.addEventListener("mousedown", closeOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("mousedown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  async function refreshClient() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/portal/clients/${encodeURIComponent(radar.clientId)}/radar`, { method: "POST", cache: "no-store" });
      const payload = await response.json().catch(() => null) as { ok?: boolean; radar?: ClientRadarSnapshot; error?: string } | null;
      if (!response.ok || !payload?.ok || !payload.radar) throw new Error(payload?.error || "Client Radar could not refresh.");
      setRadar(payload.radar);
      setNow(Date.now());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Client Radar could not refresh.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className="mm-has-attention-badge relative overflow-visible">
      <button
        type="button"
        aria-label={attentionCount ? `${radar.clientName} Radar, ${attentionCount} checks need attention` : `${radar.clientName} Radar is clear`}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={`${radar.clientName} Radar`}
        onClick={() => setOpen(value => !value)}
        className="relative grid size-9 place-items-center rounded-md border border-black/10 bg-white text-black/60 shadow-sm transition hover:border-black/20 hover:bg-black/[0.025]"
      >
        <Radar size={16} aria-hidden="true" />
        {attentionCount ? <span className="mm-attention-badge absolute -right-1.5 -top-1.5 z-10 grid min-h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[9px] font-semibold leading-none text-white ring-2 ring-white">{attentionCount > 99 ? "99+" : attentionCount}</span> : <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-emerald-500 ring-2 ring-white" />}
      </button>

      {open ? <section data-chrome-surface role="dialog" aria-label={`${radar.clientName} Radar quick look`} className="mm-popover mm-radar-popover fixed right-3 top-14 z-50 flex max-h-[min(42rem,calc(100dvh-4.5rem))] w-[min(29rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-lg border border-black/10 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.2)] sm:absolute sm:right-0 sm:top-11">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 bg-[#0e2946] px-4 py-3 text-white">
          <div className="flex min-w-0 items-start gap-3"><span className="grid size-9 shrink-0 place-items-center border border-cyan-200/25 bg-cyan-200/10 text-cyan-100"><Radar size={17} /></span><div className="min-w-0"><h2 className="truncate text-sm font-semibold">{radar.clientName} Radar</h2><p className="mt-0.5 text-[11px] text-white/55">Client watch · updated {formatAge(radar.generatedAt, now)}</p></div></div>
          <span className={`inline-flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase ${attentionCount ? "text-red-200" : "text-emerald-200"}`}>{attentionCount ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}{attentionCount ? `${attentionCount} alerts` : "Clear"}</span>
        </header>

        <div className="grid grid-cols-2 gap-px border-b border-black/10 bg-black/10 sm:grid-cols-4">
          <ClientMetric href={radarHref} label="Health" value={radar.healthScore === null ? "Learning" : `${radar.healthScore}/100`} tone={radar.healthState === "risk" ? "critical" : "normal"} />
          <ClientMetric href={radarHref} label="Confidence" value={`${radar.confidencePercent}%`} />
          <ClientMetric href={radarHref} label="Readiness" value={`${radar.readinessPercent}%`} />
          <ClientMetric href={radarHref} label="Blind" value={String(radar.totals.blind)} tone={radar.totals.blind ? "warning" : "normal"} />
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-black/10 px-4 py-2.5 text-[11px]"><span className="inline-flex items-center gap-2 font-medium text-black/58"><ShieldCheck size={14} className="text-emerald-700" />{radar.totals.live} applicable checks</span><span className="inline-flex items-center gap-1 font-semibold text-black/48"><EyeOff size={13} />{radar.totals.blind} blind</span></div>

        <div className="min-h-0 flex-1 overflow-y-auto"><div className="flex items-center justify-between px-4 pb-2 pt-3"><p className="text-[10px] font-semibold uppercase text-black/45">Exact client findings</p><span className="text-[10px] text-black/38">Top {issues.length}</span></div><div className="divide-y divide-black/[0.07]">
          {issues.map(issue => <Link key={issue.id} href={issue.href} onClick={() => setOpen(false)} className="group flex items-start gap-3 px-4 py-3 hover:bg-black/[0.02]"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${issue.severity === "critical" ? "bg-red-600" : issue.severity === "warning" ? "bg-amber-500" : "bg-sky-500"}`} /><span className="min-w-0 flex-1"><strong className="block text-xs font-semibold leading-5 text-black/75">{issue.title}</strong><span className="mt-0.5 block line-clamp-2 text-[11px] leading-4 text-black/45">{issue.detail}</span></span><ArrowUpRight size={13} className="mt-1 shrink-0 text-black/25 group-hover:text-black/55" /></Link>)}
          {!issues.length ? <div className="px-5 py-8 text-center"><CheckCircle2 className="mx-auto text-emerald-600" size={22} /><p className="mt-2 text-xs font-semibold text-black/65">No exact finding needs attention</p><p className="mt-1 text-[11px] text-black/42">Blind and learning checks remain visible in the client ledger.</p></div> : null}
        </div></div>

        {error ? <p role="alert" className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</p> : null}
        <footer className="grid grid-cols-2 gap-2 border-t border-black/10 bg-black/[0.018] p-3"><button type="button" onClick={() => void refreshClient()} disabled={busy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65 hover:bg-black/[0.03] disabled:opacity-50">{busy ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />}{busy ? "Refreshing" : "Refresh client"}</button><Link href={radarHref} onClick={() => setOpen(false)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#112f50] px-3 text-xs font-semibold text-white hover:bg-[#173c64]"><Radar size={14} /> Inspect client</Link></footer>
      </section> : null}
    </div>
  );
}

function ClientMetric({ href, label, value, tone = "normal" }: { href: string; label: string; value: string; tone?: "normal" | "warning" | "critical" }) {
  const valueClass = tone === "critical" ? "text-red-700" : tone === "warning" ? "text-amber-700" : "text-black/78";
  return <Link href={href} className="min-h-16 bg-white px-3 py-2.5 hover:bg-black/[0.02]"><span className="block text-[9px] font-semibold uppercase text-black/40">{label}</span><strong className={`mt-1 block truncate text-sm tabular-nums ${valueClass}`}>{value}</strong></Link>;
}

function formatAge(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1_000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
