"use client";

// SaveResultBanner — surfaces the most recent save's outcome at the
// top of the editor canvas. Round-6 — used by EditorPage,
// PageDetailPage, ThemeDetailPage, PortalsPage when they go through
// the save pipeline.
//
// Three states:
//   - target=shared-portal + ok=true       → "Saved" (auto-dismiss 2s)
//   - target=client-repo  + ok=true        → "Saved. N files changed
//                                              — [Open commit]" link
//                                              into GitStatusPage
//   - ok=false                             → error pill

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PipelineSaveResult } from "../../lib/savePipeline";

export interface SaveResultBannerProps {
  result: PipelineSaveResult | null;
  // Auto-dismiss for shared-portal saves. Default 2000ms.
  dismissAfterMs?: number;
  // Where to deep-link the "Open commit" button. Defaults to
  // `../git-status` relative to the editor.
  gitStatusHref?: string;
}

export default function SaveResultBanner({
  result,
  dismissAfterMs = 2000,
  gitStatusHref = "../git-status",
}: SaveResultBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(false);
    if (!result || !result.ok) return;
    if (result.target === "shared-portal") {
      const t = setTimeout(() => setDismissed(true), dismissAfterMs);
      return () => clearTimeout(t);
    }
  }, [result, dismissAfterMs]);

  if (!result || dismissed) return null;

  if (!result.ok) {
    return (
      <div
        role="alert"
        style={{
          padding: "8px 12px",
          margin: "0 0 8px",
          borderRadius: 8,
          background: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.25)",
          color: "#fca5a5",
          fontSize: 12,
        }}
      >
        ✗ Save failed{result.error ? ` — ${result.error}` : ""}.
      </div>
    );
  }

  if (result.target === "shared-portal") {
    return (
      <div
        role="status"
        style={{
          padding: "8px 12px",
          margin: "0 0 8px",
          borderRadius: 8,
          background: "rgba(34,197,94,0.08)",
          border: "1px solid rgba(34,197,94,0.2)",
          color: "rgba(220,252,231,0.95)",
          fontSize: 12,
        }}
      >
        ✓ Saved
      </div>
    );
  }

  // client-repo success path
  const fileCount = result.changedFiles?.length ?? 0;
  return (
    <div
      role="status"
      style={{
        padding: "8px 12px",
        margin: "0 0 8px",
        borderRadius: 8,
        background: "rgba(255,107,53,0.08)",
        border: "1px solid rgba(255,107,53,0.25)",
        color: "rgba(255,214,194,0.95)",
        fontSize: 12,
        display: "flex",
        alignItems: "center",
        gap: 12,
        justifyContent: "space-between",
      }}
    >
      <span>
        ✓ Saved
        {result.fellBackToFullReexport && (
          <span title="Incremental save not yet supported by portal-export plugin — full re-export ran instead." style={{ marginLeft: 6, opacity: 0.7 }}>
            (full re-export)
          </span>
        )}
        . {fileCount} file{fileCount === 1 ? "" : "s"} changed in <code>clients/&lt;slug&gt;/</code>.
      </span>
      <Link
        href={gitStatusHref}
        style={{
          padding: "4px 10px",
          borderRadius: 6,
          background: "rgba(255,107,53,0.2)",
          color: "#ffd6c2",
          fontSize: 11,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Open commit →
      </Link>
    </div>
  );
}
