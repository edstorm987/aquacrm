"use client";

// R015 — Form picker modal. Surfaces the agency's published forms
// (from `@aqua/plugin-forms`) so an operator can wire one into a
// `form-embed` block via its `formId` prop.
//
// Lists name + field count + submission count + status. "+ Create
// new form" anchor links to the forms-plugin admin route.

import { useEffect, useMemo, useState } from "react";

interface FormRow {
  id: string;
  name: string;
  description?: string;
  status: "draft" | "published" | "archived";
  fields: { id: string }[];
  submissionCount: number;
  updatedAt: number;
}

interface Props {
  onClose: () => void;
  onPick: (formId: string) => void;
  // Where the "+ Create new form" CTA points. Defaults to the forms
  // plugin's standard admin path; host page can override.
  createFormHref?: string;
  // SSR / test override.
  fetchImpl?: typeof fetch;
}

export default function FormPickerModal({ onClose, onPick, createFormHref, fetchImpl }: Props) {
  const [forms, setForms] = useState<FormRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("published");

  useEffect(() => {
    const f = fetchImpl ?? fetch;
    f("/api/portal/forms/forms")
      .then(r => r.json() as Promise<{ ok: boolean; forms?: FormRow[]; error?: string }>)
      .then(data => {
        if (!data.ok) { setError(data.error ?? "request failed"); return; }
        setForms(data.forms ?? []);
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, [fetchImpl]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (forms ?? []).filter(f => {
      if (statusFilter !== "all" && f.status !== statusFilter) return false;
      if (q && !`${f.name} ${f.description ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => b.updatedAt - a.updatedAt);
  }, [forms, query, statusFilter]);

  return (
    <div role="dialog" aria-label="Pick a form" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-brand-black-soft border border-white/10 rounded-lg w-[820px] max-w-[96vw] h-[80vh] flex flex-col">
        <header className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 className="text-[15px] text-brand-cream font-medium">Pick a form</h2>
            <p className="text-[11px] text-brand-cream/55">Wire any published form into this block. Drafts visible by filter.</p>
          </div>
          <button onClick={onClose} className="text-brand-cream/55 hover:text-brand-cream text-2xl leading-none" aria-label="Close picker">×</button>
        </header>

        <div className="px-6 py-3 border-b border-white/5 flex items-center gap-3">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search forms…"
            className="flex-1 bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-[12px] text-brand-cream placeholder:text-brand-cream/30 focus:outline-none focus:border-cyan-400/40"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as "all" | "published" | "draft")}
            className="bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-[12px] text-brand-cream"
          >
            <option value="published">Published</option>
            <option value="draft">Drafts</option>
            <option value="all">All</option>
          </select>
          <a
            href={createFormHref ?? "/portal/agency/forms"}
            target="_blank"
            rel="noreferrer"
            className="px-2.5 py-1.5 rounded-md text-[11px] bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/25 text-emerald-200"
          >
            + Create new form ↗
          </a>
        </div>

        <div className="flex-1 overflow-y-auto">
          {error && <p style={{ padding: 24, color: "#fca5a5", fontSize: 12 }}>{error}</p>}
          {forms === null && !error && <p style={{ padding: 24, color: "#94a3b8", fontSize: 12 }}>Loading…</p>}
          {forms !== null && filtered.length === 0 && !error && (
            <p style={{ padding: 24, color: "#94a3b8", fontSize: 12 }}>
              No forms match. {forms.length === 0 ? "Create one with the + button above." : "Try widening the filter."}
            </p>
          )}
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {filtered.map(f => (
              <li key={f.id}>
                <button
                  onClick={() => onPick(f.id)}
                  style={{
                    width: "100%", textAlign: "left", display: "flex", alignItems: "center",
                    padding: "12px 24px", background: "transparent", border: "none",
                    borderBottom: "1px solid rgba(255,255,255,0.06)", cursor: "pointer",
                    color: "var(--brand-text, #f5f3ec)", gap: 16,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 2px 0" }}>{f.name}</p>
                    {f.description && (
                      <p style={{ fontSize: 11, color: "#94a3b8", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f.description}
                      </p>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11, color: "#94a3b8", flexShrink: 0 }}>
                    <span>{f.fields.length} field{f.fields.length === 1 ? "" : "s"}</span>
                    <span>{f.submissionCount} submission{f.submissionCount === 1 ? "" : "s"}</span>
                    <span style={{
                      padding: "2px 6px", borderRadius: 4, fontSize: 10,
                      background: f.status === "published" ? "rgba(52,211,153,0.18)" : f.status === "draft" ? "rgba(100,116,139,0.18)" : "rgba(244,63,94,0.18)",
                      color: f.status === "published" ? "#86efac" : f.status === "draft" ? "#cbd5e1" : "#fda4af",
                    }}>{f.status}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
