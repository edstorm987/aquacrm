"use client";

// The Archived leads view — lifted out of `_LeadsPipelineWorkspace`.
//
// Extracted 2026-08-29 as the first cut of a 2,953-line file, chosen because an
// adversarial check could not refute it: the block is contiguous, nothing
// outside references a symbol inside it, and — the decisive one — it is a
// top-level declaration rather than a closure over the workspace's state, so it
// drags no hooks and no fetch logic with it. Its four inputs all arrive as
// props the parent already threads in.
//
// `ArchivedLeadView` moves WITH it and is re-exported for the parent. Leaving
// the type behind would have left a type-only import cycle: erased at build
// time and harmless today, but a cycle recorded in the source for no reason.

import { Archive } from "lucide-react";

import { formatUkDateTime } from "@/lib/shared/formatDateTime";

/**
 * An archived lead, as the Archived view needs it.
 *
 * Deliberately NOT a `LeadView`: the board's shape carries a column, services,
 * timings and custom fields, none of which mean anything once a lead is off the
 * board — and requiring them would make the server assemble a full board row
 * for a lead that will never appear on it.
 */
export interface ArchivedLeadView {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  company?: string;
  tags: string[];
  capturedAt: number;
  archivedAt?: number;
}

/**
 * The Archived view — the half of "Archive" that never existed.
 *
 * Deliberately a plain list rather than the column board: an archived lead has
 * no column, and rendering it in one would invite somebody to drag it, which
 * would mean restoring it by accident.
 */
export function ArchivedLeads({
  leads,
  busy,
  onRestore,
  onPurge,
}: {
  leads: ArchivedLeadView[];
  busy: string | null;
  onRestore: (id: string) => void;
  onPurge: (id: string, label: string) => void;
}) {
  if (!leads.length) {
    return (
      <section className="mm-surface-card rounded-lg border border-dashed border-black/10 p-8 text-center">
        <h2 className="text-sm font-semibold text-black/75">Nothing archived</h2>
        <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-black/45">
          Archiving a lead takes them off the active board and keeps their record and history here. If they enquire again they come back automatically, with everything they did still attached.
        </p>
      </section>
    );
  }
  return (
    <section className="mm-surface-card rounded-lg border border-black/10 p-3">
      <div className="mb-3 flex items-start gap-3 rounded-md bg-black/[0.02] p-3">
        <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-black/[0.05] text-black/55"><Archive size={16} /></span>
        <p className="text-xs leading-5 text-black/50">
          Off the active board, still here. Restore puts a lead back where it left — and if the same person enquires again, they are restored automatically rather than becoming a second record.
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {leads.map(lead => {
          const label = lead.name || lead.company || lead.email || lead.phone || "lead";
          return (
            <li key={lead.id} className="mm-surface-card rounded-lg border border-black/10 p-3">
              <h3 className="truncate text-sm font-semibold text-black/85">{label}</h3>
              <p className="mt-0.5 truncate text-xs text-black/50">{lead.company ? `${lead.company} · ` : ""}{lead.email || lead.phone || "Contact details pending"}</p>
              <p className="mt-2 text-[11px] text-black/42">
                Archived {lead.archivedAt ? formatUkDateTime(lead.archivedAt) : "—"} · captured {formatUkDateTime(lead.capturedAt)}
              </p>
              {lead.tags.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {lead.tags.slice(0, 3).map(tag => <span key={tag} className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] text-black/55">{tag}</span>)}
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onRestore(lead.id)}
                  disabled={busy === `restore:${lead.id}`}
                  className="min-h-10 flex-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                >
                  {busy === `restore:${lead.id}` ? "Restoring..." : "Restore"}
                </button>
                <button
                  type="button"
                  onClick={() => onPurge(lead.id, label)}
                  disabled={busy === `purge:${lead.id}`}
                  className="min-h-10 rounded-md border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  {busy === `purge:${lead.id}` ? "Deleting..." : "Delete permanently"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
