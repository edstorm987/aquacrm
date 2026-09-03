"use client";

import Link from "next/link";
import { ArrowUpRight, Building2, CircleSlash, LoaderCircle, LockKeyhole, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { PersonalRadarPanel } from "@/components/intelligence/PersonalRadarPanel";
import type { MyRadarTopbarSnapshot } from "@/components/chrome/MyRadarButton";

// One authenticated read model feeds this popover. Actions, goals, wellbeing
// and workload arrive together, all scoped to the session user. A failed
// refresh keeps the server-rendered snapshot instead of drawing false zeroes.
export function MyRadarQuickLookPanel({
  activeDepartment: _activeDepartment,
  staffWorkspace,
  businessRadarAvailable,
  snapshot,
  onSnapshot,
  onClose,
}: {
  activeDepartment?: string;
  staffWorkspace: boolean;
  businessRadarAvailable: boolean;
  snapshot?: MyRadarTopbarSnapshot;
  onSnapshot: (snapshot: MyRadarTopbarSnapshot) => void;
  onClose: () => void;
}) {
  const [noAccess, setNoAccess] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/portal/intelligence/my-radar", { cache: "no-store" });
      if (response.status === 403) {
        setNoAccess(true);
        return;
      }
      const result = await response.json().catch(() => null) as ({ ok?: boolean } & Partial<MyRadarTopbarSnapshot>) | null;
      if (!response.ok || !result?.ok || !result.reading || !Array.isArray(result.actions)) {
        throw new Error("personal radar read failed");
      }
      onSnapshot({
        generatedAt: result.generatedAt ?? Date.now(),
        reading: result.reading,
        actions: result.actions,
        actionSummary: result.actionSummary,
        actionsAvailable: result.actionsAvailable !== false,
        headline: result.headline ?? "Your personal overview is ready.",
      });
      setError("");
    } catch {
      setError("Couldn’t load the latest My Radar snapshot. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }, [onSnapshot]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <header className="flex items-start justify-between gap-3 border-b border-black/10 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-black/85">My Radar</h2>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-700/15 bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold uppercase text-emerald-800"><LockKeyhole size={9} aria-hidden="true" /> Personal</span>
          </div>
          <p className="mt-0.5 text-[11px] text-black/45">Your actions, goals, wellbeing and pace</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close My Radar" className="grid size-9 shrink-0 place-items-center rounded-md text-black/45 hover:bg-black/[0.04] hover:text-black/70">
          <X size={15} aria-hidden="true" />
        </button>
      </header>

      {noAccess ? (
        <div className="px-5 py-8 text-center">
          <CircleSlash className="mx-auto text-black/30" size={22} aria-hidden="true" />
          <p className="mt-2 text-xs font-semibold text-black/65">Your staff overview access is turned off</p>
          <p className="mt-1 text-[11px] leading-4 text-black/42">Ask whoever manages your workspace role if you need My Radar enabled.</p>
        </div>
      ) : (
        <div
          className="min-h-0 flex-1 overflow-y-auto"
          onClickCapture={event => {
            if (event.target instanceof Element && event.target.closest("a")) onClose();
          }}
        >
          {loading ? <p className="flex items-center gap-2 border-b border-black/[0.07] px-4 py-2 text-[10px] text-black/40"><LoaderCircle size={12} className="animate-spin" aria-hidden="true" /> Refreshing your personal view…</p> : null}
          {error ? <p role="alert" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-[10px] text-amber-900">{error}</p> : null}
          {snapshot ? <PersonalRadarPanel
            variant="popover"
            showHeader={false}
            reading={snapshot.reading}
            actions={snapshot.actions}
            actionSummary={snapshot.actionSummary}
            actionsAvailable={snapshot.actionsAvailable}
            headline={snapshot.headline}
            actionsHref={staffWorkspace ? "/portal/team/actions" : "/portal/agency/actions"}
            goalsHref="/portal/agency/calendar"
            businessRadarHref={businessRadarAvailable ? "/portal/agency/radar" : null}
          /> : !loading ? <div className="px-5 py-8 text-center text-xs text-black/42">Your personal view is temporarily unavailable.</div> : null}
        </div>
      )}

      <footer className={`grid gap-2 border-t border-black/10 bg-black/[0.018] p-3 ${businessRadarAvailable ? "grid-cols-2" : "grid-cols-1"}`}>
        <Link href="/portal/agency/my-radar" onClick={onClose} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white hover:bg-black/85">
          Open My Radar <ArrowUpRight size={13} aria-hidden="true" />
        </Link>
        {businessRadarAvailable ? (
          <Link href="/portal/agency/radar" onClick={onClose} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/60 hover:bg-black/[0.03]">
            <Building2 size={13} aria-hidden="true" /> Business Radar
          </Link>
        ) : null}
      </footer>
    </>
  );
}
