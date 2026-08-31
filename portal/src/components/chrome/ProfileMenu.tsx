"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Clapperboard, FlaskConical, Gauge, LogOut, NotebookPen, ShieldCheck, UserRound } from "lucide-react";
import type { Role } from "@/server/types";
import { CUSTOMER_PORTAL_ROLES } from "@/server/types";
import { CINEMATIC_MODE_EVENT, CINEMATIC_MODE_STORAGE_KEY, cinematicModeEnabled, setCinematicMode } from "@/lib/chrome/cinematicMode";
import { performanceModeCookieEnabled, setPerformanceModeCookie } from "@/lib/chrome/performanceMode";
import { devIconCookieEnabled, setDevIconCookie } from "@/lib/chrome/devIconPreference";
import { useNotificationAttention } from "./NotificationAttentionProvider";
import { ColorModeToggle } from "./ColorModeToggle";
import { QuickNoteWindow } from "./QuickNoteWindow";
import { useMenuKeys } from "@/lib/a11y/useMenuKeys";

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
  /** Dev Mode (local/dev only) — show the demo-persona toggle row. Server
   *  computes this from `canUseDevMode()` + founder; defaults off. */
  canUseDevMode?: boolean;
  /** True when the current session is already a Dev Mode demo session
   *  (`devReturnAgencyId` set) — the toggle then reads "on" and exits. */
  devModeActive?: boolean;
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

