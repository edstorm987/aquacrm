"use client";

// Topbar profile menu — circle avatar trigger; popover with
//   · header tile (avatar + UPPERCASE name + email)
//   · "Login As" row that expands into a search-able persona list
//     (founder + demo personas — same set as /dev/pov)
//   · "Signout" row
//
// Tailwind-only (the portal doesn't load /website/styles.css).

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Role } from "@/server/types";

const ROLE_LABEL: Record<Role, string> = {
  "agency-owner":   "Agency owner",
  "agency-manager": "Agency manager",
  "agency-staff":   "Agency staff",
  "client-owner":   "Client owner",
  "client-staff":   "Client staff",
  "freelancer":     "Freelancer",
  "end-customer":   "Customer",
  "lead":           "Lead",
};

interface Props {
  email: string;
  role: Role;
  name?: string;
  avatarUrl?: string;
}

type Persona = "founder" | "demo-owner" | "demo-employee" | "demo-client" | "demo-customer";
interface PersonaOption {
  id: Persona;
  name: string;
  email: string;
  swatch: string;
}

const PERSONAS: PersonaOption[] = [
  { id: "founder",        name: "Ed Hallam — Founder",     email: "edwardhallam07@gmail.com",  swatch: "#84CC16" },
  { id: "demo-owner",     name: "Demo agency-owner",       email: "demo@aqua.dev",             swatch: "#0EA5A4" },
  { id: "demo-employee",  name: "Demo employee (staff)",   email: "staff@aqua.dev",            swatch: "#6366F1" },
  { id: "demo-client",    name: "Felicia — Luv & Ker",     email: "felicia@luvandker.demo",    swatch: "#7C3AED" },
  { id: "demo-customer",  name: "Demo end-customer",       email: "demo-shopper@aqua.test",    swatch: "#F59E0B" },
];

function initials(seed: string): string {
  const t = seed.trim();
  if (!t) return "?";
  const parts = t.split(/[\s@.]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0]! + parts[1][0]!).toUpperCase();
  return parts[0]!.slice(0, 2).toUpperCase();
}

export function ProfileMenu({ email, role, name, avatarUrl }: Props) {
  const display = name?.trim() || email;
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"main" | "switch">("main");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<Persona | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) {
        setOpen(false); setView("main"); setQuery(""); setError(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (view === "switch") { setView("main"); setQuery(""); }
        else setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, view]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PERSONAS;
    return PERSONAS.filter(p =>
      p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q),
    );
  }, [query]);

  async function pickPersona(p: Persona) {
    setBusy(p); setError(null);
    try {
      const res = await fetch("/api/dev/login-as", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ persona: p }),
      });
      const data = (await res.json()) as { ok: boolean; redirect?: string; error?: string };
      if (!res.ok || !data.ok) { setError(data.error ?? "Couldn't switch."); setBusy(null); return; }
      if (typeof window !== "undefined") window.location.href = data.redirect ?? "/portal";
    } catch { setError("Network error. Try again."); setBusy(null); }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setView("main"); }}
        aria-label={`Account for ${display}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-black/15 bg-white text-[12px] font-semibold text-black/80 shadow-sm transition hover:border-black/30 hover:bg-black/[0.03]"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" aria-hidden="true" data-testid="mm-profile-avatar-img" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden="true">{initials(display)}</span>
        )}
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-80 overflow-hidden rounded-xl border border-black/10 bg-white shadow-2xl">
          {/* Header tile */}
          <div className="flex items-center gap-3 px-4 py-4">
            <span aria-hidden className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white" style={{ background: "#84CC16" }}>
              {initials(display)}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold uppercase tracking-wide text-black/90">{display}</div>
              <div className="truncate text-[12px] text-black/55">{email}</div>
              <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-black/40">{ROLE_LABEL[role] ?? role}</div>
            </div>
          </div>

          {view === "main" ? (
            <>
              <div className="border-t border-black/10 px-2 py-2">
                <Link
                  href="/portal/account"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-black/80 hover:bg-black/[0.04]"
                >
                  <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 text-black/55" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                  </svg>
                  <span className="flex-1">Edit profile</span>
                  <span aria-hidden className="text-black/30">›</span>
                </Link>
                <Link
                  href="/portal/account/preferences"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-black/80 hover:bg-black/[0.04]"
                >
                  <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 text-black/55" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  <span className="flex-1">Preferences</span>
                  <span aria-hidden className="text-black/30">›</span>
                </Link>
                <Link
                  href="/portal/account/permissions"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-black/80 hover:bg-black/[0.04]"
                >
                  <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 text-black/55" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <span className="flex-1">Permissions</span>
                  <span aria-hidden className="text-black/30">›</span>
                </Link>
                <button
                  type="button"
                  onClick={() => { setView("switch"); setQuery(""); setError(null); }}
                  className="mt-1 flex w-full items-center gap-3 rounded-md border-2 border-sky-500 bg-sky-50/40 px-3 py-2.5 text-left text-sm text-black/85 hover:bg-sky-50"
                >
                  <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 text-sky-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
                  </svg>
                  <span className="flex-1">Login As</span>
                  <span aria-hidden className="text-black/40">›</span>
                </button>
              </div>
              <form action="/api/auth/logout" method="post" className="border-t border-black/10 px-2 py-2">
                <button type="submit" className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-red-600 hover:bg-red-50">
                  <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  <span>Signout</span>
                </button>
              </form>
            </>
          ) : (
            <div className="border-t border-black/10">
              <div className="p-3">
                <div className="flex items-center gap-2 rounded-lg border-2 border-sky-500 bg-white px-3 py-2">
                  <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 text-black/40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    autoFocus
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search users"
                    className="w-full bg-transparent text-sm outline-none placeholder:text-black/40"
                  />
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto px-3 pb-3">
                <div className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-black/40">All users</div>
                {filtered.length === 0 && (
                  <div className="px-2 py-6 text-center text-xs text-black/50">No matches.</div>
                )}
                <ul className="flex flex-col gap-2">
                  {filtered.map(p => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => pickPersona(p.id)}
                        disabled={!!busy}
                        className="flex w-full items-center gap-3 rounded-lg border border-black/10 bg-white px-3 py-2 text-left transition hover:border-black/20 hover:bg-black/[0.02] disabled:opacity-60"
                      >
                        <span aria-hidden className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white" style={{ background: p.swatch }}>
                          {initials(p.name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-black/90">{p.name}</span>
                          <span className="block truncate text-[12px] text-black/50">{p.email}</span>
                        </span>
                        {busy === p.id && <span className="text-[11px] text-black/50">…</span>}
                      </button>
                    </li>
                  ))}
                </ul>
                {error && <p role="alert" className="mt-2 px-1 text-[11px] text-red-600">{error}</p>}
              </div>
              <div className="flex items-center justify-between border-t border-black/10 px-3 py-2">
                <button type="button" onClick={() => { setView("main"); setQuery(""); }} className="text-[12px] text-black/60 hover:text-black/80">
                  ← Back
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
