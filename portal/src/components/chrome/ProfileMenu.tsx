"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Role } from "@/server/types";

const ROLE_LABEL: Record<Role, string> = {
  "agency-owner": "Agency owner",
  "agency-manager": "Agency manager",
  "agency-staff": "Agency staff",
  "client-owner": "Client owner",
  "client-staff": "Client staff",
  freelancer: "Freelancer",
  "end-customer": "Customer",
  lead: "Lead",
};

interface Props {
  email: string;
  role: Role;
  name?: string;
  avatarUrl?: string;
}

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
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
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
          <div className="flex items-center gap-3 px-4 py-4">
            <span aria-hidden className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#84CC16] text-base font-semibold text-white">
              {initials(display)}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold uppercase tracking-wide text-black/90">{display}</div>
              <div className="truncate text-[12px] text-black/55">{email}</div>
              <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-black/40">{ROLE_LABEL[role] ?? role}</div>
            </div>
          </div>

          <div className="border-t border-black/10 px-2 py-2">
            <Link
              href={role === "end-customer" ? "/portal/customer/account" : "/portal/account"}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-black/80 hover:bg-black/[0.04]"
            >
              <span className="flex-1">Edit profile</span>
              <span aria-hidden className="text-black/30">›</span>
            </Link>
            {role === "end-customer" ? (
              <Link
                href="/portal/customer/support"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-black/80 hover:bg-black/[0.04]"
              >
                <span className="flex-1">Client support</span>
                <span aria-hidden className="text-black/30">›</span>
              </Link>
            ) : (
              <Link
                href="/portal/account/permissions"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-black/80 hover:bg-black/[0.04]"
              >
                <span className="flex-1">Permissions</span>
                <span aria-hidden className="text-black/30">›</span>
              </Link>
            )}
          </div>

          <form action="/api/auth/logout" method="post" className="border-t border-black/10 px-2 py-2">
            <button type="submit" className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-red-600 hover:bg-red-50">
              <span className="flex-1">Sign out</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