export function ProfileMenu({ email, role, name, avatarUrl, accountLabel = "AquaCRM account", canUseDevMode = false, devModeActive = false }: Props) {
  const attention = useNotificationAttention();
  const display = accountDisplayName(name, email);
  const firstName = display.split(/\s+/)[0] || "Account";
  const [open, setOpen] = useState(false);
  const [quickNoteOpen, setQuickNoteOpen] = useState(false);
  const [cinematicMode, setCinematicModeState] = useState(false);
  const [performanceMode, setPerformanceModeState] = useState(true);
  const [devIconShown, setDevIconShown] = useState(true);
  const [devBusy, setDevBusy] = useState(false);

  // Opening the Dev Team workspace does NOT change who you are.
  //
  // It used to mint a demo-owner session, which meant the founder browsing his
  // own dev workspace was suddenly a different account looking at demo data.
  // The workspace is gated on founder-only Dev Team access already, so entering it is
  // plain navigation: Ed stays Ed, on his real account and real data, just
  // inside the workspace. Identity only changes when he deliberately INSPECTS a
  // persona (Dev Team → Profiles), and exiting that inspection returns him
  // here — the Showcase Mode shape.
  //
  // Leaving is navigation too. A session still carrying `devReturn*` (an agent
  // or a dev who entered the old way, or an inspection) is restored through the
  // mint route so they land back on their real account.
  async function toggleDevMode() {
    if (devBusy) return;
    if (!devModeActive) {
      // NOT a navigation. This toggle governs whether the topbar Dev Console
      // icon is shown; opening the workspace happens from inside that icon's
      // popover. Flip the server-readable cookie and reload so the topbar
      // re-renders with (or without) the icon.
      const next = !devIconShown;
      setDevIconShown(next);
      setDevIconCookie(next);
      return;
    }
    setDevBusy(true);
    try {
      const response = await fetch("/api/auth/dev-mode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "exit" }),
      });
      const result = await response.json() as { ok?: boolean; redirect?: string; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Dev Mode could not be changed.");
      window.location.assign(result.redirect || "/portal/agency");
    } catch {
      setDevBusy(false);
    }
  }
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // issues #138 — `role="menu"` told screen readers to use the arrow keys; now
  // they work, Home/End reach the ends, and Escape hands focus back to the
  // trigger instead of dropping it at the top of the document.
  useMenuKeys(wrapRef, { open, onOpen: () => setOpen(true), onClose: () => setOpen(false) });
  const attentionLevel = attention?.attentionWindow.level;
  const showFocusProtection = role.startsWith("agency-") && (attentionLevel === "elevated" || attentionLevel === "overload");
  // Which ACCOUNT these two links belong to is a question about the audience,
  // not about one role. `/portal/customer` serves the whole client-portal
  // audience since 2026-08-27, so a `client-owner` reading this menu inside
  // their portal must get the portal's account page and its support link — not
  // the agency-side `/portal/account` they can't reach anyway.
  const inClientPortal = (CUSTOMER_PORTAL_ROLES as readonly string[]).includes(role);
  const focusProtectionEnabled = attention?.focusProtectionEnabled ?? true;

  useEffect(() => {
    const sync = () => setCinematicModeState(cinematicModeEnabled());
    const syncCustom = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
      setCinematicModeState(typeof detail?.enabled === "boolean" ? detail.enabled : cinematicModeEnabled());
    };
    const syncStorage = (event: StorageEvent) => {
      if (event.key === CINEMATIC_MODE_STORAGE_KEY) sync();
    };
    sync();
    // Performance mode + dev-icon visibility are cookie-backed (server-read),
    // so hydrate their switch state from the current cookies once.
    setPerformanceModeState(performanceModeCookieEnabled());
    setDevIconShown(devIconCookieEnabled());
    window.addEventListener(CINEMATIC_MODE_EVENT, syncCustom);
    window.addEventListener("storage", syncStorage);
    return () => {
      window.removeEventListener(CINEMATIC_MODE_EVENT, syncCustom);
      window.removeEventListener("storage", syncStorage);
    };
  }, []);

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
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={cinematicMode}
              onClick={() => {
                const next = !cinematicMode;
                setCinematicModeState(next);
                setCinematicMode(next);
              }}
              className="mm-cinematic-mode-toggle flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-[#2A2520] hover:bg-[#F4ECD9]"
            >
              <Clapperboard size={16} className="text-[#8E7340]" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Cinematic mode</span>
                <span className="mt-0.5 block text-[10px] leading-4 text-[#776D60]">
                  {cinematicMode ? "Play transitions and load-in scenes" : "Transitions skipped for a faster feel"}
                </span>
              </span>
              <span aria-hidden="true" data-enabled={cinematicMode} className="mm-performance-mode-switch relative h-5 w-9 shrink-0 rounded-full border border-[#B9A98E] bg-[#E8DFCF] transition-colors data-[enabled=true]:border-[#087782] data-[enabled=true]:bg-[#087782]">
                <span className="absolute left-0.5 top-0.5 size-3.5 rounded-full bg-white shadow-sm transition-transform data-[enabled=true]:translate-x-4" data-enabled={cinematicMode} />
              </span>
            </button>
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={performanceMode}
              onClick={() => {
                const next = !performanceMode;
                setPerformanceModeState(next);
                // Cookie write + reload so the next SERVER render skips heavy work.
                setPerformanceModeCookie(next);
              }}
              className="mm-performance-mode-toggle flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-[#2A2520] hover:bg-[#F4ECD9]"
            >
              <Gauge size={16} className="text-[#8E7340]" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Performance mode</span>
                <span className="mt-0.5 block text-[10px] leading-4 text-[#776D60]">
                  {performanceMode ? "Per-page attention sweep paused — lighter navigation" : "Full attention sweep on every page"}
                </span>
              </span>
              <span aria-hidden="true" data-enabled={performanceMode} className="mm-performance-mode-switch relative h-5 w-9 shrink-0 rounded-full border border-[#B9A98E] bg-[#E8DFCF] transition-colors data-[enabled=true]:border-[#087782] data-[enabled=true]:bg-[#087782]">
                <span className="absolute left-0.5 top-0.5 size-3.5 rounded-full bg-white shadow-sm transition-transform data-[enabled=true]:translate-x-4" data-enabled={performanceMode} />
              </span>
            </button>
            {showFocusProtection ? (
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={focusProtectionEnabled}
                onClick={() => attention?.setFocusProtectionEnabled(!focusProtectionEnabled)}
                className="mm-focus-protection-toggle flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-[#2A2520] hover:bg-[#F4ECD9]"
              >
                <ShieldCheck size={16} className={attentionLevel === "overload" ? "text-[#B54848]" : "text-[#A66B19]"} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-medium">
                    Focus protection
                    <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase ${attentionLevel === "overload" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{attentionLevel}</span>
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-4 text-[#776D60]">
                    {focusProtectionEnabled
                      ? `Prioritising 5 of ${attention?.attentionWindow.total ?? 0} signals`
                      : `Full picture showing ${attention?.attentionWindow.total ?? 0} signals`}
                  </span>
                </span>
                <span aria-hidden="true" data-enabled={focusProtectionEnabled} className="mm-performance-mode-switch relative h-5 w-9 shrink-0 rounded-full border border-[#B9A98E] bg-[#E8DFCF] transition-colors data-[enabled=true]:border-[#087782] data-[enabled=true]:bg-[#087782]">
                  <span className="absolute left-0.5 top-0.5 size-3.5 rounded-full bg-white shadow-sm transition-transform data-[enabled=true]:translate-x-4" data-enabled={focusProtectionEnabled} />
                </span>
              </button>
            ) : null}
            {canUseDevMode ? (
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={devModeActive || devIconShown}
                disabled={devBusy}
                onClick={() => void toggleDevMode()}
                className="mm-dev-mode-toggle flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-[#2A2520] hover:bg-[#F4ECD9] disabled:opacity-60"
              >
                <FlaskConical size={16} className="text-[#8E7340]" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">Dev Mode</span>
                  <span className="mt-0.5 block text-[10px] leading-4 text-[#776D60]">
                    {devModeActive
                      ? "On demo data — switch back to your account"
                      : devIconShown
                        ? "Dev tools icon shown in the topbar"
                        : "Show the dev tools icon in the topbar"}
                  </span>
                </span>
                <span aria-hidden="true" data-enabled={devModeActive || devIconShown} className="mm-performance-mode-switch relative h-5 w-9 shrink-0 rounded-full border border-[#B9A98E] bg-[#E8DFCF] transition-colors data-[enabled=true]:border-[#087782] data-[enabled=true]:bg-[#087782]">
                  <span className="absolute left-0.5 top-0.5 size-3.5 rounded-full bg-white shadow-sm transition-transform data-[enabled=true]:translate-x-4" data-enabled={devModeActive || devIconShown} />
                </span>
              </button>
            ) : null}
            <Link
              href={inClientPortal ? "/portal/customer/account" : "/portal/account"}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-[#2A2520] hover:bg-[#F4ECD9]"
            >
              <UserRound size={16} className="text-[#8E7340]" aria-hidden="true" />
              <span className="flex-1">Edit profile</span>
            </Link>
            {inClientPortal ? (
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
                {role.startsWith("agency-") ? (
                  <Link
                    href="/portal/agency/calendar"
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-[#2A2520] hover:bg-[#F4ECD9]"
                  >
                    <CalendarDays size={16} className="text-[#8E7340]" aria-hidden="true" />
                    <span className="flex-1">My calendar</span>
                  </Link>
                ) : null}
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
                  <>
                    <Link
                      href="/portal/agency/settings#environment"
                      role="menuitem"
                      onClick={() => setOpen(false)}
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-[#2A2520] hover:bg-[#F4ECD9]"
                    >
                      <FlaskConical size={16} className="text-[#8E7340]" aria-hidden="true" />
                      <span className="flex-1">Environment</span>
                    </Link>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setOpen(false); setQuickNoteOpen(true); }}
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-[#2A2520] hover:bg-[#F4ECD9]"
                    >
                      <NotebookPen size={16} className="text-[#8E7340]" aria-hidden="true" />
                      <span className="flex-1">Quick note</span>
                    </button>
                  </>
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
      <QuickNoteWindow open={quickNoteOpen} onClose={() => setQuickNoteOpen(false)} />
    </div>
  );
}
