"use client";

// R012 — Portal-variant gallery (full-screen modal).
//
// Each card surfaces a variant's role chip, title + slug, last-edited
// timestamp, status pip ("live" / "draft"), and an optional
// `onPreview` callback for a thumbnail click. "Make live" flips the
// active variant for that role via the existing
// `/portal-variants/active` endpoint.

import { useEffect, useState } from "react";
import type { VariantRow } from "./PortalVariantSwitcher";

interface Props {
  siteId: string;
  onClose: () => void;
  onEdit: (pageId: string) => void;
  onPreview?: (pageId: string) => void;
  fetchImpl?: typeof fetch;
}

const ROLE_LABEL: Record<VariantRow["role"], string> = {
  login: "Login",
  affiliates: "Affiliates",
  orders: "Orders",
  account: "Account",
};

const ROLE_COLOR: Record<VariantRow["role"], string> = {
  login:      "rgba(168,85,247,0.18)",
  affiliates: "rgba(244,114,182,0.18)",
  orders:     "rgba(34,197,94,0.18)",
  account:    "rgba(56,189,248,0.18)",
};

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function PortalVariantGallery({ siteId, onClose, onEdit, onPreview, fetchImpl }: Props) {
  const [variants, setVariants] = useState<VariantRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const f = fetchImpl ?? fetch;

  function load(): void {
    f(`/api/portal/website-editor/portal-variants/all?siteId=${encodeURIComponent(siteId)}`)
      .then(r => r.json() as Promise<{ ok: boolean; variants?: VariantRow[]; error?: string }>)
      .then(data => {
        if (!data.ok) { setError(data.error ?? "request failed"); return; }
        setVariants(data.variants ?? []);
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)));
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [siteId]);

  async function makeLive(v: VariantRow): Promise<void> {
    setBusy(v.pageId);
    try {
      const res = await f("/api/portal/website-editor/portal-variants/active", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteId, role: v.role, pageId: v.pageId }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) { setError(data.error ?? "could not flip"); return; }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div role="dialog" aria-label="Portal variants" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-brand-black-soft border border-white/10 rounded-lg w-[1100px] max-w-[96vw] h-[80vh] flex flex-col">
        <header className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 className="text-[15px] text-brand-cream font-medium">Portal variants</h2>
            <p className="text-[11px] text-brand-cream/55">One per role: login · affiliates · orders · account. Singleton: only one variant per role goes live.</p>
          </div>
          <button onClick={onClose} className="text-brand-cream/55 hover:text-brand-cream text-2xl leading-none" aria-label="Close gallery">×</button>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {error && <p style={{ color: "#fca5a5", fontSize: 12, marginBottom: 12 }}>{error}</p>}
          {variants === null && !error && <p style={{ color: "#94a3b8", fontSize: 12 }}>Loading…</p>}
          {variants !== null && variants.length === 0 && (
            <p style={{ color: "#94a3b8", fontSize: 12 }}>No variants yet. Apply a starter via the marketplace gallery to seed one.</p>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {(variants ?? []).map(v => (
              <div
                key={v.pageId}
                data-variant-id={v.variantId ?? v.pageId}
                style={{
                  border: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
                  borderRadius: "var(--brand-radius-md, 10px)",
                  background: "var(--brand-bg-elevated, rgba(255,255,255,0.03))",
                  overflow: "hidden",
                  display: "flex", flexDirection: "column",
                }}
              >
                <button
                  onClick={() => onPreview?.(v.pageId)}
                  style={{
                    aspectRatio: "16 / 9", border: "none", background: "rgba(0,0,0,0.4)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, color: "#94a3b8", cursor: onPreview ? "pointer" : "default",
                  }}
                >
                  preview
                </button>
                <div style={{ padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <span style={{
                      fontSize: 10, padding: "2px 6px", borderRadius: 4,
                      background: ROLE_COLOR[v.role],
                      color: "var(--brand-text, #f5f3ec)",
                      textTransform: "uppercase", letterSpacing: "0.1em",
                    }}>{ROLE_LABEL[v.role]}</span>
                    <span style={{
                      fontSize: 10, padding: "2px 6px", borderRadius: 4,
                      background: v.isActive ? "rgba(52,211,153,0.18)" : "rgba(100,116,139,0.18)",
                      color: v.isActive ? "#bbf7d0" : "#cbd5e1",
                    }}>{v.status}</span>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--brand-text, #f5f3ec)", margin: "0 0 4px 0", fontWeight: 500 }}>
                    {v.title}
                  </p>
                  <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 10px 0", fontFamily: "monospace" }}>
                    {v.slug}
                  </p>
                  <p style={{ fontSize: 10, color: "#94a3b8", margin: "0 0 10px 0" }}>
                    Last edited {fmtDate(v.updatedAt)}
                  </p>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => onEdit(v.pageId)}
                      style={{
                        flex: 1, fontSize: 11, padding: "5px 8px", borderRadius: 6,
                        background: "rgba(56,189,248,0.15)", color: "#bae6fd",
                        border: "1px solid rgba(56,189,248,0.25)", cursor: "pointer",
                      }}
                    >Edit</button>
                    {!v.isActive && (
                      <button
                        onClick={() => makeLive(v)}
                        disabled={busy === v.pageId}
                        style={{
                          flex: 1, fontSize: 11, padding: "5px 8px", borderRadius: 6,
                          background: "rgba(52,211,153,0.15)", color: "#86efac",
                          border: "1px solid rgba(52,211,153,0.25)", cursor: "pointer",
                          opacity: busy === v.pageId ? 0.5 : 1,
                        }}
                      >{busy === v.pageId ? "…" : "Make live"}</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
