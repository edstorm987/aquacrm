"use client";

// DiffPreviewPane — when the editor is in client-repo mode, this
// pane shows a list of files that will change in clients/<slug>/ if
// the operator clicks Save.
//
// Calls into `previewChanges()` from lib/savePipeline.ts which dispatches
// to the PortalExportPort's `previewChanges(...)`. When the port is
// missing (T2 R11 not installed) the pane silently renders nothing.

import { useEffect, useState } from "react";
import {
  previewChanges,
  type PreviewChangesInput,
  type PreviewChangesResult,
} from "../../lib/savePipeline";
import type { FilePreviewEntry } from "../../server/extensionPorts";

export interface DiffPreviewPaneProps extends Omit<PreviewChangesInput, "target"> {
  target: PreviewChangesInput["target"];
  // Refresh trigger — bump this number whenever the underlying edit
  // changes. Cheaper than deep-diffing every prop.
  refreshKey?: number;
  onChangedFiles?: (files: FilePreviewEntry[]) => void;
}

export default function DiffPreviewPane({
  target,
  clientId,
  siteId,
  page,
  customPage,
  theme,
  activeVariant,
  refreshKey,
  onChangedFiles,
}: DiffPreviewPaneProps) {
  const [result, setResult] = useState<PreviewChangesResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (target !== "client-repo") { setResult(null); return; }
    let cancelled = false;
    setLoading(true);
    void previewChanges({
      target,
      clientId,
      siteId,
      ...(page ? { page } : {}),
      ...(customPage ? { customPage } : {}),
      ...(theme ? { theme } : {}),
      ...(activeVariant ? { activeVariant } : {}),
    })
      .then(r => {
        if (cancelled) return;
        setResult(r);
        onChangedFiles?.(r.files);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [target, clientId, siteId, page, customPage, theme, activeVariant, refreshKey, onChangedFiles]);

  if (target !== "client-repo" || !result?.available) return null;

  return (
    <aside
      data-component="diff-preview-pane"
      aria-label="Changes preview"
      style={{
        width: "100%",
        padding: 12,
        borderRadius: 10,
        background: "rgba(255,107,53,0.04)",
        border: "1px solid rgba(255,107,53,0.18)",
        fontSize: 12,
      }}
    >
      <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(255,214,194,0.85)", margin: "0 0 8px" }}>
        Save preview · clients/{clientId}/
      </p>
      {loading ? (
        <p style={{ margin: 0, opacity: 0.6 }}>Computing diff…</p>
      ) : result.error ? (
        <p style={{ margin: 0, color: "#fca5a5" }}>Couldn't compute diff: {result.error}</p>
      ) : result.files.length === 0 ? (
        <p style={{ margin: 0, opacity: 0.6 }}>No changes pending — save will be a no-op.</p>
      ) : (
        <>
          <p style={{ margin: "0 0 8px", opacity: 0.85 }}>
            {result.summary ?? `${result.files.length} file${result.files.length === 1 ? "" : "s"} will change`}
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
            {result.files.map(f => (
              <li
                key={f.path}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "4px 8px",
                  borderRadius: 4,
                  background: "rgba(0,0,0,0.18)",
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 3,
                    fontSize: 9,
                    fontWeight: 700,
                    background:
                      f.kind === "added" ? "rgba(34,197,94,0.2)" :
                      f.kind === "deleted" ? "rgba(239,68,68,0.2)" :
                      "rgba(99,123,255,0.2)",
                    color:
                      f.kind === "added" ? "#86efac" :
                      f.kind === "deleted" ? "#fca5a5" :
                      "#bcc6ff",
                  }}
                  aria-label={f.kind}
                >
                  {f.kind === "added" ? "A" : f.kind === "deleted" ? "D" : "M"}
                </span>
                <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, opacity: 0.9 }}>
                  {f.path}
                </code>
                {f.byteCount !== undefined && (
                  <span style={{ marginLeft: "auto", opacity: 0.5, fontSize: 10 }}>
                    {f.byteCount} B
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
