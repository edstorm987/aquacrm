"use client";

// Company switcher — the sidebar tile that says which company you are
// operating as, and lets you become another one.
//
// Re-fitted from `src/archive/multi-agency/components/TenantSwitcher.tsx`.
// What was kept: the whole interaction model (tile → searchable popover →
// POST → hard navigate), the swatch/initial treatment, the click-outside and
// Escape handling, and the Tailwind classes — those still match today's
// chrome. What was dropped and why:
//
//   • "Add new agency" + the /api/auth/agency-add call. Creating a tenant is
//     a different job from switching between the ones you have, and the
//     archived endpoint leans on `bootstrapAgency` + `addUserAgencyMembership`
//     which have moved on. Left archived on purpose.
//   • The sibling `AgencySwitcher.tsx` (the Topbar title variant) is dead:
//     every `mm-tenant-*` class it styles itself with was removed from the
//     stylesheets while it sat in the archive, so it would render unstyled.
//     This component replaces it rather than reviving it.
//   • `agencies` / `activeAgencyId` props. The archived component was fed by
//     a layout; the layouts are owned elsewhere, so this one asks the server
//     for its own options. That also means the list is always the server's
//     answer about membership, not something a parent computed.
//
// Renders NOTHING when there is nothing to switch to (one company, a client
// workspace, or a borrowed/demo session), so it is safe to mount everywhere.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface CompanyOption {
  id: string;
  name: string;
  slug: string;
  swatch?: string;
}

interface OptionsResponse {
  ok?: boolean;
  activeAgencyId?: string;
  canSwitch?: boolean;
  agencies?: CompanyOption[];
}

function initialOf(name: string): string {
  return (name.trim().charAt(0) || "?").toUpperCase();
}

export function CompanySwitcher() {
  const [options, setOptions] = useState<CompanyOption[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [canSwitch, setCanSwitch] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/switch-agency", { credentials: "same-origin" });
        if (!res.ok) return;
        const data = (await res.json()) as OptionsResponse;
        if (cancelled || !data.ok) return;
        setOptions(Array.isArray(data.agencies) ? data.agencies : []);
        setActiveId(typeof data.activeAgencyId === "string" ? data.activeAgencyId : "");
        setCanSwitch(data.canSwitch === true);
      } catch {
        // Silent: the switcher is chrome, not a workflow. A failed lookup
        // leaves the sidebar exactly as it was before this component existed.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = useMemo(
    () => options.find(o => o.id === activeId) ?? options[0],
    [options, activeId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q));
  }, [options, query]);

  const onPick = useCallback(async (id: string) => {
    if (id === activeId) { setOpen(false); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/switch-agency", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agencyId: id }),
      });
      const data = (await res.json().catch(() => null)) as
        { ok?: boolean; redirect?: string; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error === "forbidden" ? "You don't have access to that company." : (data?.error ?? "Couldn't switch."));
        setBusy(false);
        return;
      }
      // Hard navigate: the session cookie changed, so every server component
      // on the page is now stale. A client-side route push would keep them.
      window.location.href = data.redirect ?? "/portal";
    } catch {
      setError("Network error. Try again.");
      setBusy(false);
    }
  }, [activeId]);

  // Nothing to switch between → render nothing at all.
  if (!canSwitch || options.length < 2 || !active) return null;

  return (
    <div ref={wrapRef} className="relative mt-2" data-testid="company-switcher">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Active company: ${active.name}. Click to switch.`}
        className="group flex w-full items-center gap-2.5 rounded-lg border border-black/10 bg-white/65 px-2.5 py-2 text-left shadow-sm transition hover:border-black/20 hover:bg-white"
      >
        <span
          aria-hidden
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
          style={{ background: active.swatch ?? "#94a3b8" }}
        >
          {initialOf(active.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[10px] font-medium uppercase tracking-wide text-black/45">Company</span>
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
          className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-xl border border-black/10 bg-white shadow-2xl"
        >
          {options.length > 5 && (
            <div className="border-b border-black/10 p-2">
              <input
                type="text"
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search companies"
                aria-label="Search companies"
                className="w-full rounded-lg border border-black/15 px-2.5 py-1.5 text-sm outline-none placeholder:text-black/40"
              />
            </div>
          )}
          <div className="max-h-72 overflow-y-auto px-2 py-2">
            <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-black/40">Your companies</div>
            {filtered.length === 0 && (
              <div className="px-2 py-6 text-center text-xs text-black/50">No matches.</div>
            )}
            <ul className="flex flex-col gap-1.5">
              {filtered.map(o => {
                const isActive = o.id === activeId;
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void onPick(o.id)}
                      disabled={busy}
                      data-agency-id={o.id}
                      data-active={isActive ? "true" : undefined}
                      className={[
                        "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition disabled:opacity-60",
                        isActive
                          ? "border-sky-300 bg-sky-50/60"
                          : "border-black/10 bg-white hover:border-black/20 hover:bg-black/[0.02]",
                      ].join(" ")}
                    >
                      <span
                        aria-hidden
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                        style={{ background: o.swatch ?? "#cbd5e1" }}
                      >
                        {initialOf(o.name)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-black/90">{o.name}</span>
                      {isActive && <span aria-label="Active" className="text-xs text-sky-600">✓</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          {error && <p role="alert" className="border-t border-black/10 px-3 py-2 text-[11px] text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
