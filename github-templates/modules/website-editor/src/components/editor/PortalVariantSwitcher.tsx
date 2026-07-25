"use client";

// R012 — Portal-variant switcher (editor topbar dropdown).
//
// Lists every variant on the current site grouped by PortalRole + a
// "+ New variant" affordance per role. Switching emits
// `onPick(pageId)` so the host page can load that page's tree into
// the editor canvas. Active variant carries a green "live" pip;
// drafts grey.

import { useEffect, useMemo, useState } from "react";

export interface VariantRow {
  role: "login" | "affiliates" | "orders" | "account";
  pageId: string;
  variantId?: string;
  title: string;
  slug: string;
  isActive: boolean;
  status: "draft" | "live";
  updatedAt: number;
}

interface Props {
  siteId: string;
  currentPageId?: string;
  onPick: (pageId: string) => void;
  onNewVariant?: (role: VariantRow["role"]) => void;
  fetchImpl?: typeof fetch;
}

const ROLE_LABEL: Record<VariantRow["role"], string> = {
  login: "Login",
  affiliates: "Affiliates",
  orders: "Orders",
  account: "Account",
};

export default function PortalVariantSwitcher({ siteId, currentPageId, onPick, onNewVariant, fetchImpl }: Props) {
  const [open, setOpen] = useState(false);
  const [variants, setVariants] = useState<VariantRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || variants !== null) return;
    const f = fetchImpl ?? fetch;
    f(`/api/portal/website-editor/portal-variants/all?siteId=${encodeURIComponent(siteId)}`)
      .then(r => r.json() as Promise<{ ok: boolean; variants?: VariantRow[]; error?: string }>)
      .then(data => {
        if (!data.ok) { setError(data.error ?? "request failed"); return; }
        setVariants(data.variants ?? []);
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, [open, variants, siteId, fetchImpl]);

  const grouped = useMemo(() => {
    const map = new Map<VariantRow["role"], VariantRow[]>();
    for (const v of variants ?? []) {
      const arr = map.get(v.role) ?? [];
      arr.push(v);
      map.set(v.role, arr);
    }
    return map;
  }, [variants]);

  const current = variants?.find(v => v.pageId === currentPageId);
  const summary = current ? `${ROLE_LABEL[current.role]} · ${current.title}` : "Pick variant";

  return (
    <div data-component="portal-variant-switcher" style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="px-2.5 py-1.5 rounded-md text-[11px] bg-white/5 hover:bg-white/10 border border-white/10 text-brand-cream"
      >
        🪟 {summary} ▾
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Portal variants"
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0,
            zIndex: 40, minWidth: 320, maxHeight: 480, overflowY: "auto",
            background: "var(--brand-bg-elevated, rgba(15,23,42,0.96))",
            border: "1px solid var(--brand-border, rgba(255,255,255,0.1))",
            borderRadius: "var(--brand-radius-md, 10px)",
            padding: 8,
          }}
        >
          {error && <p style={{ padding: 8, color: "#fca5a5", fontSize: 12 }}>{error}</p>}
          {variants === null && !error && <p style={{ padding: 8, color: "#94a3b8", fontSize: 12 }}>Loading…</p>}
          {variants !== null && variants.length === 0 && (
            <p style={{ padding: 8, color: "#94a3b8", fontSize: 12 }}>
              No variants yet. Create one with the AGB starter loader or "+ New variant" below.
            </p>
          )}
          {(["login", "affiliates", "orders", "account"] as const).map(role => {
            const rows = grouped.get(role) ?? [];
            return (
              <div key={role} style={{ marginBottom: 8 }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "4px 8px", fontSize: 10, textTransform: "uppercase",
                  letterSpacing: "0.18em", color: "#94a3b8",
                }}>
                  <span>{ROLE_LABEL[role]}</span>
                  {onNewVariant && (
                    <button
                      onClick={() => onNewVariant(role)}
                      style={{ fontSize: 10, color: "#7dd3fc", background: "transparent", border: "none", cursor: "pointer" }}
                    >+ New variant</button>
                  )}
                </div>
                {rows.length === 0 && (
                  <p style={{ padding: "2px 8px", color: "#64748b", fontSize: 11, fontStyle: "italic" }}>
                    none yet
                  </p>
                )}
                {rows.map(v => (
                  <button
                    key={v.pageId}
                    onClick={() => { onPick(v.pageId); setOpen(false); }}
                    role="menuitem"
                    style={{
                      width: "100%", textAlign: "left", padding: "6px 8px", borderRadius: 6,
                      background: currentPageId === v.pageId ? "rgba(56,189,248,0.15)" : "transparent",
                      border: "none", color: "var(--brand-text, #f5f3ec)",
                      cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: 12,
                    }}
                  >
                    <span style={{
                      width: 6, height: 6, borderRadius: 999,
                      background: v.isActive ? "#34d399" : "#475569",
                    }} aria-hidden="true" />
                    <span style={{ flex: 1 }}>{v.title}</span>
                    <span style={{ fontSize: 10, opacity: 0.55 }}>{v.status}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
