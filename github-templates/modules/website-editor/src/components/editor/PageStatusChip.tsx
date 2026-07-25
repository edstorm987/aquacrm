"use client";

// R035 — Page status chip. Renders one of three states:
//   draft        : neutral, dotted border
//   published    : green, solid border
//   draft-ahead  : amber, solid border (operator has unpublished edits)

import type { EditorPage } from "../../types/editorPage";
import { pageStatus, type PageStatus } from "../../lib/draftPublished";

const STYLES: Record<PageStatus, { bg: string; fg: string; border: string; label: string; testid: string }> = {
  draft: {
    bg: "rgba(255,255,255,0.06)",
    fg: "var(--brand-text-muted, rgba(255,255,255,0.7))",
    border: "1px dashed var(--brand-border, rgba(255,255,255,0.25))",
    label: "Draft",
    testid: "page-status-draft",
  },
  published: {
    bg: "rgba(52,211,153,0.15)",
    fg: "#86efac",
    border: "1px solid rgba(52,211,153,0.35)",
    label: "Published",
    testid: "page-status-published",
  },
  "draft-ahead": {
    bg: "rgba(251,191,36,0.15)",
    fg: "#fcd34d",
    border: "1px solid rgba(251,191,36,0.35)",
    label: "Draft ahead",
    testid: "page-status-draft-ahead",
  },
};

export default function PageStatusChip({ page }: { page: EditorPage }) {
  const s = pageStatus(page);
  const style = STYLES[s];
  return (
    <span data-component="page-status-chip" data-testid={style.testid} data-status={s}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 11, padding: "2px 8px", borderRadius: 999,
        background: style.bg, color: style.fg, border: style.border,
      }}>
      <span aria-hidden="true" style={{
        width: 6, height: 6, borderRadius: "50%",
        background: s === "published" ? "#34d399" : s === "draft-ahead" ? "#fbbf24" : "rgba(255,255,255,0.5)",
      }} />
      {style.label}
    </span>
  );
}
