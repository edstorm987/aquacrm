"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

/**
 * Progressive disclosure for a Command Centre panel.
 *
 * ONE shell for every collapsible Day Command panel — do not inline a second
 * chevron/`aria-expanded` header next to this one. The Week Command panel used
 * to carry its own copy; it now composes this shell, and its stored key
 * (`aqua-command-week-expanded`) and content id (`week-command-content`) are
 * preserved verbatim so existing bookmarks and pinned contracts still hold.
 *
 * Honesty contract: collapsing must never hide the fact that something needs
 * attention. A collapsed panel still renders (a) a real summary of what is
 * inside — never a blank strip, and never a fabricated "all clear" when there
 * is nothing to report, and (b) any `attention` chip its owner passes, so an
 * unsaved draft or a required check-in stays on screen while the detail is
 * folded away.
 */

export type CommandPanelSummaryItem = {
  label: string;
  value: string;
  /** `attention` marks a value the reader must not scroll past. */
  tone?: "neutral" | "attention";
};

export type CommandPanelAttention = {
  label: string;
  tone: "critical" | "warning" | "info";
};

/**
 * Remembered per panel in `localStorage`. Absent storage means the panel keeps
 * `defaultExpanded`, so a first-time reader gets the designed layout rather
 * than everything folded shut.
 */
export function useCommandPanelDisclosure(storageKey: string, defaultExpanded = false) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === "true" || stored === "false") setExpanded(stored === "true");
  }, [storageKey]);
  const toggle = useCallback(() => {
    setExpanded(current => {
      const next = !current;
      window.localStorage.setItem(storageKey, String(next));
      return next;
    });
  }, [storageKey]);
  return [expanded, toggle] as const;
}

export function CommandPanelShell({
  panelId,
  icon,
  eyebrow,
  title,
  expanded,
  onToggle,
  summary,
  emptyLabel,
  attention,
  action,
  children,
}: {
  /** Id of the disclosed region; the toggle points `aria-controls` at it. */
  panelId: string;
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  expanded: boolean;
  onToggle: () => void;
  /** What is inside, stated while the panel is closed. */
  summary: CommandPanelSummaryItem[];
  /** Shown instead of the summary when there is genuinely nothing recorded. */
  emptyLabel: string;
  /** Stays visible while collapsed — attention is never folded away. */
  attention?: CommandPanelAttention | null;
  /** Optional control that must remain reachable without expanding. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const headingId = `${panelId}-heading`;
  return <section className="mm-surface-card overflow-hidden rounded-lg border border-black/10" aria-labelledby={headingId} data-command-panel={panelId} data-expanded={expanded}>
    <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
      <button type="button" onClick={onToggle} aria-expanded={expanded} aria-controls={panelId} className="flex w-full min-w-0 items-center gap-3 text-left sm:w-auto sm:flex-1">
        <span className="mm-area-icon grid size-10 shrink-0 place-items-center rounded-md">{icon}</span>
        <span className="min-w-0"><span className="block text-xs font-semibold uppercase tracking-wide text-brand">{eyebrow}</span><span id={headingId} className="mt-1 block truncate text-lg font-semibold text-black/85">{title}</span></span>
        <span className="ml-auto grid size-8 shrink-0 place-items-center rounded-md border border-black/10 bg-white text-black/45">{expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
      </button>
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
        {attention ? <span data-testid={`${panelId}-attention`} className={`inline-flex min-h-7 items-center rounded-md border px-2 text-xs font-semibold ${attention.tone === "critical" ? "border-red-200 bg-red-50 text-red-800" : attention.tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-black/10 bg-black/[0.03] text-black/60"}`}>{attention.label}</span> : null}
        {!expanded ? <div data-testid={`${panelId}-summary`} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-black/45">
          {summary.length
            ? summary.map(item => <span key={item.label}><strong className={item.tone === "attention" ? "font-semibold text-amber-700" : "text-black/70"}>{item.value}</strong> {item.label}</span>)
            : <span>{emptyLabel}</span>}
        </div> : null}
        {action}
      </div>
    </div>
    {expanded ? <div id={panelId} className="border-t border-black/10">{children}</div> : null}
  </section>;
}
