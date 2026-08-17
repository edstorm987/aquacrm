"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, MonitorCog } from "lucide-react";

const REVEALED_HASHES = new Set([
  "#advanced-client-controls",
  "#client-radar",
  "#operational-brief",
]);

export function ClientAdvancedControls({
  signalCount,
  liveChecks,
  children,
}: {
  signalCount: number;
  liveChecks: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const revealExactTarget = () => {
      if (REVEALED_HASHES.has(window.location.hash)) setOpen(true);
    };
    const revealLinkedTarget = (event: MouseEvent) => {
      const source = event.target instanceof Element ? event.target.closest("a") : null;
      const href = source?.getAttribute("href");
      if (!href) return;
      const hash = new URL(href, window.location.href).hash;
      if (REVEALED_HASHES.has(hash)) setOpen(true);
    };
    revealExactTarget();
    window.addEventListener("hashchange", revealExactTarget);
    window.addEventListener("popstate", revealExactTarget);
    document.addEventListener("click", revealLinkedTarget, true);
    return () => {
      window.removeEventListener("hashchange", revealExactTarget);
      window.removeEventListener("popstate", revealExactTarget);
      document.removeEventListener("click", revealLinkedTarget, true);
    };
  }, []);

  return (
    <details
      id="advanced-client-controls"
      className="mm-client-advanced group scroll-mt-24 border-y border-black/10"
      open={open}
      onToggle={event => setOpen(event.currentTarget.open)}
    >
      <summary className="flex min-h-20 cursor-pointer list-none flex-wrap items-center justify-between gap-4 px-5 py-4 hover:bg-black/[0.02]">
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-[#edf4f8] text-[#315b85]"><MonitorCog size={18} /></span>
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[#315b85]">Advanced client controls</span>
            <span className="mt-1 block text-sm font-semibold text-black/75">Radar, detailed health, systems and operational handover</span>
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${signalCount ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{signalCount ? `${signalCount} signal${signalCount === 1 ? "" : "s"}` : "Radar clear"}</span>
          <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-semibold text-sky-700">{liveChecks} checks</span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-black/45"><span className="group-open:hidden">Show</span><span className="hidden group-open:inline">Hide</span><ChevronDown size={15} className="transition-transform group-open:rotate-180" /></span>
        </span>
      </summary>
      <div className="grid gap-6 border-t border-black/[0.08] py-6">{children}</div>
    </details>
  );
}
