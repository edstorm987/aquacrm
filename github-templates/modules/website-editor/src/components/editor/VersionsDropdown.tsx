"use client";

// R022 — Versions dropdown.
//
// Lists the page's saved versions (most-recent first), separating
// named checkpoints from auto-saves. Click row → preview / restore
// callbacks fire.
//
// Auto-save itself happens upstream (host page debounces edits at
// 5s + POSTs `/pages/versions` without label). This component
// renders the list and routes operator actions; the host wires
// the actual fetch + restore.

import { useEffect, useMemo, useState } from "react";

export interface VersionRow {
  id: string;
  pageId: string;
  ts: number;
  label?: string;
  savedBy: string;
}

interface Props {
  pageId: string;
  // Fires when operator clicks "Preview" on a row.
  onPreview: (versionId: string) => void;
  // Fires when operator clicks "Restore" — host swaps the page tree.
  onRestore: (versionId: string) => void;
  // Fires when operator clicks "Save named version" — host prompts
  // for a label + POSTs `/pages/versions` with body.label set.
  onSaveNamed: (label: string) => Promise<void> | void;
  // R034 — Fires when operator clicks "Diff" on a row. Host opens
  // VersionDiffPanel comparing the chosen version against the
  // current draft tree (or against another version it tracks).
  onDiff?: (versionId: string) => void;
  // Optional override for tests / SSR — defaults to the live API.
  fetchImpl?: typeof fetch;
}

