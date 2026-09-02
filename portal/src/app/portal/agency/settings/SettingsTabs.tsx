"use client";

// Client-side tab switcher for /portal/settings. Each tab renders a
// section of read-mostly info + deep-link buttons to the existing
// detail pages (Profile, Preferences, Permissions, Phases). Keeps the
// "one massive page" feel while reusing the canonical surfaces for
// real editing.

import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowUpRight, Bell, Boxes, Briefcase, Building2, Check, CircleUserRound, FlaskConical, KeyRound, Palette, LifeBuoy, PanelLeft, Plug, Radar, Save, ScrollText, Settings as SettingsIcon, ShieldCheck, SlidersHorizontal, Sparkles, UsersRound } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import type { ProductionReadiness, ReadinessStatus } from "@/lib/server/productionReadiness";
import type { AgencyWorkspaceSettings, ClientStage, SandboxSessionEnvironment } from "@/server/types";
import type { AgencySettingsCapabilities } from "@/lib/agencySettingsCapabilities";
import { TeamUsersPanel } from "./TeamUsersPanel";
import { SandboxModePanel } from "./SandboxModePanel";
import { ActivityLogPanel } from "./ActivityLogPanel";
import { ExternalAiConnectionPanel } from "./ExternalAiConnectionPanel";
import { buildAgencyAccessScopeChoices } from "@/components/access/accessModel";
import {
  APP_VERSION,
  PRODUCT_RELEASES,
  RELEASE_SEEN_EVENT,
  RELEASE_STORAGE_KEY,
  formatReleaseDate,
} from "@/lib/projects/releases";
import { PortalViewportLoading } from "@/components/ui/PortalViewportLoading";
import { IntegrationConnectionsPanel } from "./IntegrationConnectionsPanel";
import { FreelancerAccessConfigPanel, type JobRow as FreelancerJobRow } from "../freelancer-access/_FreelancerAccessConfigPanel";
import { PluginSettingsPanel, type PluginSettingsView } from "@/components/workspaces/PluginSettingsPanel";
import { CLIENT_SCOPED_SETTINGS_MODULES } from "@/lib/chrome/settingsModules";
import { timezoneOptions } from "@/lib/shared/timezones";
import type { FreelancerAccessConfig } from "@/server/types";
import { WorkspaceNamePanel, BrandColourPanel } from "./AgencyIdentityPanel";
import { AppearancePanel } from "./AppearancePanel";
import { WorkspaceLayoutPanel } from "./WorkspaceLayoutPanel";
import { RadarTriggersPanel } from "./RadarTriggersPanel";
import { ApiAccessPanel } from "./ApiAccessPanel";
import { TradingCompaniesPanel } from "../company/_TradingCompaniesPanel";
import type { TradingCompany } from "@/server/types";
import { resolveSettingsTabHash } from "./settingsTabHash";

const AccessControlPanel = dynamic(
  () => import("@/components/access/AccessControlPanel").then(module => module.AccessControlPanel),
  { loading: () => <PortalViewportLoading label="Preparing access control…" /> },
);

interface SettingsContext {
  user: { name?: string; email: string; role: string; avatarUrl?: string };
  agency?: { id: string; name: string; slug: string; primaryColor?: string };
  workspace?: {
    clientCount: number;
    phaseCount: number;
    systemCount: number;
  };
  readiness: ProductionReadiness;
  settings: AgencyWorkspaceSettings;
  capabilities: AgencySettingsCapabilities;
  sandbox?: SandboxSessionEnvironment;
  access?: {
    agencyId: string;
    canManage: boolean;
    people: Array<{ id: string; name: string; email: string; role: string }>;
  };
  tradingCompanies: Array<{ id: string; name: string }>;
  clients: Array<{ id: string; name: string }>;
  freelancerAccess: FreelancerAccessConfig;
  freelancerJobs: FreelancerJobRow[];
  /** Agency-scoped module settings, ready to render in place. */
  moduleSettings: PluginSettingsView[];
  /** This person's own stylesheet, already validated on read. */
  customCss: string;
  companySummaries: CompanySummaryRow[];
  workspaceSummary: { clientCount: number; productCount: number; staffCount: number; healthScore: number };
  devProjects?: Array<{ id: string; name: string }>;
  team: Array<{
    id: string;
    name: string;
    email: string;
    username?: string;
    role: "agency-owner" | "agency-manager" | "agency-staff";
    companyIds: string[];
  }>;
}

// Ed, 2026-08-30: trading companies into business details, team merged with
// roles & access, modules joined with workspaces, and My account brought inside
// settings. Three ids retire and one arrives; the retired three become aliases
// below so every existing deep link still lands.
//
// Lowercase letters only — smoke-settings-hub extracts ids with
// /\{ id: "([a-z]+)", label:/, so a hyphen or a digit silently escapes both of
// its structural checks rather than failing them.
type TabId = "account" | "profile" | "access" | "workspace" | "appearance" | "layout" | "connections" | "radar" | "api" | "environment" | "defaults" | "notifications" | "updates" | "logs" | "launch" | "help";

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: "account", label: "Business details", icon: <Building2 size={16} /> },
  { id: "profile", label: "My account", icon: <CircleUserRound size={16} /> },
  { id: "workspace", label: "Workspaces & modules", icon: <Boxes size={16} /> },
  { id: "defaults", label: "Defaults", icon: <SlidersHorizontal size={16} /> },
  { id: "appearance", label: "Appearance & branding", icon: <Palette size={16} /> },
  { id: "layout", label: "Sidebar & saved tabs", icon: <PanelLeft size={16} /> },
  { id: "access", label: "Team, roles & access", icon: <UsersRound size={16} /> },
  { id: "connections", label: "Connections", icon: <Plug size={16} /> },
  { id: "radar", label: "Radar triggers", icon: <Radar size={16} /> },
  { id: "api", label: "API & MCP keys", icon: <KeyRound size={16} /> },
  { id: "environment", label: "Environment", icon: <FlaskConical size={16} /> },
  { id: "notifications", label: "Notifications", icon: <Bell size={16} /> },
  { id: "updates", label: "What’s new", icon: <Sparkles size={16} /> },
  { id: "logs", label: "Activity log", icon: <ScrollText size={16} /> },
  { id: "launch", label: "Setup & launch", icon: <ShieldCheck size={16} /> },
  { id: "help", label: "Help", icon: <LifeBuoy size={16} /> },
];

// ─── Grouping ─────────────────────────────────────────────────────────────
//
// Eleven tabs in a horizontal strip measured 1,352px of content inside a 603px
// container on 2026-08-29 — `overflow-x-auto` with no affordance, so SIX of the
// eleven were simply invisible. That is the whole of Ed's *"settings are all
// over the place"*: they were not scattered across the app so much as scrolled
// off the edge of one.
//
// Grouped by the question somebody arrives with, not by which subsystem owns
// the data. Ids are UNCHANGED so existing `#hash` deep links keep working —
// `/portal/agency/settings#notifications` is linked from elsewhere in the app.
//
// A group may also carry a LINK row: somewhere settings-shaped that lives on
// another page. It points AT the canonical editor and never mounts it — the
// rule `smoke-settings-hub` pins, learned by breaking it.
type CompanySummaryRow = TradingCompany & {
  clientCount: number; productCount: number; staffCount: number; healthScore: number;
};

