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
import { TopbarOverflow } from "@/components/chrome/TopbarOverflow";
import { ProfileMenu } from "@/components/chrome/ProfileMenu";
import { TopbarBackButton } from "@/components/chrome/TopbarBackButton";
import type { NavPanel } from "@/lib/chrome/sidebarLayout";
import { Fragment, type ReactNode } from "react";
import { ColorModeToggle } from "@/components/chrome/ColorModeToggle";
import { DeferredPortalSearch } from "@/components/chrome/DeferredPortalSearch";
import { PinCurrentControl, PinnedTabsBar } from "@/components/chrome/PinnedTabs";
import { SavedSpotArrival } from "@/components/chrome/SavedSpotArrival";
import { ShowcaseModeControl } from "@/components/chrome/ShowcaseModeControl";
import { InspectorModeControl } from "@/components/chrome/InspectorModeControl";
import { sharedChromeLinkPrefetch } from "@/lib/chrome/sharedChromeLinkPrefetch";
import { PublicShowcaseControl } from "@/components/chrome/PublicShowcaseControl";
import { PrivacyModeControl } from "@/components/chrome/PrivacyModeControl";
import { DevConsoleControl } from "@/components/chrome/DevConsoleControl";
import { topbarControlPins } from "@/lib/server/chrome/topbarControlPins";
import type { TopbarControl } from "@/components/chrome/TopbarOverflow";
import { Sparkles } from "lucide-react";
import type { SidebarVariant } from "@/components/chrome/Sidebar";
import { DepartmentSwitcher } from "@/components/chrome/DepartmentSwitcher";
import { MyRadarControl } from "@/components/chrome/MyRadarControl";
import { getActiveDepartmentId } from "@/lib/server/chrome/activeDepartment";
import { isAgencyRole } from "@/server/types";
import { destinationSearchItemsFor } from "@/lib/chrome/destinations";

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
  /** Canonical private sandbox environment is active. */
  sandboxMode?: boolean;
  publicShowcase?: boolean;
  /** Dev Mode (local/dev only) — surfaces the demo-persona toggle in the
   *  account menu. Both flags default off; only the agency layout sets them. */
  canUseDevMode?: boolean;
  devModeActive?: boolean;
  /** Founder-only Dev Team access — mount the ambient Dev Console peek. Server-decided:
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

export async function Topbar({ title, subtitle, role, email, name, avatarUrl, panels, tenantLabel, currentPath, sidebarVariant = "standard", isDemo, homeHref, homeLabel, showcaseMode, sandboxMode, publicShowcase, canUseDevMode, devModeActive, devConsole, previewActive, notifications, radarControl, companySwitcher, advisorControl, privacyTerms, searchRecordsEnabled, inspecting, inspectingLabel }: Props) {
  // Search indexes the APP, not the sidebar.
  //
  // It used to be `panels.flatMap(...)` alone — so the 20-odd routes with no
  // nav row were also unsearchable, and the two systems that should cover each
  // other's gaps had the same gap. Nav rows still come FIRST (they carry the
  // person's own labels and any plugin-contributed rows), with every remaining
  // destination behind them, deduped by href so a page in both appears once.
  const navSearchItems = panels?.flatMap(panel => panel.items.map(item => ({ label: item.label, href: item.href }))) ?? [];
  const navHrefs = new Set(navSearchItems.map(item => item.href.split("?")[0]));
  const searchItems = [
    ...navSearchItems,
    // Role-filtered (Ed, 2026-08-30): the registry half of search must meet
    // the same standard as the sidebar half — a viewer is never shown a door
    // their role cannot open. Dev surfaces ride the same visibility the dev
    // console icon already earns.
    ...destinationSearchItemsFor(role, Boolean(devConsole || canUseDevMode)).filter(item => !navHrefs.has(item.href)),
  ];
  const recordsEnabled = searchRecordsEnabled ?? (role === "agency-owner" || role === "agency-manager" || role === "agency-staff");
  const advisorEnabled = !publicShowcase && (role === "agency-owner" || role === "agency-manager");

  // The collapsible controls, as a LIST rather than opaque children.
  //
  // They used to be JSX children of `<TopbarOverflow>`. Ed asked on 2026-08-29
  // to be able to keep one or two of them on the bar itself instead of behind
  // the drawer, and a pin is stored as an id — so the overflow has to be able
  // to tell them apart, which it cannot do with an opaque `children` blob.
  // Each entry is still rendered exactly ONCE, in whichever place its pin state
  // puts it; see TopbarOverflow for why a second copy is not an option.
  //
  // `label` is the pin sheet's name for the control and its accessible name in
  // that sheet. `id` is the stored contract and never changes — see
  // `lib/chrome/topbarControls.ts`.
  // Each `node` carries a key. React tracks where an element was created, so an
  // element made HERE and handed on inside an array is a child of this
  // component as far as the reconciler is concerned — without one it warns, and
  // a later reorder would reconcile by position instead of identity.
  // Read here rather than inside the switcher: the sidebar is narrowed on the
  // server from this same value, so the control and the nav must be reading one
  // answer, not two taken a moment apart.
  const activeDepartment = await getActiveDepartmentId();

  const collapsible = ([
    !publicShowcase && companySwitcher
      ? { id: "company", label: "Company switcher", node: <div key="company" className="mm-private-chrome hidden lg:block">{companySwitcher}</div> }
      : null,
    // Agency side only, and never in a showcase or public shell. A department
    // hat is a statement about working IN this business; a client or an end
    // customer has no department to wear, and offering one would be nonsense
    // rather than merely useless.
    !publicShowcase && !showcaseMode && isAgencyRole(role)
      ? { id: "department", label: "Working as", node: <DepartmentSwitcher key="department" active={activeDepartment} /> }
      : null,
    // The judgement of the hat, beside the hat — same gate as "department", and
    // handed the same server-read department so the embedded switcher, the
    // standalone switcher and the nav all read one answer, not two taken a
    // moment apart. The control itself may still decide not to render (a staff
    // account whose overview view was revoked must not be handed the meters).
    !publicShowcase && !showcaseMode && isAgencyRole(role)
      ? { id: "my-radar", label: "My Radar", node: <MyRadarControl key="my-radar" activeDepartment={activeDepartment} /> }
      : null,
    searchItems.length
      ? { id: "search", label: "Search workspace", node: <DeferredPortalSearch key="search" items={searchItems} recordsEnabled={recordsEnabled} /> }
      : null,
    advisorEnabled
      ? {
          id: "advisor",
          label: "Aqua Advisor",
          node: advisorControl ? <Fragment key="advisor">{advisorControl}</Fragment> : <Link key="advisor" href="/portal/agency/assistant" prefetch={sharedChromeLinkPrefetch()} aria-label="Open Aqua Advisor" className="inline-flex size-9 items-center justify-center gap-2 rounded-md border border-black/10 bg-white/60 text-black/55 transition hover:bg-white hover:text-black xl:w-auto xl:px-3"><Sparkles size={16} /><span className="hidden text-xs font-semibold xl:inline">Advisor</span></Link>,
        }
      : null,
    {
      id: "privacy",
      label: "Privacy mode",
      node: (
        <PrivacyModeControl
          key="privacy"
          canEnterShowcase={!publicShowcase && !sandboxMode && role !== "lead"}
          showcaseMode={showcaseMode}
          sensitiveTerms={[email, name ?? "", ...(privacyTerms ?? [])]}
        />
      ),
    },
    devConsole && !publicShowcase && !showcaseMode
      ? { id: "dev-console", label: "Dev Console", node: <DevConsoleControl key="dev-console" /> }
      : null,
    !publicShowcase && radarControl ? { id: "radar", label: "Business Radar", node: <Fragment key="radar">{radarControl}</Fragment> } : null,
    inspecting ? { id: "inspector", label: "Inspector mode", node: <InspectorModeControl key="inspector" label={inspectingLabel} /> } : null,
    {
      id: "notifications",
      label: publicShowcase ? "Demo" : showcaseMode ? "Showcase mode" : "Notifications",
      node: <Fragment key="notifications">{publicShowcase ? <PublicShowcaseControl /> : showcaseMode ? <ShowcaseModeControl /> : notifications}</Fragment>,
    },
    { id: "colour-mode", label: "Light and dark", node: <div key="colour-mode" className="hidden sm:block"><ColorModeToggle /></div> },
  ] as (TopbarControl | null)[]).filter((entry): entry is TopbarControl => entry !== null);

  const pinnedControls = await topbarControlPins();

  return (
    <>
    <header className="mm-portal-topbar relative z-40 flex min-h-14 shrink-0 items-center justify-between gap-1.5 border-b border-black/10 bg-white/40 px-3 py-2 backdrop-blur-xl sm:gap-2 sm:px-4 md:px-6">
      {/* `data-topbar-lead` is what the overflow measures against: this cluster
          is the one that gets squeezed when the bar runs out of room, so it is
          the honest signal for "a promoted control no longer fits". */}
      <div data-topbar-lead className="flex min-w-0 flex-1 items-center gap-1 sm:gap-3">
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
        {/* Everything between here and the profile menu collapses behind one
            button on a phone. The profile menu and the exit link stay out —
            "who am I" and "how do I leave" are the two a person reaches for
            without thinking, and burying them costs more than the space it
            saves. See TopbarOverflow for why the children are rendered once. */}
        <TopbarOverflow controls={collapsible} pinned={pinnedControls} />
        {previewActive ? (
          <Link
            href="/portal/agency/phases"
            prefetch={sharedChromeLinkPrefetch()}
            aria-label="Exit phase preview and return to your portal account"
            className="rounded-md border border-[#C9A76A]/60 bg-[#FAF7EE] px-2 py-1 text-[#8A6A2D] hover:bg-[#F4ECD9]"
          >
            <span aria-hidden>←</span> Back to portal account
          </Link>
        ) : homeHref || (isDemo && !showcaseMode && !sandboxMode && !publicShowcase && !devModeActive) ? (
          // One exit link. Existing callers pass neither prop → href "/" +
          // "Back to website" (unchanged demo behaviour). A caller that passes
          // homeHref (Dev Team → resolvePostLoginPath) shows it regardless of
          // demo/dev-mode, so the role-home exit is always the way out there.
          <Link
            href={homeHref ?? "/"}
            prefetch={sharedChromeLinkPrefetch()}
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
    {/* Arriving on a saved tab that has a spot: go to the spot, and say so when
        the page has changed underneath it. Mounted here because the topbar is
        on every portal surface a saved tab can point at. */}
    {!publicShowcase ? <SavedSpotArrival /> : null}
    </>
  );
}
