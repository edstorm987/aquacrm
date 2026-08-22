// Topbar — tenant title, role badge, sign-out. Server-rendered.
//
// Phone layouts: a menu button sits before the title and toggles the
// MobileNav drawer; on `md+` the persistent sidebar takes over and the
// drawer trigger hides. The
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
import { PinCurrentControl, PinnedTabsBar } from "@/components/chrome/PinnedTabs";
import { ShowcaseModeControl } from "@/components/chrome/ShowcaseModeControl";
import { InspectorModeControl } from "@/components/chrome/InspectorModeControl";
import { PublicShowcaseControl } from "@/components/chrome/PublicShowcaseControl";
import { PrivacyModeControl } from "@/components/chrome/PrivacyModeControl";
import { DevConsoleControl } from "@/components/chrome/DevConsoleControl";
import { Sparkles } from "lucide-react";
import type { SidebarVariant } from "@/components/chrome/Sidebar";

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
  sidebarVariant?: SidebarVariant;
  /** Sandboxed demo session — show "Back to website" exit. */
  isDemo?: boolean;
  /** The topbar exit link. Defaults preserve today's behaviour for every
   *  existing caller: href "/" (the marketing site) labelled "Back to website".
   *  Dev Team passes a ROLE-dependent home (resolvePostLoginPath) + "Back to
   *  home" so the way out lands on the operator's own portal, never the
   *  marketing site or a hardcoded agency route. */
  homeHref?: string;
  homeLabel?: string;
  showcaseMode?: boolean;
  publicShowcase?: boolean;
  /** Dev Mode (local/dev only) — surfaces the demo-persona toggle in the
   *  account menu. Both flags default off; only the agency layout sets them. */
  canUseDevMode?: boolean;
  devModeActive?: boolean;
  /** Founder + Dev Mode — mount the ambient Dev Console peek. Server-decided:
   *  each layout passes `canUseDevMode() && effectiveRole(session).isFounder`,
   *  so turning Dev Mode off removes the icon everywhere at once. */
  devConsole?: boolean;
  /** Phase preview cookie active for this scope — show "Exit preview" → phases admin. */
  previewActive?: boolean;
  notifications?: ReactNode;
  radarControl?: ReactNode;
  companySwitcher?: ReactNode;
  advisorControl?: ReactNode;
  privacyTerms?: string[];
  searchRecordsEnabled?: boolean;
  /** Inside somebody else's workspace — show the way OUT. */
  inspecting?: boolean;
  inspectingLabel?: string;
}

export function Topbar({ title, subtitle, role, email, name, avatarUrl, panels, tenantLabel, currentPath, sidebarVariant = "standard", isDemo, homeHref, homeLabel, showcaseMode, publicShowcase, canUseDevMode, devModeActive, devConsole, previewActive, notifications, radarControl, companySwitcher, advisorControl, privacyTerms, searchRecordsEnabled, inspecting, inspectingLabel }: Props) {
  const searchItems = panels?.flatMap(panel => panel.items.map(item => ({ label: item.label, href: item.href }))) ?? [];
  const recordsEnabled = searchRecordsEnabled ?? (role === "agency-owner" || role === "agency-manager" || role === "agency-staff");
  const advisorEnabled = role === "agency-owner" || role === "agency-manager";
  return (
    <>
    <header className="mm-portal-topbar relative z-40 flex min-h-14 shrink-0 items-center justify-between gap-1.5 border-b border-black/10 bg-white/40 px-3 py-2 backdrop-blur-xl sm:gap-2 sm:px-4 md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-3">
        {panels && tenantLabel && currentPath && (
          <MobileNav panels={panels} tenantLabel={tenantLabel} currentPath={currentPath} sidebarVariant={sidebarVariant} />
        )}
        <TopbarBackButton />
        {!publicShowcase ? <PinCurrentControl label={title} /> : null}
        <div className="mm-private-chrome hidden min-w-0 sm:block">
          <p className="truncate text-sm font-semibold text-black/80">{title}</p>
          {subtitle ? <p className="truncate text-[11px] text-black/40">{subtitle}</p> : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-nowrap items-center gap-1 text-xs sm:gap-2 lg:gap-3">
        {!publicShowcase && companySwitcher ? <div className="mm-private-chrome hidden lg:block">{companySwitcher}</div> : null}
        {searchItems.length ? <PortalSearch items={searchItems} recordsEnabled={recordsEnabled} /> : null}
        {advisorEnabled ? advisorControl ?? <Link href="/portal/agency/assistant" aria-label="Open Aqua Advisor" className="inline-flex size-9 items-center justify-center gap-2 rounded-md border border-black/10 bg-white/60 text-black/55 transition hover:bg-white hover:text-black xl:w-auto xl:px-3"><Sparkles size={16} /><span className="hidden text-xs font-semibold xl:inline">Advisor</span></Link> : null}
        <PrivacyModeControl
          canEnterShowcase={!publicShowcase && (role === "agency-owner" || role === "agency-manager")}
          showcaseMode={showcaseMode}
          sensitiveTerms={[email, name ?? "", ...(privacyTerms ?? [])]}
        />
        {devConsole && !publicShowcase && !showcaseMode ? <DevConsoleControl /> : null}
        {!publicShowcase ? radarControl : null}
        {inspecting ? <InspectorModeControl label={inspectingLabel} /> : null}
        {publicShowcase ? <PublicShowcaseControl /> : showcaseMode ? <ShowcaseModeControl /> : notifications}
        <div className="hidden sm:block"><ColorModeToggle /></div>
        {previewActive ? (
          <Link
            href="/portal/agency/phases"
            aria-label="Exit phase preview and return to your portal account"
            className="rounded-md border border-[#C9A76A]/60 bg-[#FAF7EE] px-2 py-1 text-[#8A6A2D] hover:bg-[#F4ECD9]"
          >
            <span aria-hidden>←</span> Back to portal account
          </Link>
        ) : homeHref || (isDemo && !showcaseMode && !publicShowcase && !devModeActive) ? (
          // One exit link. Existing callers pass neither prop → href "/" +
          // "Back to website" (unchanged demo behaviour). A caller that passes
          // homeHref (Dev Team → resolvePostLoginPath) shows it regardless of
          // demo/dev-mode, so the role-home exit is always the way out there.
          <Link
            href={homeHref ?? "/"}
            aria-label={homeLabel ?? "Back to website"}
            className="inline-flex size-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-black/10 bg-white text-black/70 hover:bg-black/5 lg:size-auto lg:px-2 lg:py-1"
          >
            <span aria-hidden>←</span><span className="hidden lg:inline">{homeLabel ?? "Back to website"}</span>
          </Link>
        ) : null}
        {publicShowcase ? (
          <span className="mm-public-showcase-visitor hidden rounded-md border border-black/10 bg-white px-2 py-1 font-medium text-black/55 sm:inline">Demo visitor</span>
        ) : (
          <div className="mm-private-chrome"><ProfileMenu email={email} role={role} name={name} avatarUrl={avatarUrl} canUseDevMode={canUseDevMode} devModeActive={devModeActive} /></div>
        )}
      </div>
    </header>
    {!publicShowcase ? <PinnedTabsBar /> : null}
    </>
  );
}