interface SettingsGroup {
  label: string;
  tabs: TabId[];
  links?: { label: string; href: string; detail: string }[];
}

/**
 * What each tab is ABOUT, for the settings search (Ed, 2026-08-30: "we need a
 * settings search as well please"). Hand-authored keywords rather than an
 * extracted index: every pane is hardcoded JSX with no field ids to walk, so
 * honest curation beats a fake registry. When a control MOVES tab, move its
 * words — the smoke test checks every retired tab name still finds its new home.
 */
const TAB_KEYWORDS: Record<TabId, string> = {
  account: "business details legal name support email phone website company number vat tax address timezone trading companies brands invoices identity workspace name",
  profile: "my account profile avatar picture two-factor 2fa mfa authenticator password permissions personal",
  workspace: "workspaces modules plugins installed enable disable settings cog clients journey fulfilment stages",
  defaults: "defaults currency tax rate payment terms invoice prefix",
  appearance: "appearance branding brand colour color theme css styling custom stylesheet",
  layout: "sidebar saved tabs pins order arrange topbar",
  access: "team staff people roles access grants permissions elements freelancer invite manager scopes",
  connections: "connections integrations resend email smtp twilio sms whatsapp stripe supabase meta instagram facebook api keys channels",
  radar: "radar triggers monitoring probes runtime alerts",
  api: "api keys mcp external assistant tokens",
  environment: "environment sandbox showcase demo mode data realm",
  notifications: "notifications alerts advisor guardrails email digests",
  updates: "what's new whats new updates releases changelog version",
  logs: "activity log audit history events pages",
  launch: "setup launch checklist onboarding readiness production",
  help: "help support documentation guide",
};

const GROUPS: SettingsGroup[] = [
  {
    label: "Business",
    // Trading companies moved INSIDE Business details on 2026-08-30 (Ed:
    // "trading companies should be inside business details"), so the tab that
    // used to sit here is gone rather than reordered.
    tabs: ["account", "profile", "workspace", "defaults", "appearance", "layout"],
  },
  {
    label: "People & access",
    // Ed, 2026-08-29: *"e.g. Staff instead of saying Freelancer access"* — three
    // people-shaped tabs sat apart in a flat strip and read as three unrelated
    // things. One group is the rename he was reaching for.
    //
    // 2026-08-30: and then one TAB, because "team" and "access" were two halves
    // of one question — who is here, and what may they do.
    tabs: ["access"],
  },
  {
    label: "Operations",
    // "modules" folded into "workspace": a module IS a workspace from the
    // owner's side, and two tabs meant guessing which one held the setting.
    tabs: ["connections", "radar", "api", "environment", "notifications"],
  },
  {
    label: "Status & help",
    tabs: ["launch", "updates", "logs", "help"],
  },
];

const TAB_BY_ID = new Map(TABS.map(tab => [tab.id, tab]));
const TAB_IDS = new Set(TABS.map(tab => tab.id));

/**
 * Hashes that used to be tabs of their own.
 *
 * The same rule `LEGACY_TAB_ALIASES` follows in `lib/clients/clientWorkspace.ts`
 * — merge concepts, keep the old ids resolving, so external links and muscle
 * memory both survive. Without this a bookmark lands on the first tab with no
 * hint that the thing moved.
 */
const LEGACY_TAB_ALIASES: Record<string, TabId> = {
  // Showcase Mode was consolidated into the single Environment surface.
  showcase: "environment",
  // Freelancer access joined Roles & access on 2026-08-29 — it is the same
  // question (what may this person see and do) asked about a contractor.
  freelancer: "access",
  // The old Settings integrations tab id, from before that work moved to
  // Company and back again.
  integrations: "connections",
  // ── Retired 2026-08-30, aliased the same day ──────────────────────────
  //
  // These three are the whole reason the merge is safe. Two live deep links
  // point at #team (account/page.tsx and account/permissions/page.tsx), the
  // sidebar and search both emit tab hashes, and a bookmark that lands on the
  // first tab with no explanation is how somebody concludes their settings
  // were deleted.
  companies: "account",
  team: "access",
  modules: "workspace",
};

