"use client";

import { useMemo, useState } from "react";
import { ArchiveRestore, ChevronDown, FilePenLine, Search } from "lucide-react";

import { formatUkDateTime } from "@/lib/shared/formatDateTime";

import type { ScoutingProspectView } from "./_ScoutingCommand";

function matchesArchiveQuery(prospect: ScoutingProspectView, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    prospect.company,
    prospect.name,
    prospect.email,
    prospect.phone,
    prospect.website,
    prospect.address,
    prospect.niche,
    prospect.source,
    prospect.opportunity,
    prospect.researchNotes,
    prospect.nextStep,
    ...prospect.tags,
  ].filter(Boolean).join(" ").toLowerCase().includes(needle);
}

export function DismissedProspectsArchive({
  prospects,
  busy,
  onReview,
  onRestore,
}: {
  prospects: ScoutingProspectView[];
  busy: string | null;
  onReview: (prospect: ScoutingProspectView) => void;
  onRestore: (prospect: ScoutingProspectView) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => prospects.filter(prospect => matchesArchiveQuery(prospect, query)),
    [prospects, query],
  );

  if (!prospects.length) return null;

  return (
    <details className="overflow-hidden rounded-lg border border-black/10 bg-white">
      <summary className="group flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#16877f] sm:px-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-black/[0.045] text-black/65" aria-hidden="true">
          <ArchiveRestore size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block text-sm font-semibold text-black/80">Not qualified</strong>
          <span className="mt-0.5 block text-xs text-black/65">Retained outside active queues · {prospects.length} {prospects.length === 1 ? "dossier" : "dossiers"}</span>
        </span>
        <ChevronDown size={17} className="shrink-0 text-black/55 transition group-open:rotate-180" aria-hidden="true" />
      </summary>

      <div className="border-t border-black/[0.07]">
        <div className="border-b border-black/[0.07] bg-black/[0.015] px-4 py-3 sm:px-5">
          <label htmlFor="not-qualified-search" className="block text-xs font-semibold text-black/70">
            Search retained dossiers
            <span className="relative mt-1 block max-w-xl">
              <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/45" />
              <input
                id="not-qualified-search"
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Business, person, contact detail, source, note, or tag"
                className="min-h-11 w-full rounded-md border border-black/15 bg-white py-2 pl-9 pr-3 text-sm text-black/85 placeholder:text-black/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2"
              />
            </span>
          </label>
          <p className="mt-2 text-xs text-black/65" aria-live="polite">{filtered.length} of {prospects.length} retained dossiers</p>
        </div>

        {filtered.length ? (
          <ul className="divide-y divide-black/[0.07]">
            {filtered.map(prospect => (
              <li key={prospect.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <strong className="block truncate text-sm font-semibold text-black/80">{prospect.company || prospect.name || prospect.website || "Unnamed prospect"}</strong>
                  <span className="mt-1 block text-xs leading-5 text-black/65">
                    {[prospect.niche, prospect.source].filter(Boolean).join(" · ") || "No classification"}
                    {prospect.dismissedAt ? ` · dismissed ${formatUkDateTime(prospect.dismissedAt)}` : ""}
                    {prospect.dismissedActorLabel ? ` by ${prospect.dismissedActorLabel}` : ""}
                  </span>
                  {prospect.nextStep || prospect.researchNotes ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-black/65">{prospect.nextStep || prospect.researchNotes}</p> : null}
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
                  <button type="button" onClick={() => onReview(prospect)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-black/10 px-3 text-xs font-semibold text-black/70 hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">
                    <FilePenLine size={14} aria-hidden="true" /> Review dossier
                  </button>
                  <button type="button" onClick={() => onRestore(prospect)} disabled={busy === `restore-prospect:${prospect.id}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#102f31] px-3 text-xs font-semibold text-white hover:bg-[#174246] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                    <ArchiveRestore size={14} aria-hidden="true" />
                    {busy === `restore-prospect:${prospect.id}` ? "Restoring..." : "Restore"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-5 py-8 text-center">
            <p className="text-sm font-medium text-black/70">No retained dossiers match that search.</p>
            <button type="button" onClick={() => setQuery("")} className="mt-3 min-h-11 rounded-md border border-black/10 bg-white px-4 text-xs font-semibold text-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16877f] focus-visible:ring-offset-2">Clear search</button>
          </div>
        )}
      </div>
    </details>
  );
}
