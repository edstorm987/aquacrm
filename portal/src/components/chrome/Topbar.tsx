// Topbar — tenant title, role badge, sign-out. Server-rendered.
//
// Mobile: a hamburger button sits before the title and toggles the
// MobileNav drawer; on `md+` the hamburger hides via Tailwind. The
// role/email cluster collapses to two rows on `<sm` so nothing
// overflows.

import Link from "next/link";
import type { Role } from "@/server/types";
import { MobileNav } from "@/components/chrome/MobileNav";
import { ProfileMenu } from "@/components/chrome/ProfileMenu";
import { TopbarBackButton } from "@/components/chrome/TopbarBackButton";
import type { NavPanel } from "@/lib/chrome/sidebarLayout";
import type { ReactNode } from "react";
import { ColorModeToggle } from "@/components/chrome/ColorModeToggle";
import { PortalSearch } from "@/components/chrome/PortalSearch";
import { ShowcaseModeControl } from "@/components/chrome/ShowcaseModeControl";
import { PublicShowcaseControl } from "@/components/chrome/PublicShowcaseControl";
import { PrivacyModeControl } from "@/components/chrome/PrivacyModeControl";

interface Props {
  title: string;
  subtitle?: string;
  role: Role;
  email: string;
  /** Optional display name for the profile menu. Falls back to email. */
  name?: string;
  /** R036: optional profile picture data URL — threaded through to ProfileMenu. */
  avatarUrl?: string;
  // When provided, renders the hamburger + drawer with these panels.
  // Each scope layout (agency / client / customer) already builds
  // these for the desktop Sidebar — we just pass the same payload
  // through.
  panels?: NavPanel[];
  tenantLabel?: string;
  currentPath?: string;
  /** Sandboxed demo session — show "Back to website" exit. */
  isDemo?: boolean;
  showcaseMode?: boolean;
  publicShowcase?: boolean;
  /** Phase preview cookie active for this scope — show "Exit preview" → phases admin. */
  previewActive?: boolean;
  notifications?: ReactNode;
  companySwitcher?: ReactNode;
  privacyTerms?: string[];
}

export function Topbar({ title, subtitle, role, email, name, avatarUrl, panels, tenantLabel, currentPath, isDemo, showcaseMode, publicShowcase, previewActive, notifications, companySwitcher, privacyTerms }: Props) {
  const searchItems = panels?.flatMap(panel => panel.items.map(item => ({ label: item.label, href: item.href }))) ?? [];
  const recordsEnabled = role === "agency-owner" || role === "agency-manager" || role === "agency-staff";
  return (
    <header className="z-40 flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-black/10 bg-white/40 px-4 py-2 backdrop-blur-xl md:px-6">
      <div className="flex items-center gap-3 min-w-0">
        {panels && tenantLabel && currentPath && (
          <MobileNav panels={panels} tenantLabel={tenantLabel} currentPath={currentPath} />
        )}
        <TopbarBackButton />
        <div className="mm-private-chrome hidden min-w-0 sm:block">
          <p className="truncate text-sm font-semibold text-black/80">{title}</p>
          {subtitle ? <p className="truncate text-[11px] text-black/40">{subtitle}</p> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs sm:gap-3">
        {!publicShowcase && companySwitcher ? <div className="mm-private-chrome">{companySwitcher}</div> : null}
        {searchItems.length ? <PortalSearch items={searchItems} recordsEnabled={recordsEnabled} /> : null}
        <PrivacyModeControl
          canEnterShowcase={!publicShowcase && (role === "agency-owner" || role === "agency-manager")}
          showcaseMode={showcaseMode}
          sensitiveTerms={[email, name ?? "", ...(privacyTerms ?? [])]}
        />
        {publicShowcase ? <PublicShowcaseControl /> : showcaseMode ? <ShowcaseModeControl /> : notifications}
        <ColorModeToggle />
        {previewActive ? (
          <Link
            href="/portal/agency/phases"
            aria-label="Exit phase preview and return to your portal account"
            className="rounded-md border border-[#C9A76A]/60 bg-[#FAF7EE] px-2 py-1 text-[#8A6A2D] hover:bg-[#F4ECD9]"
          >
            <span aria-hidden>←</span> Back to portal account
          </Link>
        ) : isDemo && !showcaseMode && !publicShowcase ? (
          <Link
            href="/"
            aria-label="Back to the marketing site"
            className="rounded-md border border-black/10 bg-white px-2 py-1 text-black/70 hover:bg-black/5"
          >
            <span aria-hidden>←</span> Back to website
          </Link>
        ) : null}
        {publicShowcase ? (
          <span className="hidden rounded-md border border-black/10 bg-white px-2 py-1 font-medium text-black/55 sm:inline">Demo visitor</span>
        ) : (
          <div className="mm-private-chrome"><ProfileMenu email={email} role={role} name={name} avatarUrl={avatarUrl} /></div>
        )}
      </div>
    </header>
  );
}
