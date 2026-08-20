"use client";

import { AlertTriangle, Check, LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { formatUkDate } from "@/lib/shared/formatDateTime";

type RadarScanResponse = {
  ok?: boolean;
  error?: string;
  radar?: { generatedAt?: number };
};

export function RadarScanControl({ initialLastRunAt, criticalCount }: { initialLastRunAt?: number; criticalCount: number }) {
  const router = useRouter();
  const [lastRun, setLastRun] = useState<number | null>(initialLastRunAt ?? null);
  const [now, setNow] = useState(initialLastRunAt ?? 0);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function runFullScan() {
    setBusy(true);
    setCompleted(false);
    setError("");
    try {
      const response = await fetch("/api/portal/advisor/radar", { method: "POST", cache: "no-store" });
      const result = await response.json().catch(() => null) as RadarScanResponse | null;
      if (!response.ok || !result?.ok || !result.radar) {
        throw new Error(result?.error || "The full Radar scan could not complete.");
      }
      const generatedAt = result.radar.generatedAt ?? Date.now();
      setLastRun(generatedAt);
      setNow(Date.now());
      setCompleted(true);
      router.refresh();
      window.setTimeout(() => setCompleted(false), 4_000);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "The full Radar scan could not complete.");
    } finally {
      setBusy(false);
    }
  }

  const critical = criticalCount > 0;

  return <div className="flex shrink-0 items-stretch border border-[#62e8ff]/18 bg-[#020b11]/76" aria-label="Radar scan control">
    <div className="hidden min-w-[154px] border-r border-[#62e8ff]/14 px-3 py-1.5 text-right sm:block">
      <p className="text-[7px] font-semibold uppercase text-[#8ec9d5]/42">Last full scan</p>
      <p className="mt-0.5 text-[9px] font-semibold tabular-nums text-white/72" title={lastRun ? formatFullDate(lastRun) : "No completed full scan yet"}>{lastRun ? `${formatCompactDate(lastRun)} · ${formatAge(lastRun, now)}` : "Never · Run one now"}</p>
    </div>
    <button
      type="button"
      onClick={() => void runFullScan()}
      disabled={busy}
      title={error || "Force synthetic probes, rebuild every Radar check, and record fresh evidence"}
      className={`inline-flex min-h-10 items-center justify-center gap-2 px-3 text-[8px] font-semibold uppercase transition disabled:cursor-wait disabled:opacity-65 ${error ? "bg-red-500/12 text-red-300" : critical ? "bg-red-500/10 text-red-300 hover:bg-red-500/18" : "bg-[#62e8ff]/[0.06] text-[#68f5d0] hover:bg-[#62e8ff]/[0.12]"}`}
    >
      {busy ? <LoaderCircle size={13} className="animate-spin" /> : completed ? <Check size={13} /> : error ? <AlertTriangle size={13} /> : <RefreshCw size={13} />}
      <span>{busy ? "Scanning all systems" : completed ? "Scan complete" : error ? "Scan failed · Retry" : "Run full scan"}</span>
    </button>
    <span className="sr-only" role={error ? "alert" : "status"} aria-live="polite">{error || (completed && lastRun ? `Full Radar scan completed at ${formatFullDate(lastRun)}` : "")}</span>
  </div>;
}

function formatCompactDate(timestamp: number): string {
  return formatUkDate(timestamp, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function formatFullDate(timestamp: number): string {
  return formatUkDate(timestamp, { dateStyle: "medium", timeStyle: "long" });
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
