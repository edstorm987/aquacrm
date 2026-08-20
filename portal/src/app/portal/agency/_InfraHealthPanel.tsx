import { Database, HardDrive } from "lucide-react";

import type { RadarInfraDatabaseHealth, RadarInfraHealthSnapshot, RadarInfraProbeStatus } from "@/engines/data/radar/businessRadar";

// Database & storage health card (radar upgrade Stage 4, Part D §3).
// Placement: Command Centre (systems), inside the executive Radar feed.
// Renders the latest Infra sweep snapshot honestly — a down/slow DB reads red,
// an un-probed backend reads "untested" (never a fake green), and storage bytes
// are shown as "not available in-app" rather than faked.

function statusTone(status: RadarInfraProbeStatus): string {
  if (status === "connected") return "border-[#68f5d0]/25 bg-[#68f5d0]/[0.06] text-[#91f4dc]";
  if (status === "down") return "border-red-300/30 bg-red-400/10 text-red-200";
  return "border-white/12 bg-white/[0.04] text-white/45"; // untested
}

function statusLabel(status: RadarInfraProbeStatus): string {
  return status === "connected" ? "Connected" : status === "down" ? "Down" : "Untested";
}

function latencyTone(latencyMs: number | null): string {
  if (latencyMs === null) return "text-white/40";
  if (latencyMs >= 1000) return "text-red-200";
  if (latencyMs >= 500) return "text-amber-200";
  return "text-white/70";
}

function DatabaseRow({ db }: { db: RadarInfraDatabaseHealth }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <strong className="truncate text-xs text-white/82">{db.label}</strong>
          {db.external ? <span className="border border-white/12 px-1 py-0.5 text-[8px] font-semibold uppercase text-white/40">External</span> : null}
        </div>
        <p className="mt-0.5 truncate text-[10px] text-white/38">
          {db.backend}
          {db.status === "down" && db.error ? ` · ${db.error}` : ""}
          {db.rowCounts ? ` · ${Object.entries(db.rowCounts).map(([table, count]) => `${table} ${count}`).join(" · ")}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className={`text-[10px] font-semibold tabular-nums ${latencyTone(db.latencyMs)}`}>{db.latencyMs === null ? "—" : `${db.latencyMs}ms`}</span>
        <span className={`border px-1.5 py-0.5 text-[8px] font-semibold uppercase ${statusTone(db.status)}`}>{statusLabel(db.status)}</span>
      </div>
    </div>
  );
}

export function InfraHealthPanel({ infra }: { infra?: RadarInfraHealthSnapshot }) {
  return (
    <section aria-label="Database and storage health" className="border-t border-white/10 px-4 py-4 sm:px-6">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center border border-[#62e8ff]/25 bg-[#62e8ff]/[0.07] text-[#62e8ff]"><Database size={14} /></span>
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase text-[#62e8ff]/60">Infra sweep</p>
          <h3 className="mt-1 text-sm font-semibold text-white">Database &amp; storage health</h3>
        </div>
      </div>

      {!infra ? (
        <p className="mt-3 text-[11px] text-white/40">The Infra sweep has not run yet. Database reachability, latency and storage health populate on the next scheduled or full scan.</p>
      ) : (
        <>
          <div className="mt-3 divide-y divide-white/10 border-y border-white/10">
            <DatabaseRow db={infra.primary} />
            {infra.external.map(db => <DatabaseRow key={db.id} db={db} />)}
          </div>
          <div className="mt-3 flex items-start gap-2 text-[10px] text-white/38">
            <HardDrive size={12} className="mt-0.5 shrink-0 text-white/30" />
            <span>{infra.storage.measurable ? `Storage on ${infra.storage.backend}: ${infra.storage.bucketBytes ?? "unknown"} bytes.` : infra.storage.note}</span>
          </div>
        </>
      )}
    </section>
  );
}
