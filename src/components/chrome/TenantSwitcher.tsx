"use client";

// Sidebar tenant switcher — replaces the static "TENANT / Milesy Media"
// block at the top of the portal sidebar. Visual model lifted from
// GoHighLevel's sub-account switcher: tappable tile shows the active
// tenant; clicking opens a search-able list of all agencies the
// signed-in user can access. Posts to /api/auth/agency-switch on
// pick and /api/auth/agency-add for new ones (same endpoints as the
// legacy topbar AgencySwitcher).

import { useEffect, useMemo, useRef, useState } from "react";

export interface TenantOption {
  id: string;
  name: string;
  swatch?: string;
  subtitle?: string;
}

interface Props {
  agencies: TenantOption[];
  activeAgencyId: string;
}

function initialOf(name: string): string {
  const t = name.trim();
  return (t.charAt(0) || "?").toUpperCase();
}

export function TenantSwitcher({ agencies, activeAgencyId }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const active = agencies.find(a => a.id === activeAgencyId) ?? agencies[0];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return agencies;
    return agencies.filter(a => a.name.toLowerCase().includes(q));
  }, [agencies, query]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function onPick(id: string) {
    if (id === activeAgencyId) { setOpen(false); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/auth/agency-switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agencyId: id }),
      });
      const data = (await res.json()) as { ok: boolean; redirect?: string; error?: string };
      if (!res.ok || !data.ok) { setError(data.error ?? "Couldn't switch."); setBusy(false); return; }
      if (typeof window !== "undefined") window.location.href = data.redirect ?? "/portal";
    } catch { setError("Network error. Try again."); setBusy(false); }
  }

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/auth/agency-add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = (await res.json()) as { ok: boolean; redirect?: string; error?: string };
      if (!res.ok || !data.ok) { setError(data.error ?? "Couldn't add agency."); setBusy(false); return; }
      if (typeof window !== "undefined") window.location.href = data.redirect ?? "/portal/agency";
    } catch { setError("Network error. Try again."); setBusy(false); }
  }

  if (!active) return null;

  return (
    <div ref={wrapRef} className="relative" data-testid="tenant-switcher">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Active tenant: ${active.name}. Click to switch.`}
        className="group flex w-full items-center gap-2.5 rounded-xl border border-white/40 bg-white/40 px-2.5 py-2 text-left shadow-sm backdrop-blur-md transition hover:border-white/70 hover:bg-white/70 hover:shadow-lg hover:ring-1 hover:ring-white/60"
      >
        <span
          aria-hidden
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white"
          style={{ background: active.swatch ?? "#94a3b8" }}
        >
          {initialOf(active.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[10px] font-medium uppercase tracking-wider text-black/45">Tenant</span>
          <span className="block truncate text-sm font-semibold text-black/90">{active.name}</span>
        </span>
        <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-black/40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="8 9 12 5 16 9" />
          <polyline points="8 15 12 19 16 15" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 right-0 top-full z-40 mt-2 max-h-[28rem] overflow-hidden rounded-xl border border-black/10 bg-white shadow-2xl"
        >
          <div className="border-b border-black/10 p-2">
            <div className="flex items-center gap-2 rounded-lg border border-sky-400/70 bg-white px-2.5 py-1.5 ring-2 ring-sky-200/50">
              <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 text-black/40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search for a sub-account"
                className="w-full bg-transparent text-sm outline-none placeholder:text-black/40"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto px-2 py-2">
            <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-black/40">All accounts</div>
            {filtered.length === 0 && (
              <div className="px-2 py-6 text-center text-xs text-black/50">No matches.</div>
            )}
            <ul className="flex flex-col gap-1.5">
              {filtered.map(a => {
                const isActive = a.id === activeAgencyId;
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => onPick(a.id)}
                      disabled={busy}
                      data-agency-id={a.id}
                      data-active={isActive ? "true" : undefined}
                      className={[
                        "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition",
                        isActive
                          ? "border-sky-300 bg-sky-50/60"
                          : "border-black/10 bg-white hover:border-black/20 hover:bg-black/[0.02]",
                      ].join(" ")}
                    >
                      <span
                        aria-hidden
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                        style={{ background: a.swatch ?? "#cbd5e1" }}
                      >
                        {initialOf(a.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-black/90">{a.name}</span>
                        {a.subtitle && (
                          <span className="block truncate text-[11px] text-black/50">{a.subtitle}</span>
                        )}
                      </span>
                      {isActive && (
                        <span aria-label="Active" className="text-xs text-sky-600">✓</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="border-t border-black/10 p-2">
            {!adding ? (
              <button
                type="button"
                onClick={() => { setAdding(true); setError(null); }}
                disabled={busy}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-black/75 hover:bg-black/[0.04]"
              >
                <span aria-hidden className="text-base leading-none">＋</span>
                <span>Add new agency</span>
              </button>
            ) : (
              <form onSubmit={onAdd} className="space-y-2 p-1">
                <label className="block text-xs font-medium text-black/70">
                  Agency name
                  <input
                    type="text"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    autoFocus required disabled={busy}
                    placeholder="AquaOasis · Therapists"
                    className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm"
                  />
                </label>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => { setAdding(false); setNewName(""); setError(null); }} disabled={busy}
                    className="rounded-md px-2.5 py-1.5 text-xs text-black/65 hover:bg-black/5">
                    Cancel
                  </button>
                  <button type="submit" disabled={busy || !newName.trim()}
                    className="rounded-md bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-medium text-white shadow hover:opacity-90 disabled:opacity-60">
                    {busy ? "Adding…" : "Create + switch"}
                  </button>
                </div>
              </form>
            )}
            {error && <p role="alert" className="mt-1 px-2 text-[11px] text-red-600">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
