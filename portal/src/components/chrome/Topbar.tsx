// Topbar — tenant title, role badge, sign-out. Server-rendered.
//
// Mobile: a hamburger button sits before the title and toggles the
// MobileNav drawer; on `md+` the hamburger hides via Tailwind. The
// role/email cluster collapses to two rows on `<sm` so nothing
// overflows.

import Link from "next/link";
import type { Role } from "@/server/types";
import { MobileNav } from "@/components/chrome/MobileNav";
import { AgencySwitcher, type AgencyOption } from "@/components/chrome/AgencySwitcher";
import { ProfileMenu } from "@/components/chrome/ProfileMenu";
import type { NavPanel } from "@/lib/chrome/sidebarLayout";

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
  // R026: optional agency-switcher inputs. Pass session.agencyIds[]
  // resolved to AgencyOption[] (id + name + brand swatch) plus the
  // current activeAgencyId. Switcher hides itself when ≤1 agency.
  agencies?: AgencyOption[];
  activeAgencyId?: string;
  /** Sandboxed demo session — show "Back to website" exit. */
  isDemo?: boolean;
  /** Phase preview cookie active for this scope — show "Exit preview" → phases admin. */
  previewActive?: boolean;
}

export function Topbar({ title, subtitle, role, email, name, avatarUrl, panels, tenantLabel, currentPath, agencies, activeAgencyId, isDemo, previewActive }: Props) {
  // Ed's directive 2026-05-07 — the agency-name title slot IS the
  // tenant switcher. Renders a real <details> button with brand
  // swatch + "+ Add agency" entry. Falls back to plain title text
  // when the layout doesn't pass agencies (client / customer
  // surfaces today; they get richer multi-tenancy in R+1).
  const showSwitcher = !!(agencies && activeAgencyId);
  return (
    <header className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-black/10 bg-white/40 px-4 py-2 md:px-6">
      <div className="flex items-center gap-3 min-w-0">
        {panels && tenantLabel && currentPath && (
          <MobileNav panels={panels} tenantLabel={tenantLabel} currentPath={currentPath} />
        )}
        {showSwitcher && (
          <AgencySwitcher agencies={agencies!} activeAgencyId={activeAgencyId!} subtitle={subtitle} />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs sm:gap-3">
        {previewActive ? (
          <Link
            href="/portal/agency/phases"
            aria-label="Exit phase preview and return to your portal account"
            className="rounded-md border border-[#C9A76A]/60 bg-[#FAF7EE] px-2 py-1 text-[#8A6A2D] hover:bg-[#F4ECD9]"
          >
            <span aria-hidden>←</span> Back to portal account
          </Link>
        ) : isDemo ? (
          <Link
            href="/"
            aria-label="Back to the marketing site"
            className="rounded-md border border-black/10 bg-white px-2 py-1 text-black/70 hover:bg-black/5"
          >
            <span aria-hidden>←</span> Back to website
          </Link>
        ) : null}
        <ProfileMenu email={email} role={role} name={name} avatarUrl={avatarUrl} />
      </div>
    </header>
  );
}
