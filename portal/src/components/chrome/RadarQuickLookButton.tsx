"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Database, LoaderCircle, Radar, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { radarDigest, type AdvisorRadarDigest, type BusinessIssueRadar } from "@/engines/data/radar/businessRadar";

export function RadarQuickLookButton({ initialRadar, paused = false }: { initialRadar: AdvisorRadarDigest; paused?: boolean }) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [radarSnapshot, setRadarSnapshot] = useState(initialRadar);
  const [radarPaused, setRadarPaused] = useState(paused);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    // A newer lightweight placeholder must not erase a real scan completed in
    // this mounted control after an RSC refresh.
    if (paused && !radarPaused) return;
    if (initialRadar.generatedAt >= radarSnapshot.generatedAt) {
      setRadarSnapshot(initialRadar);
      setRadarPaused(paused);
    }
  }, [initialRadar, paused, radarPaused, radarSnapshot.generatedAt]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const attentionCount = radarSnapshot.critical + radarSnapshot.warning;
  const observablePercent = radarSnapshot.applicableChecks
    ? Math.round((radarSnapshot.applicableChecks - radarSnapshot.blindChecks) / radarSnapshot.applicableChecks * 100)
    : 0;
  const incidents = useMemo(() => radarSnapshot.topIncidents
    .filter(incident => incident.severity === "critical" || incident.severity === "warning")
    .slice(0, 3), [radarSnapshot.topIncidents]);
  const lastUpdatedAt = radarSnapshot.generatedAt;

  async function runFullScan() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/portal/advisor/radar", { method: "POST", cache: "no-store" });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; radar?: BusinessIssueRadar } | null;
      if (!response.ok || !result?.ok || !result.radar) throw new Error(result?.error || `Radar scan failed (${response.status}).`);
      setRadarSnapshot(radarDigest(result.radar));
      setRadarPaused(false);
      setNow(Date.now());
      window.dispatchEvent(new CustomEvent("aqua-radar:updated", { detail: { radar: result.radar } }));
      router.refresh();
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Radar scan could not complete.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className="mm-has-attention-badge relative overflow-visible">
      <button
        type="button"
        aria-label={radarPaused ? "Business Radar paused; run a scan to load current results" : attentionCount ? `Business Radar, ${attentionCount} alerts need attention` : "Business Radar, no current alerts"}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Business Radar"
        onClick={() => setOpen(value => !value)}
        className="relative grid size-9 place-items-center rounded-md border border-black/10 bg-white text-black/60 shadow-sm transition hover:border-black/20 hover:bg-black/[0.025]"
      >
        <Radar size={16} aria-hidden="true" />
        {attentionCount > 0 ? (
          <span className="mm-attention-badge absolute -right-1.5 -top-1.5 z-10 grid min-h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[9px] font-semibold leading-none text-white ring-2 ring-white" aria-hidden="true">
            {attentionCount > 99 ? "99+" : attentionCount}
          </span>
        ) : radarPaused ? (
          <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-amber-400 ring-2 ring-white" aria-hidden="true" />
        ) : (
          <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-emerald-500 ring-2 ring-white" aria-hidden="true" />
        )}
      </button>

      {open ? (
        <section
          role="dialog"
          aria-label="Business Radar quick look"
          className="mm-popover mm-radar-popover fixed right-3 top-14 z-50 flex max-h-[min(42rem,calc(100dvh-4.5rem))] w-[min(29rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-lg border border-black/10 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.2)] sm:absolute sm:right-0 sm:top-11"
        >
          <header className="flex items-start justify-between gap-4 border-b border-white/10 bg-[#07171d] px-4 py-3 text-white">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center border border-cyan-300/25 bg-cyan-300/10 text-cyan-200"><Radar size={17} aria-hidden="true" /></span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">Business Radar</h2>
                <p className="mt-0.5 text-[11px] text-white/55">Current watch · updated {formatAge(lastUpdatedAt, now)}</p>
              </div>
            </div>
            <span className={`inline-flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase ${radarPaused ? "text-amber-200" : attentionCount ? "text-red-300" : "text-emerald-300"}`}>
              {radarPaused || attentionCount ? <AlertTriangle size={12} aria-hidden="true" /> : <CheckCircle2 size={12} aria-hidden="true" />}
              {radarPaused ? "Paused" : attentionCount ? `${attentionCount} alerts` : "Clear"}
            </span>
          </header>

          <div className="grid grid-cols-2 gap-px border-b border-black/10 bg-black/10 sm:grid-cols-4" aria-label="Radar summary">
            <RadarMetric href="/portal/agency/radar?view=kpis" label="Health" value={`${radarSnapshot.adaptive.healthScore}/100`} tone={radarSnapshot.adaptive.healthScore < 40 ? "critical" : "normal"} />
            <RadarMetric href="/portal/agency/radar?view=kpis" label="Confidence" value={`${radarSnapshot.adaptive.confidencePercent}%`} />
            <RadarMetric href="/portal/agency/radar?view=checks" label="Readiness" value={`${radarSnapshot.adaptive.readinessPercent}%`} />
            <RadarMetric href="/portal/agency/radar?view=checks" label="Observable" value={`${observablePercent}%`} tone={radarSnapshot.blindChecks ? "warning" : "normal"} />
          </div>

          <div className="flex items-center justify-between gap-3 border-b border-black/10 px-4 py-2.5 text-[11px]">
            <span className="inline-flex items-center gap-2 font-medium text-black/58"><ShieldCheck size={14} className="text-emerald-700" aria-hidden="true" />{radarSnapshot.totalChecks.toLocaleString()} checks active</span>
            <Link href="/portal/agency/radar?view=sources" onClick={() => setOpen(false)} className="inline-flex items-center gap-1 font-semibold text-black/55 hover:text-black">{radarSnapshot.connectedSources}/{radarSnapshot.totalSources} sources <ArrowUpRight size={12} /></Link>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between px-4 pb-2 pt-3">
              <p className="text-[10px] font-semibold uppercase text-black/45">Priority contacts</p>
              <span className="text-[10px] text-black/38">Top {incidents.length}</span>
            </div>
            <div className="divide-y divide-black/[0.07]">
              {incidents.map(incident => (
                <Link key={incident.id} href={`/portal/agency/radar?view=incidents&domain=${incident.domain}&query=${encodeURIComponent(incident.id)}`} onClick={() => setOpen(false)} className="mm-radar-incident group flex items-start gap-3 px-4 py-3 hover:bg-black/[0.02]">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${incident.severity === "critical" ? "bg-red-600" : "bg-amber-500"}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1"><strong className="block text-xs font-semibold leading-5 text-black/75">{incident.title}</strong><span className="mt-0.5 block line-clamp-2 text-[11px] leading-4 text-black/45">{incident.detail}</span></span>
                  <ArrowUpRight size={13} className="mt-1 shrink-0 text-black/25 group-hover:text-black/55" aria-hidden="true" />
                </Link>
              ))}
              {!incidents.length ? <div className="px-5 py-8 text-center">{radarPaused ? <Radar className="mx-auto text-amber-600" size={22} /> : <CheckCircle2 className="mx-auto text-emerald-600" size={22} />}<p className="mt-2 text-xs font-semibold text-black/65">{radarPaused ? "Radar scan paused" : "No critical or warning contacts"}</p><p className="mt-1 text-[11px] text-black/42">{radarPaused ? "Run a full scan to load current evidence and incidents." : "Learning and evidence gaps remain available in the full workspace."}</p></div> : null}
            </div>
          </div>

          {error ? <p role="alert" className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</p> : null}

          <footer className="grid grid-cols-2 gap-2 border-t border-black/10 bg-black/[0.018] p-3">
            <button type="button" onClick={() => void runFullScan()} disabled={busy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65 hover:bg-black/[0.03] disabled:opacity-50">
              {busy ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />} {busy ? "Scanning" : "Run full scan"}
            </button>
            <Link href="/portal/agency/radar" onClick={() => setOpen(false)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/85"><Database size={14} /> Open Radar</Link>
          </footer>
        </section>
      ) : null}
    </div>
  );
}

function RadarMetric({ href, label, value, tone = "normal" }: { href: string; label: string; value: string; tone?: "normal" | "warning" | "critical" }) {
  const valueClass = tone === "critical" ? "text-red-700" : tone === "warning" ? "text-amber-700" : "text-black/78";
  return <Link href={href} className="mm-radar-metric min-h-16 bg-white px-3 py-2.5 hover:bg-black/[0.02]"><span className="block text-[9px] font-semibold uppercase text-black/40">{label}</span><strong className={`mt-1 block text-sm tabular-nums ${valueClass}`}>{value}</strong></Link>;
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
