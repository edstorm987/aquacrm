"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Eye, LogOut, ShieldCheck, UserRound } from "lucide-react";
import type { Role } from "@/server/types";
import { ColorModeToggle } from "./ColorModeToggle";

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
  accountLabel?: string;
}

function initials(seed: string): string {
  const t = seed.trim();
  if (!t) return "?";
  const parts = t.split(/[\s@.]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0]! + parts[1][0]!).toUpperCase();
  return parts[0]!.slice(0, 2).toUpperCase();
}

function accountDisplayName(name: string | undefined, email: string): string {
  if (name?.trim()) return name.trim();
  const local = email.split("@")[0]?.trim() || "Account";
  if (/^edwardhallam\d*$/i.test(local)) return "Ed Hallam";
  const firstPart = local.split(/[._-]+/)[0]?.replace(/\d+$/, "") || "Account";
  return firstPart.charAt(0).toUpperCase() + firstPart.slice(1);
}

export function ProfileMenu({ email, role, name, avatarUrl, accountLabel = "AquaCRM account" }: Props) {
  const display = accountDisplayName(name, email);
  const firstName = display.split(/\s+/)[0] || "Account";
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
        data-open={open ? "true" : "false"}
        className="mm-profile-trigger inline-flex h-10 w-10 items-center gap-2 rounded-md border border-[#D4B888]/45 bg-[#FFFDF8] p-[3px] text-[#171009] shadow-sm transition hover:border-[#D4B888]/75 hover:bg-[#FAF3E5] sm:w-auto sm:p-1 sm:pr-2"
      >
        <span className="inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#D4B888] text-[11px] font-bold text-[#171009]">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" aria-hidden="true" data-testid="mm-profile-avatar-img" className="h-full w-full object-cover" />
          ) : (
            <span aria-hidden="true">{initials(display)}</span>
          )}
        </span>
        <span className="hidden max-w-24 truncate text-xs font-semibold sm:block">{firstName}</span>
        <ChevronDown size={13} aria-hidden="true" className={`hidden text-[#D4B888] transition-transform sm:block ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div role="menu" className="mm-profile-menu fixed inset-x-3 top-16 z-[80] max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-lg border border-[#D4B888]/35 bg-[#FFFDF8] shadow-2xl shadow-black/20 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80">
          <div className="mm-profile-menu-header border-b border-[#E7DDC9] px-4 pb-4 pt-3 text-[#2A2520]">
            <p className="mm-profile-menu-account-label mb-3 text-[10px] font-semibold uppercase tracking-wide text-[#8E7340]">{accountLabel}</p>
            <div className="flex items-center gap-3">
            <span aria-hidden className="inline-flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#D4B888] text-base font-bold text-[#171009]">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : initials(display)}
            </span>
            <div className="min-w-0">
              <div className="mm-profile-menu-name truncate text-sm font-semibold text-[#2A2520]">{display}</div>
              <div className="mm-profile-menu-email truncate text-xs text-[#665C4E]">{email}</div>
              <div className="mm-profile-menu-role mt-1 text-[10px] font-medium uppercase tracking-wide text-[#8E7340]">{ROLE_LABEL[role] ?? role}</div>
            </div>
            </div>
          </div>

          <div className="px-2 py-2">
            <ColorModeToggle variant="menu" />
            <Link
              href={role === "end-customer" ? "/portal/customer/account" : "/portal/account"}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-[#2A2520] hover:bg-[#F4ECD9]"
            >
              <UserRound size={16} className="text-[#8E7340]" aria-hidden="true" />
              <span className="flex-1">Edit profile</span>
            </Link>
            {role === "end-customer" ? (
              <Link
                href="/portal/customer/support"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-[#2A2520] hover:bg-[#F4ECD9]"
              >
                <ShieldCheck size={16} className="text-[#8E7340]" aria-hidden="true" />
                <span className="flex-1">Client support</span>
              </Link>
            ) : (
              <>
                <Link
                  href="/portal/account/permissions"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-[#2A2520] hover:bg-[#F4ECD9]"
                >
                  <ShieldCheck size={16} className="text-[#8E7340]" aria-hidden="true" />
                  <span className="flex-1">Permissions</span>
                </Link>
                {role.startsWith("agency-") ? (
                  <Link
                    href="/portal/agency/settings#showcase"
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-[#2A2520] hover:bg-[#F4ECD9]"
                  >
                    <Eye size={16} className="text-[#8E7340]" aria-hidden="true" />
                    <span className="flex-1">Showcase Mode</span>
                  </Link>
                ) : null}
              </>
            )}
          </div>

          <form action="/api/auth/logout" method="post" className="mm-profile-menu-footer border-t border-[#E7DDC9] px-2 py-2">
            <button type="submit" role="menuitem" className="mm-profile-menu-signout flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-[#7A2E24] hover:bg-[#F8E9E5]">
              <LogOut size={16} aria-hidden="true" />
              <span className="flex-1">Sign out</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