export function SettingsTabs({ ctx }: { ctx: SettingsContext }) {
  const [active, setActive] = useState<TabId>("account");
  const [settingsQuery, setSettingsQuery] = useState("");
  // Tabs whose name, group or keywords contain every word of the query. Words
  // rather than a substring so "brand colour" finds Appearance even though the
  // registry says "brand colour color" in a different order.
  const searchWords = settingsQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matchingTabs = searchWords.length
    ? new Set(TABS.filter(tab => {
        const haystack = `${tab.label} ${TAB_KEYWORDS[tab.id]}`.toLowerCase();
        return searchWords.every(word => haystack.includes(word));
      }).map(tab => tab.id))
    : null;

  // A URL fragment is unavailable to the server render. Resolve it in a layout
  // effect so direct entries such as `settings#environment` select the correct
  // pane before the browser paints the server-side `account` fallback.
  useLayoutEffect(() => {
    const syncHash = () => {
      const requested = resolveSettingsTabHash(window.location.hash, TAB_IDS, LEGACY_TAB_ALIASES);
      if (requested) setActive(requested);
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  useEffect(() => {
    if (active !== "updates") return;
    window.localStorage.setItem(RELEASE_STORAGE_KEY, APP_VERSION);
    window.dispatchEvent(new Event(RELEASE_SEEN_EVENT));
  }, [active]);

  function selectTab(id: TabId) {
    setActive(id);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${id}`);
  }

  return (
    <>
      {/* Below the rail's width: a grouped select. `optgroup` is a one-line
          change that turns eleven flat options into four labelled sets, and it
          is the native control so it stays usable one-handed. */}
      <label className="grid gap-1.5 text-xs font-medium text-black/50 lg:hidden">
        Settings section
        <select value={active} onChange={event => selectTab(event.target.value as TabId)} className={control} aria-label="Settings section">
          {GROUPS.map(group => (
            <optgroup key={group.label} label={group.label}>
              {group.tabs.map(id => <option key={id} value={id}>{TAB_BY_ID.get(id)?.label ?? id}</option>)}
            </optgroup>
          ))}
        </select>
      </label>

      <div className="mt-6 grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
        {/* The rail. Every section visible at once — the point of the change. */}
        <nav aria-label="Settings sections" className="hidden lg:block">
          <label className="mb-3 block px-2">
            <span className="sr-only">Search settings</span>
            <input
              value={settingsQuery}
              onChange={event => setSettingsQuery(event.target.value)}
              placeholder="Search settings…"
              className="min-h-9 w-full rounded-md border border-black/15 bg-white px-2.5 text-sm outline-none focus:border-black/35"
            />
          </label>
          {GROUPS.map(group => {
            const visible = matchingTabs ? group.tabs.filter(id => matchingTabs.has(id)) : group.tabs;
            if (!visible.length) return null;
            return (
            <div key={group.label} className="mb-4 last:mb-0">
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-black/35">{group.label}</p>
              <ul className="flex flex-col">
                {visible.map(id => {
                  const tab = TAB_BY_ID.get(id);
                  if (!tab) return null;
                  const isActive = active === id;
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        aria-current={isActive ? "page" : undefined}
                        onClick={() => selectTab(id)}
                        className={[
                          "flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition",
                          isActive ? "bg-black/[0.06] font-semibold text-black/85" : "text-black/60 hover:bg-black/[0.03] hover:text-black/85",
                        ].join(" ")}
                      >
                        <span className={isActive ? "text-brand" : "text-black/35"}>{tab.icon}</span>
                        {tab.label}
                      </button>
                    </li>
                  );
                })}
                {group.links?.map(link => (
                  <li key={link.href}>
                    {/* A door, drawn as a door. The arrow says it leaves. */}
                    <Link
                      href={link.href}
                      className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-black/60 transition hover:bg-black/[0.03] hover:text-black/85"
                      title={link.detail}
                    >
                      <span className="text-black/35"><ArrowUpRight size={16} /></span>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            );
          })}
        </nav>

      <div className="flex min-w-0 flex-col gap-5">
        {active === "account"     && <GeneralPane ctx={ctx} />}
        {/* Team and Roles & access merged 2026-08-30 (Ed: "team and roles and
            access should be merged"). `AccessPane` now renders the people list
            above the element grid — who is here, then what they may do. The
            `#team` hash still resolves here through LEGACY_TAB_ALIASES. */}
        {active === "access"      && <AccessPane ctx={ctx} />}
        {active === "profile"     && <ProfilePane ctx={ctx} />}
        {active === "workspace"   && <WorkspacePane ctx={ctx} />}
        {active === "appearance" && (
          <>
            {/* Ed: "brand colour just send this over to the styling settings
                surely thats better". Yes — it is styling. Sibling section, not
                merged into AppearancePanel: the CSS below is per-PERSON and
                ungated, the colour is per-AGENCY and owner/manager only, and
                one panel holding two scopes at two permission levels is how a
                preference becomes a tenant write by accident. */}
            <Section eyebrow="Brand">
              <BrandColourPanel
                initialColour={ctx.agency?.primaryColor ?? ""}
                canManage={ctx.capabilities.manageSettings}
              />
            </Section>
            <Section eyebrow="Appearance">
              <AppearancePanel initialCss={ctx.customCss} />
            </Section>
          </>
        )}
        {active === "layout" && (
          <Section eyebrow="Sidebar & saved tabs">
            <WorkspaceLayoutPanel />
          </Section>
        )}
        {active === "connections" && (
          <Section eyebrow="Connections">
            {/* Mounted, not linked. Ed reversed the 2026-08-2x decision to send
                this work to Company on 2026-08-29: *"bring it all into settings
                rather than taking us out of settings."* Company → Connections
                still works and still renders the SAME panel — four doors onto
                one editor, which is the rule; a second copy would not be. */}
            <IntegrationConnectionsPanel clients={ctx.clients} canManage={ctx.capabilities.manageSettings} />
          </Section>
        )}
        {active === "api" && (
          <Section eyebrow="API & MCP keys">
            {/* The key creator was already in Settings — buried inside Setup &
                launch, where nobody looks for an API key. Same panel, findable
                name. */}
            {ctx.capabilities.manageExternalAi
              ? <ExternalAiConnectionPanel />
              : <SettingsPermissionNotice capability="manage external AI access" />}
            <div className="mt-8 border-t border-black/[0.07] pt-6">
              <ApiAccessPanel />
            </div>
          </Section>
        )}
        {active === "radar" && (
          <Section eyebrow="Radar triggers">
            {/* Lazy — the radar sweep is the most expensive read in the app and
                must not run for somebody changing their invoice prefix. */}
            <RadarTriggersPanel />
          </Section>
        )}
        {active === "environment" && <Section eyebrow="Environment"><SandboxModePanel environment={ctx.sandbox} canManage={ctx.capabilities.manageSettings} /></Section>}
        {active === "defaults"    && <DefaultsPane ctx={ctx} />}
        {active === "notifications" && <NotificationsPane ctx={ctx} />}
        {active === "updates"     && <UpdatesPane />}
        {active === "logs"        && <Section eyebrow="Activity log">{ctx.capabilities.viewActivityLog ? <ActivityLogPanel clients={ctx.clients} /> : <SettingsPermissionNotice capability="view and export the workspace activity log" />}</Section>}
        {active === "help" && <HelpPane />}
        {active === "launch"      && <LaunchPane readiness={ctx.readiness} canManageExternalAi={ctx.capabilities.manageExternalAi} />}
      </div>
      </div>
    </>
  );
}

/**
 * Every agency-scoped module's settings, edited here.
 *
 * The same generic `PluginSettingsPanel` each module's own settings page
 * mounts — so this is a second DOOR onto one editor, never a second copy.
 * Client-scoped modules are named but not rendered: their values belong to a
 * client, and an agency-scoped form for them would save successfully and change
 * nothing.
 */
/**
 * Help — where to look, and what to do when something is wrong.
 *
 * Ed, 2026-08-29: *"a help tab as well please."*
 *
 * Deliberately NOT a tutorial of the product. That is
 * `plans/aqua-explorer-guided-help.md`, and it is parked until the information
 * architecture stops moving — a guide written now would need rewriting on every
 * rename. What belongs here instead is the small set of things that are true
 * regardless of how the app is arranged: how to get unstuck, and where the
 * answers live.
 */
function HelpPane() {
  return (
    <Section eyebrow="Help">
      <div className="grid gap-6">
        <div>
          <h3 className="text-sm font-semibold text-black/80">If something looks wrong</h3>
          <ul className="mt-2 grid gap-2 text-xs leading-5 text-black/60">
            <li><strong className="font-semibold text-black/75">The workspace looks broken after custom CSS.</strong> Add <code className="rounded bg-black/[0.05] px-1 font-mono">?nocss=1</code> to any URL to load without your stylesheet, then clear it in Appearance.</li>
            <li><strong className="font-semibold text-black/75">A setting saved but nothing changed.</strong> Some declared settings are not yet read by anything — those say so on the field itself rather than pretending.</li>
            <li><strong className="font-semibold text-black/75">You cannot find a page.</strong> Search covers every screen, including ones with no menu entry. Press the search control in the topbar and type part of the name.</li>
            <li><strong className="font-semibold text-black/75">The sidebar is a mess.</strong> Sidebar &amp; saved tabs has a one-click reset.</li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-black/80">Where things live</h3>
          <ul className="mt-2 grid gap-2 text-xs leading-5 text-black/60">
            <li><strong className="font-semibold text-black/75">Connections</strong> — Stripe, Twilio, Resend, Meta. Also on Company → Connections; the same editor either way.</li>
            <li><strong className="font-semibold text-black/75">Modules</strong> — Finance, Staff &amp; HR, Marketing and Email sending. Client-scoped modules are configured inside each client.</li>
            <li><strong className="font-semibold text-black/75">Setup &amp; launch</strong> — what is still not configured, and whether this workspace is ready.</li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-black/80">Reaching a person</h3>
          <p className="mt-1 text-xs leading-5 text-black/60">
            The Dev Console in the topbar captures a finding with a screenshot and the page you were
            on, which is far more useful than a description written afterwards.
          </p>
        </div>
      </div>
    </Section>
  );
}

function ModulesPane({ ctx }: { ctx: SettingsContext }) {
  // Ed, 2026-08-30: *"workspaces should show all ... workspaces with a settings
  // cog next to it and you just do the settings for each workspace but inside
  // the settings thing."* The stack of every panel became a list with a cog per
  // workspace — scan first, open one on demand. Same `PluginSettingsPanel`
  // renderer; nothing about how a setting is described or saved changed.
  //
  // Departments are deliberately NOT rows here: a department is a compile-time
  // access preset with no settings of its own, and a cog that opens an empty
  // panel teaches people cogs are decoration.
  const [openModule, setOpenModule] = useState<string | null>(null);
  return (
    <Section eyebrow="Workspaces">
      {ctx.moduleSettings.length ? (
        <ul className="divide-y divide-black/[0.07]">
          {ctx.moduleSettings.map(settings => {
            const open = openModule === settings.pluginId;
            return (
              <li key={settings.pluginId} className="py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-black/80">{settings.pluginName}</span>
                  <button
                    type="button"
                    onClick={() => setOpenModule(open ? null : settings.pluginId)}
                    aria-expanded={open}
                    aria-label={`${open ? "Close" : "Open"} settings for ${settings.pluginName}`}
                    className={`grid size-9 place-items-center rounded-md transition ${open ? "bg-black/[0.07] text-black/80" : "text-black/40 hover:bg-black/[0.05] hover:text-black/70"}`}
                  >
                    <SettingsIcon size={16} aria-hidden />
                  </button>
                </div>
                {open ? (
                  <div className="mt-3 rounded-md border border-black/10 bg-black/[0.015] p-4">
                    <PluginSettingsPanel initial={settings} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-black/50">No agency-scoped modules are installed.</p>
      )}
      <p className="mt-6 border-t border-black/[0.07] pt-4 text-xs leading-5 text-black/45">
        {CLIENT_SCOPED_SETTINGS_MODULES.join(", ")} are configured per client, inside that
        client&apos;s workspace — their settings belong to the client, not to the agency.
      </p>
    </Section>
  );
}


function AccessPane({ ctx }: { ctx: SettingsContext }) {
  // During a dev-server RSC/client hot swap, the browser can briefly retain a
  // Settings payload produced before the access fields were added. Keep that
  // transition usable; a fresh request always supplies the canonical values.
  const access = ctx.access ?? {
    agencyId: ctx.agency?.id ?? "",
    canManage: false,
    people: [],
  };
  const agencyId = access.agencyId;
  const scopes = buildAgencyAccessScopeChoices({
    agencyId,
    clients: ctx.clients,
    devProjects: ctx.devProjects ?? [],
    canManageProjectAccess: access.canManage,
  });
  return (
    <>
      {/* Merged 2026-08-30 (Ed: "team and roles and access should be merged").
          People first, then powers: who is on the team, then what each of them
          may see and do. Two capability flags on purpose — `manageTeam` is the
          role matrix, `access.canManage` is a live-realm access grant — and
          they deliberately do NOT imply each other. */}
      <Section eyebrow="Team">
        <TeamUsersPanel
          initialUsers={ctx.team}
          canManage={ctx.capabilities.manageTeam}
          canCreateManagers={ctx.user.role === "agency-owner"}
          companies={ctx.tradingCompanies}
        />
      </Section>

    <Section eyebrow="Roles and access">
      <AccessControlPanel
        scope={scopes[0]!}
        scopeOptions={scopes}
        people={access.people.map(person => ({ id: person.id, name: person.name, email: person.email, detail: person.role }))}
        canManage={access.canManage}
        currentEnvironment={ctx.sandbox ? "sandbox" : "live"}
        title="Roles, workspaces and elements"
        description="Create reusable roles, assign people to exact scopes and decide whether every registered workspace element is hidden, view-only, usable or manageable."
      />

      {/* Ed, 2026-08-29: *"freelancer access can go with roles and access."*
          It is the same question — what a person may see and do — asked about a
          contractor instead of a staff member. Two tabs made it read as two
          unrelated systems. */}
      <div className="mt-8 border-t border-black/[0.07] pt-6">
        <h3 className="text-sm font-semibold text-black/80">Freelancer access</h3>
        <p className="mt-1 mb-4 max-w-2xl text-sm leading-6 text-black/58">
          What a freelancer sees and can do in their own workspace — brief, dates, their fee,
          deliverables, whether the client is named or anonymised. Privacy-first by default.
        </p>
        <FreelancerAccessConfigPanel initial={ctx.freelancerAccess} jobs={ctx.freelancerJobs} />
        {/* The standalone page still exists and is linked from Freelancers.
            Keeping a door here too costs one line and means a bookmark, a
            support answer or a deep link never dead-ends — the editor is the
            same one either way. */}
        <Link href="/portal/agency/freelancer-access" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-black/50 hover:text-black/80">
          Open the full freelancer access page <ArrowUpRight size={13} />
        </Link>
      </div>
    </Section>
    </>
  );
}

function Section({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return (
    <section className="mm-surface-card rounded-lg border border-black/10">
      <header className="border-b border-black/10 px-5 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">‹ {eyebrow} ›</span>
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-black/10 bg-white/70 px-4 py-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-black/45">{label}</div>
      <div className="mt-1 text-sm font-semibold text-black/90">{value}</div>
    </div>
  );
}

function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black/80 shadow-sm hover:border-black/30 hover:bg-black/[0.03]">
      {children}
      <span aria-hidden className="text-black/40">›</span>
    </Link>
  );
}

function InlineLink({ href, children, external = false }: { href: string; children: ReactNode; external?: boolean }) {
  const className = "font-medium text-black/65 underline decoration-black/25 underline-offset-2 transition hover:text-black hover:decoration-black/55";
  if (external) {
    return <a href={href} target="_blank" rel="noreferrer" className={className}>{children}</a>;
  }
  return <Link href={href} className={className}>{children}</Link>;
}

function GeneralPane({ ctx }: { ctx: SettingsContext }) {
  return (
    <>
      <Section eyebrow="Business">
        {/* Editable at last (Ed, 2026-08-30: "allow these to be changed").
            These were three read-only Stat tiles because no non-founder write
            path existed. The name edits HERE; the colour edits in Appearance &
            branding, where styling lives — one control each, no second copy.
            The slug stays fixed with the reason on the field. */}
        <WorkspaceNamePanel
          initialName={ctx.agency?.name ?? ""}
          slug={ctx.agency?.slug ?? ""}
          canManage={ctx.capabilities.manageSettings}
        />
        <div className="mt-5 border-t border-black/10 pt-5">
          <BusinessSettingsForm initial={ctx.settings} canManage={ctx.capabilities.manageSettings} />
        </div>
      </Section>

      {/* Ed, 2026-08-30: *"trading companies should be inside business details."*
          They ARE business details — the legal entities this workspace trades
          as — and a tab of their own put them a click away from the legal name
          and VAT number they belong beside.

          The same panel Company → Companies uses, from the same state. One
          editor, two doors; a second copy would be the thing the settings-hub
          rule exists to prevent. */}
      <Section eyebrow="Trading companies">
        <TradingCompaniesPanel
          companies={ctx.companySummaries}
          canEdit={ctx.capabilities.manageSettings}
          workspace={ctx.workspaceSummary}
        />
      </Section>
      <Section eyebrow="Quick links">
        <div className="flex flex-wrap gap-2">
          <PrimaryLink href="/portal/account">Edit profile</PrimaryLink>
          <PrimaryLink href="/portal/account/permissions">Permissions</PrimaryLink>
          <PrimaryLink href="/portal/agency/settings#notifications">Notification preferences</PrimaryLink>
          {ctx.agency && <PrimaryLink href="/portal/agency/phases">Phases</PrimaryLink>}
          {ctx.agency && <PrimaryLink href="/portal/agency">Agency dashboard</PrimaryLink>}
        </div>
      </Section>
      <Section eyebrow="Software">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-black/85">AquaCRM {APP_VERSION}</h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700"><Check size={11} />Current</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-black/45">You are running the latest connected operations release.</p>
          </div>
          <PrimaryLink href="/portal/agency/settings#updates">Explore what&apos;s new</PrimaryLink>
        </div>
      </Section>
    </>
  );
}

function UpdatesPane() {
  return (
    <>
      <section className="overflow-hidden rounded-lg border border-black/10 bg-[#101513] text-white shadow-sm">
        <div className="grid gap-6 px-5 py-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:px-7 sm:py-7">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
              <Sparkles size={14} aria-hidden />
              What&apos;s new in AquaCRM
            </div>
            <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">Connected operations</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">One place to understand the business, see what needs attention, and move the work forward.</p>
          </div>
          <div className="sm:text-right">
            <div className="text-2xl font-semibold">v{APP_VERSION}</div>
            <div className="mt-1 text-xs text-white/45">Current release</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-white/[0.035] px-5 py-3 text-xs text-white/55 sm:px-7">
          <span>Released {formatReleaseDate(PRODUCT_RELEASES[0].releasedAt)}</span>
          <span className="inline-flex items-center gap-1.5 text-emerald-300"><Check size={13} />You are up to date</span>
        </div>
      </section>

      <Section eyebrow="Release history">
        <div className="divide-y divide-black/10">
          {PRODUCT_RELEASES.map((release, index) => (
            <article key={release.version} className="py-6 first:pt-0 last:pb-0">
              <div className="grid gap-4 lg:grid-cols-[10rem_minmax(0,1fr)]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-black/85">Version {release.version}</span>
                    {index === 0 ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-semibold uppercase text-emerald-700">Latest</span> : null}
                  </div>
                  <time dateTime={release.releasedAt} className="mt-1 block text-xs text-black/40">{formatReleaseDate(release.releasedAt)}</time>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-black/85">{release.title}</h3>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-black/55">{release.summary}</p>
                  <div className="mt-4 divide-y divide-black/[0.07] border-y border-black/[0.07]">
                    {release.highlights.map(highlight => (
                      <div key={highlight.title} className="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
                        <strong className="text-xs font-semibold text-black/70">{highlight.title}</strong>
                        <p className="text-xs leading-5 text-black/45">{highlight.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </Section>
    </>
  );
}

function BusinessSettingsForm({ initial, canManage }: { initial: AgencyWorkspaceSettings; canManage: boolean }) {
  const [form, setForm] = useState({
    legalName: initial.legalName ?? "",
    supportEmail: initial.supportEmail ?? "",
    phone: initial.phone ?? "",
    website: initial.website ?? "",
    businessAddress: initial.businessAddress ?? "",
    companyNumber: initial.companyNumber ?? "",
    taxNumber: initial.taxNumber ?? "",
    timezone: initial.timezone,
  });
  const [status, setStatus] = useState("");
  // Every zone this runtime knows, plus UTC — which Intl's list omits and the
  // old five-option select could store — plus whatever is already saved, so a
  // custom zone is never missing from its own picker. Keyed on the STORED
  // value, not `form.timezone`: re-deriving per keystroke would reshuffle the
  // suggestion list under the cursor while somebody is typing into it.
  const zones = useMemo(() => timezoneOptions(initial.timezone), [initial.timezone]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("Saving...");
    const result = await saveSettings(form);
    setStatus(result.ok ? "Business details saved." : result.error);
  }

  return (
    <form onSubmit={submit}>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-black/80">Business details</h3>
        <p className="mt-1 text-xs leading-5 text-black/45">Legal and contact details are captured on each new invoice and are fallback identity for transactional email. Existing invoice exports retain the identity captured at creation; saved invoice-template business details override the generated contact block. A sender connection overrides email identity. Timezone is stored for future scheduling and does not shift existing records today.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Legal or trading name"><input value={form.legalName} onChange={event => setForm(value => ({ ...value, legalName: event.target.value }))} className={control} disabled={!canManage} /></Field>
        <Field label="Support email"><input type="email" value={form.supportEmail} onChange={event => setForm(value => ({ ...value, supportEmail: event.target.value }))} className={control} disabled={!canManage} /></Field>
        <Field label="Phone"><input value={form.phone} onChange={event => setForm(value => ({ ...value, phone: event.target.value }))} className={control} disabled={!canManage} /></Field>
        <Field label="Website"><input type="url" value={form.website} onChange={event => setForm(value => ({ ...value, website: event.target.value }))} className={control} placeholder="https://milesymedia.com" disabled={!canManage} /></Field>
        <Field label="Company number"><input value={form.companyNumber} onChange={event => setForm(value => ({ ...value, companyNumber: event.target.value }))} className={control} disabled={!canManage} /></Field>
        <Field label="VAT or tax number"><input value={form.taxNumber} onChange={event => setForm(value => ({ ...value, taxNumber: event.target.value }))} className={control} disabled={!canManage} /></Field>
        <div className="sm:col-span-2"><Field label="Business address"><textarea rows={3} value={form.businessAddress} onChange={event => setForm(value => ({ ...value, businessAddress: event.target.value }))} className={`${control} resize-none py-2`} disabled={!canManage} /></Field></div>
        <Field label="Timezone (scheduling support pending)"><input list="workspace-timezones" value={form.timezone} onChange={event => setForm(value => ({ ...value, timezone: event.target.value }))} className={control} placeholder="Europe/London" autoComplete="off" spellCheck={false} disabled={!canManage} /><datalist id="workspace-timezones">{zones.map(zone => <option key={zone} value={zone} />)}</datalist></Field>
      </div>
      <SaveRow status={status} canManage={canManage} />
    </form>
  );
}

function ProfilePane({ ctx }: { ctx: SettingsContext }) {
  return (
    <Section eyebrow="Profile">
      <div className="flex items-center gap-4">
        <span aria-hidden className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#84CC16] text-lg font-semibold text-white">
          {(ctx.user.name || ctx.user.email).trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-black/90">{ctx.user.name ?? ctx.user.email}</div>
          <div className="truncate text-sm text-black/55">{ctx.user.email}</div>
          <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-black/40">{ctx.user.role}</div>
        </div>
      </div>
      <div className="mt-4">
        <PrimaryLink href="/portal/account">Open full profile</PrimaryLink>
      </div>
    </Section>
  );
}

function PreferencesPane() {
  return (
    <Section eyebrow="Preferences">
      <p className="text-sm text-black/65">
        Use the theme control in the top bar. Notification rules are managed in the settings section linked below.
      </p>
      <div className="mt-4">
        <PrimaryLink href="/portal/agency/settings#notifications">Open notification preferences</PrimaryLink>
      </div>
    </Section>
  );
}

function PermissionsPane({ ctx }: { ctx: SettingsContext }) {
  return (
    <Section eyebrow="Permissions">
      <p className="text-sm text-black/65">
        You are signed in as <strong className="text-black/85">{ctx.user.role}</strong>.
        Access is based on each person&apos;s role. Business owners can use every area.
      </p>
      <div className="mt-4">
        <PrimaryLink href="/portal/account/permissions">Open permissions grid</PrimaryLink>
      </div>
    </Section>
  );
}

function WorkspacePane({ ctx }: { ctx: SettingsContext }) {
  // Ed, 2026-08-30: *"modules and workspaces should be joined too."* From the
  // owner's side a module IS a workspace — the thing it installs is the thing
  // in the sidebar — so two tabs meant guessing which one held the setting you
  // wanted. `ModulesPane` is rendered below rather than deleted: it is the same
  // surface, one scroll lower, and its own pinned strings stay put.
  return (
    <>
      <Section eyebrow="Workspace">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Stat label="Clients" value={String(ctx.workspace?.clientCount ?? 0)} />
          <Stat label="Stages" value={String(ctx.workspace?.phaseCount ?? 0)} />
          <Stat label="Systems" value={String(ctx.workspace?.systemCount ?? 0)} />
        </div>
      </Section>
      <Section eyebrow="Manage the system">
        <div className="divide-y divide-black/10">
          <SettingsDestination title="Clients and journey" detail="Contacts, lifecycle stages, pipelines, enquiries, and relationship progress." links={[["Clients & contacts", "/portal/clients"], ["Journey", "/portal/agency/pipelines/leads"], ["Stages", "/portal/agency/phases"]]} />
          <SettingsDestination title="Products and fulfilment" detail="Products, packages, portals, delivery stages, contracts, technical work, welcome packs, and delivery knowledge." links={[["Fulfilment command centre", "/portal/agency/fulfilment"], ["Services", "/portal/agency/fulfilment?view=services"], ["Technical performance", "/portal/agency/fulfilment/technical/performance"]]} />
          <SettingsDestination title="Work and knowledge" detail="Team actions, recurring work, reminders, and SOPs." links={[["Actions", "/portal/agency/actions"], ["SOP library", "/portal/agency/sop-library"]]} />
          <SettingsDestination title="Money and growth" detail="Invoices, income, expenses, campaigns, attribution, internal automations, and client-care activity." links={[["Finance", "/portal/agency/agency-finance"], ["Marketing", "/portal/agency/marketing"], ["Marketing automations", "/portal/agency/marketing?view=automations"], ["Client care", "/portal/agency/you-deserve-it"]]} />
        </div>
      </Section>

      {/* Modules, joined to Workspaces 2026-08-30. Same surface, one scroll
          lower, rather than a tab you had to guess between. */}
      <ModulesPane ctx={ctx} />
    </>
  );
}

function DefaultsPane({ ctx }: { ctx: SettingsContext }) {
  const [form, setForm] = useState({
    defaultCurrency: ctx.settings.defaultCurrency,
    defaultTaxRatePercent: String(ctx.settings.defaultTaxRatePercent),
    defaultPaymentTermsDays: String(ctx.settings.defaultPaymentTermsDays),
    invoicePrefix: ctx.settings.invoicePrefix,
    defaultClientStage: ctx.settings.defaultClientStage,
    createPortalByDefault: ctx.settings.createPortalByDefault,
    portalAccessDays: String(ctx.settings.portalAccessDays),
    clientWelcomeMessage: ctx.settings.clientWelcomeMessage ?? "",
  });
  const [status, setStatus] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("Saving...");
    const result = await saveSettings({
      ...form,
      defaultTaxRatePercent: Number(form.defaultTaxRatePercent),
      defaultPaymentTermsDays: Number(form.defaultPaymentTermsDays),
      portalAccessDays: Number(form.portalAccessDays),
    });
    setStatus(result.ok ? "Workspace defaults saved." : result.error);
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <Section eyebrow="Client defaults">
        <p className="mb-4 text-xs leading-5 text-black/45">Starting points for new records. Every client can still be changed individually from <InlineLink href="/portal/clients">Clients &amp; contacts</InlineLink>.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Default starting stage"><select value={form.defaultClientStage} onChange={event => setForm(value => ({ ...value, defaultClientStage: event.target.value as ClientStage }))} className={control} disabled={!ctx.capabilities.manageSettings}>{STAGES.map(stage => <option key={stage.value} value={stage.value}>{stage.label}</option>)}</select></Field>
          <Field label="Portal-access follow-up after"><select value={form.portalAccessDays} onChange={event => setForm(value => ({ ...value, portalAccessDays: event.target.value }))} className={control} disabled={!ctx.capabilities.manageSettings}><option value="1">1 day</option><option value="3">3 days</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option></select></Field>
          <p className="text-xs leading-5 text-black/42 sm:col-span-2">Controls when Aqua raises the “portal access is ready” follow-up. One-time confirmation codes still expire after 15 minutes.</p>
          <label className="flex min-h-11 items-center gap-3 rounded-md border border-black/10 px-3 text-sm text-black/65 sm:col-span-2"><input type="checkbox" checked={form.createPortalByDefault} onChange={event => setForm(value => ({ ...value, createPortalByDefault: event.target.checked }))} disabled={!ctx.capabilities.manageSettings} /><span><strong className="font-medium text-black/75">Create client portals by default</strong><span className="block text-xs text-black/40">This remains optional on every new client.</span></span></label>
          <div className="sm:col-span-2"><Field label="Default client welcome message"><textarea rows={4} value={form.clientWelcomeMessage} onChange={event => setForm(value => ({ ...value, clientWelcomeMessage: event.target.value }))} className={`${control} resize-none py-2`} placeholder="Welcome to your project home..." disabled={!ctx.capabilities.manageSettings} /></Field></div>
        </div>
      </Section>
      <Section eyebrow="Finance defaults">
        <p className="mb-4 text-xs leading-5 text-black/45">Payment terms and tax rate are the canonical defaults for each new invoice; changing them never rewrites an existing invoice. Amend individual records in <InlineLink href="/portal/agency/agency-finance/invoices">Invoices</InlineLink> or edit agreement templates inside <InlineLink href="/portal/agency/fulfilment?view=services">Services</InlineLink>.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Currency"><select value={form.defaultCurrency} onChange={event => setForm(value => ({ ...value, defaultCurrency: event.target.value }))} className={control} disabled={!ctx.capabilities.manageSettings}><option>GBP</option><option>EUR</option><option>USD</option></select></Field>
          <Field label="Default tax %"><input type="number" min="0" max="100" step="0.01" value={form.defaultTaxRatePercent} onChange={event => setForm(value => ({ ...value, defaultTaxRatePercent: event.target.value }))} className={control} disabled={!ctx.capabilities.manageSettings} /></Field>
          <Field label="Payment terms"><input type="number" min="0" max="365" value={form.defaultPaymentTermsDays} onChange={event => setForm(value => ({ ...value, defaultPaymentTermsDays: event.target.value }))} className={control} disabled={!ctx.capabilities.manageSettings} /></Field>
          <Field label="Invoice prefix"><input value={form.invoicePrefix} onChange={event => setForm(value => ({ ...value, invoicePrefix: event.target.value }))} className={control} maxLength={12} disabled={!ctx.capabilities.manageSettings} /></Field>
        </div>
      </Section>
      <SaveRow status={status} canManage={ctx.capabilities.manageSettings} />
    </form>
  );
}

function NotificationsPane({ ctx }: { ctx: SettingsContext }) {
  const [notifications, setNotifications] = useState(ctx.settings.notifications);
  const [advisor, setAdvisor] = useState(ctx.settings.advisor);
  const [status, setStatus] = useState("");
  const options: Array<{ key: Exclude<keyof typeof notifications, "digest">; label: string; detail: string }> = [
    { key: "overdueTasks", label: "Overdue work", detail: "Tasks, reminders, and recurring actions needing attention." },
    { key: "outages", label: "Client outages", detail: "Production errors and monitoring signals from connected client properties." },
    { key: "supportRequests", label: "Support and feedback", detail: "Tickets, suggestions, cancellations, and provider handover requests." },
    { key: "meetingReminders", label: "Meetings", detail: "Upcoming reminders, missing confirmations, and follow-up attempts." },
    { key: "financeAlerts", label: "Finance", detail: "Overdue invoices, payment gaps, expenses, and recurring costs." },
    { key: "marketingAlerts", label: "Marketing", detail: "Campaign budget, spend, lead attribution, and target warnings." },
    { key: "clientAlerts", label: "Client health", detail: "Contact gaps, portal access, enquiries, and customer lifecycle attention." },
    { key: "contractAlerts", label: "Contracts", detail: "Agreements waiting for acceptance or missing from the commercial trail." },
    { key: "complianceAlerts", label: "Legal and compliance", detail: "Insurance, HMRC, policy, contract, and document deadlines." },
    { key: "developmentAlerts", label: "Development", detail: "Production errors, stale monitoring, Aqua tag health, and deployment signals." },
  ];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("Saving...");
    const result = await saveSettings({ notifications, advisor });
    setStatus(result.ok ? "Advisor guardrails and notification preferences saved." : result.error);
  }

  return (
    <form onSubmit={submit}>
      <Section eyebrow="Notifications">
        <div className="divide-y divide-black/10">
          {options.map(option => <label key={option.key} className="flex cursor-pointer items-start justify-between gap-5 py-4 first:pt-0 last:pb-0"><span><strong className="text-sm font-medium text-black/75">{option.label}</strong><span className="mt-1 block text-xs leading-5 text-black/45">{option.detail}</span></span><input type="checkbox" className="mt-1" checked={notifications[option.key]} onChange={event => setNotifications(value => ({ ...value, [option.key]: event.target.checked }))} disabled={!ctx.capabilities.manageSettings} /></label>)}
        </div>
      </Section>
      <Section eyebrow="Advisor guardrails">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Lead response target"><input type="number" min="1" max="240" value={advisor.speedToLeadTargetMinutes} onChange={event => setAdvisor(value => ({ ...value, speedToLeadTargetMinutes: Number(event.target.value) }))} className={control} disabled={!ctx.capabilities.manageSettings} /></Field>
          <Field label="Lead warning after"><input type="number" min="1" max="720" value={advisor.speedToLeadWarningMinutes} onChange={event => setAdvisor(value => ({ ...value, speedToLeadWarningMinutes: Number(event.target.value) }))} className={control} disabled={!ctx.capabilities.manageSettings} /></Field>
          <Field label="Lead critical after"><input type="number" min="1" max="1440" value={advisor.speedToLeadCriticalMinutes} onChange={event => setAdvisor(value => ({ ...value, speedToLeadCriticalMinutes: Number(event.target.value) }))} className={control} disabled={!ctx.capabilities.manageSettings} /></Field>
          <Field label="Data stale after"><input type="number" min="1" max="720" value={advisor.staleDataHours} onChange={event => setAdvisor(value => ({ ...value, staleDataHours: Number(event.target.value) }))} className={control} disabled={!ctx.capabilities.manageSettings} /></Field>
        </div>
        <p className="mt-3 text-xs text-black/42">Times are in minutes, except data freshness which is measured in hours.</p>
      </Section>
      <Section eyebrow="Digest">
        <Field label="Summary frequency"><select value={notifications.digest} onChange={event => setNotifications(value => ({ ...value, digest: event.target.value as typeof notifications.digest }))} className={`${control} max-w-xs`} disabled={!ctx.capabilities.manageSettings}><option value="off">No digest</option><option value="daily">Daily summary</option><option value="weekly">Weekly summary</option></select></Field>
        <p className="mt-2 text-xs leading-5 text-black/40">Stored for the future digest scheduler; daily and weekly digest emails are not sent today. The alert switches above control the active in-app notification feed.</p>
      </Section>
      <SaveRow status={status} canManage={ctx.capabilities.manageSettings} />
    </form>
  );
}

function SettingsDestination({ title, detail, links }: { title: string; detail: string; links: Array<[string, string]> }) {
  return <div className="grid gap-3 py-5 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div><h3 className="text-sm font-semibold text-black/75">{title}</h3><p className="mt-1 max-w-2xl text-xs leading-5 text-black/45">{detail}</p></div><div className="flex flex-wrap gap-2">{links.map(([label, href]) => <PrimaryLink key={href} href={href}>{label}</PrimaryLink>)}</div></div>;
}

type ReadinessItemId = ProductionReadiness["items"][number]["id"];

const SERVICE_DESTINATIONS: Record<ReadinessItemId | "vercelEnvironment", { label: string; href: string; external?: boolean }> = {
  database: { label: "Open Supabase database", href: "https://supabase.com/dashboard/project/dghzbsxbdatskserctgt/editor", external: true },
  security: { label: "Open Vercel environment variables", href: "https://vercel.com/edstorm987-1130s-projects/aquacrm/settings/environment-variables", external: true },
  vault: { label: "Open Vercel environment variables", href: "https://vercel.com/edstorm987-1130s-projects/aquacrm/settings/environment-variables", external: true },
  email: { label: "Open Resend API keys", href: "https://resend.com/api-keys", external: true },
  uploads: { label: "Open Supabase storage", href: "https://supabase.com/dashboard/project/dghzbsxbdatskserctgt/storage/buckets", external: true },
  billing: { label: "Open Stripe API keys", href: "https://dashboard.stripe.com/apikeys", external: true },
  google: { label: "Open Google credentials", href: "https://console.cloud.google.com/apis/credentials", external: true },
  github: { label: "Open GitHub access tokens", href: "https://github.com/settings/tokens", external: true },
  vercel: { label: "Open Vercel access tokens", href: "https://vercel.com/account/settings/tokens", external: true },
  assistant: { label: "Open OpenAI API keys", href: "https://platform.openai.com/api-keys", external: true },
  "assistant-api": { label: "Manage external AI access", href: "/portal/agency/settings#launch" },
  monitoring: { label: "Open Sentry projects", href: "https://sentry.io/settings/projects/", external: true },
  vercelEnvironment: { label: "Open Vercel environment variables", href: "https://vercel.com/edstorm987-1130s-projects/aquacrm/settings/environment-variables", external: true },
};

function ReadinessActionLink({ itemId }: { itemId: ReadinessItemId }) {
  const destination = SERVICE_DESTINATIONS[itemId];
  const className = "mt-3 inline-flex min-h-9 items-center gap-2 rounded-md border border-black/15 bg-white px-3 text-xs font-semibold text-black/65 transition hover:border-black/30 hover:text-black";
  if (destination.external) {
    return <a href={destination.href} target="_blank" rel="noreferrer" className={className}>{destination.label}<ArrowUpRight size={13} aria-hidden /></a>;
  }
  return <Link href={destination.href} className={className}>{destination.label}<span aria-hidden>›</span></Link>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5 text-xs font-medium text-black/60"><span>{label}</span>{children}</label>;
}

function SaveRow({ status, canManage }: { status: string; canManage: boolean }) {
  return <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-4"><p role="status" className="text-xs text-black/45">{canManage ? status : "Only an owner or manager can change these settings."}</p>{canManage ? <button className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white"><Save size={14} />Save settings</button> : null}</div>;
}

function SettingsPermissionNotice({ capability }: { capability: string }) {
  return <p role="status" className="rounded-md border border-black/10 bg-black/[0.02] px-4 py-3 text-sm leading-6 text-black/55">Only an owner or manager can {capability}. Ask one of them if you need access.</p>;
}

async function saveSettings(patch: Record<string, unknown>): Promise<{ ok: boolean; error: string }> {
  try {
    const response = await fetch("/api/portal/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    const json = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
    return response.ok && json?.ok ? { ok: true, error: "" } : { ok: false, error: json?.error || "Could not save settings." };
  } catch {
    return { ok: false, error: "Could not save settings." };
  }
}

const control = "min-h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black/80 outline-none focus:border-black/35 disabled:bg-black/[0.03] disabled:text-black/40";

const STAGES: Array<{ value: ClientStage; label: string }> = [
  { value: "aqua-epic-intro", label: "Onboarding" },
  { value: "aqua-blueprint", label: "Planning" },
  { value: "aqua-diagnostics", label: "Content & foundations" },
  { value: "aqua-brand-builder", label: "Design" },
  { value: "aqua-traffic", label: "Build & launch" },
  { value: "aqua-mastery", label: "Live care" },
];

function PhasesPane({ ctx }: { ctx: SettingsContext }) {
  return (
    <Section eyebrow="Phases">
      <p className="text-sm text-black/65">
        Stages drive the client journey, recommended systems, and the portal setup for each tier.
      </p>
      <div className="mt-4">
        <PrimaryLink href={ctx.agency ? "/portal/agency/phases" : "/portal/agency"}>Open phases editor</PrimaryLink>
      </div>
    </Section>
  );
}

function statusLabel(status: ReadinessStatus): string {
  if (status === "ready") return "Ready";
  if (status === "needs-setup") return "Setup needed";
  return "Optional";
}

function LaunchPane({ readiness, canManageExternalAi }: { readiness: ProductionReadiness; canManageExternalAi: boolean }) {
  const required = readiness.items.filter(item => item.required);
  const readyCount = required.filter(item => item.status === "ready").length;
  // Whose readiness this pane is showing. For a company audience the platform
  // rows — database, session security, file storage, monitoring — were filtered
  // out server-side because only the operator can change them, so the heading
  // must not keep claiming a verdict about the whole deployment off a check
  // that only looked at this workspace's own connections.
  const companyAudience = readiness.audience === "company";

  return (
    <>
    <Section eyebrow="External AI">
      {canManageExternalAi ? <ExternalAiConnectionPanel /> : <SettingsPermissionNotice capability="manage external AI access" />}
      {/* Settings used to carry a second Integrations tab; connections now live in
          one place. Anyone configuring External AI here is a step away from
          looking for the rest, so say where they went rather than leaving them
          to hunt. */}
      <p className="mt-4 text-xs leading-5 text-black/45">
        Every other integration — email and messaging senders, GitHub, Vercel, analytics — lives in{" "}
        <Link href="/portal/agency/company?view=connections" className="font-semibold text-black/60 underline underline-offset-2 hover:text-black">Company → Connections</Link>.
      </p>
    </Section>
    <section aria-labelledby="launch-readiness-title" className="border-y border-black/10">
      <header className="flex flex-col gap-3 border-b border-black/10 py-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase text-emerald-700">Launch readiness</div>
          <h2 id="launch-readiness-title" className="mt-1 text-xl font-semibold text-black/90">
            {companyAudience
              ? (readiness.ready ? "Your workspace is set up" : "Your workspace setup is incomplete")
              : (readiness.ready ? "Ready for production" : "Production setup is incomplete")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-black/55">
            {companyAudience
              ? "This checks the services this workspace connects for itself — customer email, payments, publishing and AI. The database, file storage and security of the deployment belong to whoever runs it and are not checked here."
              : "This checks the services that keep customer access, data, files, and email durable outside this computer."}
          </p>
        </div>
        <div className="shrink-0 text-left sm:text-right">
          <div className="text-sm font-semibold text-black/85">{readyCount} of {required.length} required services ready</div>
          <div className="mt-0.5 text-xs capitalize text-black/45">{readiness.environment} environment</div>
        </div>
      </header>

      <div>
        {readiness.items.map(item => (
          <div key={item.id} className="grid gap-3 border-b border-black/[0.07] py-4 last:border-b-0 md:grid-cols-[minmax(150px,0.7fr)_minmax(0,2fr)_auto] md:items-start">
            <div>
              <div className="text-sm font-semibold text-black/85">{item.label}</div>
              <span className={[
                "mt-1 inline-flex text-xs font-semibold",
                item.status === "ready"
                  ? "text-emerald-700"
                  : item.status === "needs-setup"
                    ? "text-amber-700"
                    : "text-black/45",
              ].join(" ")}>
                {statusLabel(item.status)}
              </span>
            </div>
            <div>
              <p className="text-sm leading-6 text-black/65">{item.summary}</p>
              <p className="mt-1 text-xs leading-5 text-black/45">{item.action}</p>
              <ReadinessActionLink itemId={item.id} />
            </div>
            <div className="text-xs font-medium text-black/40 md:pt-0.5">
              {item.required ? "Required" : "Optional"}
            </div>
          </div>
        ))}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 py-4">
        <p className="text-xs leading-5 text-black/45">
          No credentials or private values are shown here.
        </p>
        <Link href="/healthz/full" target="_blank" className="text-sm font-medium text-black/65 underline decoration-black/20 underline-offset-4 hover:text-black">
          Open deep health check
        </Link>
      </footer>
    </section>
    </>
  );
}
