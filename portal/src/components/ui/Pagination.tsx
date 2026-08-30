"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

// Numbered pagination for long lists.
//
// Ed, 2026-08-30: *"logs in settings should show like 10 results and be pages
// so like page 1 -- 2000."* This is the first SHARED pagination in the repo —
// three exist already (the inbox load-more, Radar's offset pair, the
// website-editor's) and none was reusable; this one goes in `ui/` so the next
// list stops writing a fourth. See hazards-and-duplication.md.

/**
 * Which page numbers to render, and where the gaps fall. Exported separately
 * from the component so the arithmetic can be tested without React: the whole
 * point of this file is that page 1,437 of 5,000 renders nine controls, not
 * five thousand.
 *
 * Always keeps first, last, current, and `span` neighbours either side; a run
 * of two or more skipped pages collapses to one "gap".
 */
export function pageWindow(page: number, pageCount: number, span = 1): Array<number | "gap"> {
  const last = pageCount - 1;
  const wanted = new Set<number>([0, last, page]);
  for (let step = 1; step <= span; step += 1) {
    wanted.add(page - step);
    wanted.add(page + step);
  }
  const pages = [...wanted].filter(value => value >= 0 && value <= last).sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  pages.forEach((value, index) => {
    if (index > 0 && value - pages[index - 1]! > 1) out.push("gap");
    out.push(value);
  });
  return out;
}

const cell = "grid min-h-9 min-w-9 place-items-center rounded-md border px-2 text-sm transition disabled:opacity-40";
const arrow = `${cell} border-black/10 bg-white text-black/55 hover:border-black/25`;

export function Pagination({ page, pageCount, onPage, disabled = false, label = "Pagination" }: {
  /** Zero-based. Displayed one-based. */
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  disabled?: boolean;
  label?: string;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-1">
      <button type="button" onClick={() => onPage(Math.max(0, page - 1))} disabled={disabled || page === 0} aria-label="Previous page" className={arrow}><ChevronLeft size={15} aria-hidden /></button>
      {pageWindow(page, pageCount).map((item, index) => item === "gap"
        ? <span key={`gap:${index}`} aria-hidden className="px-1 text-xs text-black/30">…</span>
        : (
          <button
            key={item}
            type="button"
            onClick={() => onPage(item)}
            disabled={disabled}
            aria-current={item === page ? "page" : undefined}
            aria-label={`Page ${item + 1}`}
            className={`${cell} ${item === page ? "border-black/35 bg-black/[0.06] font-semibold text-black/80" : "border-black/10 bg-white text-black/55 hover:border-black/25"}`}
          >
            {item + 1}
          </button>
        ))}
      <button type="button" onClick={() => onPage(Math.min(pageCount - 1, page + 1))} disabled={disabled || page >= pageCount - 1} aria-label="Next page" className={arrow}><ChevronRight size={15} aria-hidden /></button>
    </nav>
  );
}