function fmt(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function VersionsDropdown({ pageId, onPreview, onRestore, onSaveNamed, onDiff, fetchImpl }: Props) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [namedLabel, setNamedLabel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const f = fetchImpl ?? fetch;
    f(`/api/portal/website-editor/pages/versions?pageId=${encodeURIComponent(pageId)}`)
      .then(r => r.json() as Promise<{ ok: boolean; versions?: VersionRow[]; error?: string }>)
      .then(data => {
        if (!data.ok) { setError(data.error ?? "request failed"); return; }
        setVersions(data.versions ?? []);
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, [open, pageId, fetchImpl]);

  const { named, autosaves } = useMemo(() => {
    const all = versions ?? [];
    return {
      named: all.filter(v => v.label),
      autosaves: all.filter(v => !v.label),
    };
  }, [versions]);

  async function saveNamed(): Promise<void> {
    const label = namedLabel.trim();
    if (!label) return;
    setSaving(true);
    try {
      await onSaveNamed(label);
      setNamedLabel("");
      // Re-load list so the new named version appears.
      setVersions(null);
      const f = fetchImpl ?? fetch;
      const data = await f(`/api/portal/website-editor/pages/versions?pageId=${encodeURIComponent(pageId)}`)
        .then(r => r.json() as Promise<{ ok: boolean; versions?: VersionRow[] }>);
      if (data.ok) setVersions(data.versions ?? []);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div data-component="versions-dropdown" style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        style={{
          padding: "4px 10px", fontSize: 11,
          background: open ? "var(--brand-primary, rgba(56,189,248,0.18))" : "var(--brand-bg-elevated, rgba(255,255,255,0.05))",
          color: "var(--brand-text, currentColor)",
          border: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
          borderRadius: "var(--brand-radius-sm, 4px)",
          cursor: "pointer",
        }}
      >Versions ▾</button>

      {open && (
        <div role="menu" aria-label="Page versions"
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0,
            zIndex: 40, width: 360, maxHeight: 540, overflowY: "auto",
            background: "var(--brand-bg-elevated, #0b1220)",
            border: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
            borderRadius: "var(--brand-radius-md, 10px)",
            padding: 8,
          }}>
          {error && <p style={{ padding: 8, fontSize: 12, color: "#fca5a5" }}>{error}</p>}
          {versions === null && !error && (
            <p style={{ padding: 8, fontSize: 12, color: "var(--brand-text-muted, rgba(255,255,255,0.5))" }}>Loading…</p>
          )}
          {versions !== null && versions.length === 0 && !error && (
            <p style={{ padding: 8, fontSize: 12, color: "var(--brand-text-muted, rgba(255,255,255,0.5))" }}>
              No saved versions yet. Auto-saves appear here as you edit.
            </p>
          )}

          {/* Save named version. */}
          <div style={{
            padding: 8, marginBottom: 8,
            borderBottom: "1px solid var(--brand-border, rgba(255,255,255,0.06))",
          }}>
            <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--brand-text-muted, rgba(255,255,255,0.5))", marginBottom: 6 }}>
              Save checkpoint
            </p>
            <div style={{ display: "flex", gap: 4 }}>
              <input
                value={namedLabel}
                onChange={e => setNamedLabel(e.target.value)}
                placeholder="e.g. Pre-launch v1"
                style={{
                  flex: 1, padding: "5px 8px", fontSize: 12,
                  background: "var(--brand-bg, rgba(0,0,0,0.4))",
                  border: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
                  borderRadius: "var(--brand-radius-sm, 4px)",
                  color: "var(--brand-text, currentColor)",
                }}
              />
              <button onClick={saveNamed} disabled={!namedLabel.trim() || saving}
                style={{
                  fontSize: 11, padding: "0 10px",
                  background: "var(--brand-primary, rgba(56,189,248,0.2))",
                  color: "var(--brand-text, #fff)",
                  border: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
                  borderRadius: "var(--brand-radius-sm, 4px)",
                  cursor: namedLabel.trim() ? "pointer" : "not-allowed",
                  opacity: namedLabel.trim() && !saving ? 1 : 0.5,
                }}>
                {saving ? "…" : "Save"}
              </button>
            </div>
          </div>

          {named.length > 0 && (
            <div>
              <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.18em", color: "#fbbf24", padding: "4px 8px" }}>
                ★ Named
              </p>
              {named.map(v => (
                <VersionRowEl key={v.id} v={v} onPreview={onPreview} onRestore={onRestore} onDiff={onDiff} />
              ))}
            </div>
          )}
          {autosaves.length > 0 && (
            <div style={{ marginTop: named.length > 0 ? 8 : 0 }}>
              <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--brand-text-muted, rgba(255,255,255,0.5))", padding: "4px 8px" }}>
                Auto-saves
              </p>
              {autosaves.map(v => (
                <VersionRowEl key={v.id} v={v} onPreview={onPreview} onRestore={onRestore} onDiff={onDiff} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VersionRowEl({ v, onPreview, onRestore, onDiff }: { v: VersionRow; onPreview: (id: string) => void; onRestore: (id: string) => void; onDiff?: (id: string) => void }) {
  return (
    <div role="menuitem"
      data-version-id={v.id}
      style={{
        padding: "6px 8px",
        display: "flex", alignItems: "center", gap: 8,
        borderRadius: "var(--brand-radius-sm, 4px)",
      }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, color: "var(--brand-text, currentColor)", margin: 0 }}>
          {v.label ?? "Auto-save"}
        </p>
        <p style={{ fontSize: 10, color: "var(--brand-text-muted, rgba(255,255,255,0.55))", margin: 0 }}>
          {fmt(v.ts)} · {v.savedBy}
        </p>
      </div>
      {onDiff && (
        <button onClick={() => onDiff(v.id)} data-action="diff"
          title="Diff vs current"
          style={{
            fontSize: 10, padding: "2px 6px",
            background: "rgba(251,191,36,0.15)",
            color: "#fcd34d",
            border: "1px solid rgba(251,191,36,0.25)",
            borderRadius: "var(--brand-radius-sm, 4px)",
            cursor: "pointer",
          }}>Diff</button>
      )}
      <button onClick={() => onPreview(v.id)}
        style={{
          fontSize: 10, padding: "2px 6px",
          background: "var(--brand-bg-elevated, rgba(255,255,255,0.05))",
          color: "var(--brand-text-muted, rgba(255,255,255,0.7))",
          border: "1px solid var(--brand-border, rgba(255,255,255,0.08))",
          borderRadius: "var(--brand-radius-sm, 4px)",
          cursor: "pointer",
        }}>Preview</button>
      <button onClick={() => onRestore(v.id)}
        style={{
          fontSize: 10, padding: "2px 6px",
          background: "rgba(52,211,153,0.15)",
          color: "#86efac",
          border: "1px solid rgba(52,211,153,0.25)",
          borderRadius: "var(--brand-radius-sm, 4px)",
          cursor: "pointer",
        }}>Restore</button>
    </div>
  );
}
