"use client";

// Client-side tab switcher for /portal/settings. Each tab renders a
// section of read-mostly info + deep-link buttons to the existing
// detail pages (Profile, Preferences, Permissions, Phases). Keeps the
// "one massive page" feel while reusing the canonical surfaces for
// real editing.

import Link from "next/link";
import { ArrowUpRight, Bell, Boxes, Briefcase, Check, CircleUserRound, Eye, Save, ScrollText, ShieldCheck, SlidersHorizontal, Sparkles, UsersRound } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { ProductionReadiness, ReadinessStatus } from "@/lib/server/productionReadiness";
import type { AgencyWorkspaceSettings, ClientStage } from "@/server/types";
import { TeamUsersPanel } from "./TeamUsersPanel";
import { ShowcaseModePanel } from "./ShowcaseModePanel";
import { ActivityLogPanel } from "./ActivityLogPanel";
import { ExternalAiConnectionPanel } from "./ExternalAiConnectionPanel";
import {
  APP_VERSION,
  PRODUCT_RELEASES,
  RELEASE_SEEN_EVENT,
  RELEASE_STORAGE_KEY,
  formatReleaseDate,
} from "@/lib/releases";

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
  canManageSettings: boolean;
  isShowcase: boolean;
  tradingCompanies: Array<{ id: string; name: string }>;
  clients: Array<{ id: string; name: string }>;
  team: Array<{
    id: string;
    name: string;
    email: string;
    username?: string;
    role: "agency-owner" | "agency-manager" | "agency-staff";
    companyIds: string[];
  }>;
}

type TabId = "account" | "team" | "workspace" | "showcase" | "freelancer" | "defaults" | "notifications" | "updates" | "logs" | "launch";

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: "account", label: "Account", icon: <CircleUserRound size={16} /> },
  { id: "team", label: "Team", icon: <UsersRound size={16} /> },
  { id: "workspace", label: "Workspace", icon: <Boxes size={16} /> },
  { id: "showcase", label: "Showcase", icon: <Eye size={16} /> },
  { id: "freelancer", label: "Freelancer access", icon: <Briefcase size={16} /> },
  { id: "defaults", label: "Defaults", icon: <SlidersHorizontal size={16} /> },
  { id: "notifications", label: "Notifications", icon: <Bell size={16} /> },
  { id: "updates", label: "What’s new", icon: <Sparkles size={16} /> },
  { id: "logs", label: "Activity log", icon: <ScrollText size={16} /> },
  { id: "launch", label: "Launch", icon: <ShieldCheck size={16} /> },
];

export function SettingsTabs({ ctx }: { ctx: SettingsContext }) {
  const [active, setActive] = useState<TabId>("account");

  useEffect(() => {
    const syncHash = () => {
      const requested = window.location.hash.slice(1) as TabId;
      if (TABS.some(tab => tab.id === requested)) setActive(requested);
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
      <label className="grid gap-1.5 text-xs font-medium text-black/50 sm:hidden">
        Settings section
        <select value={active} onChange={event => selectTab(event.target.value as TabId)} className={control} aria-label="Settings section">
          {TABS.map(tab => <option key={tab.id} value={tab.id}>{tab.label}</option>)}
        </select>
      </label>
      <nav role="tablist" aria-label="Settings sections" className="-mb-px hidden gap-1 overflow-x-auto border-b border-black/10 sm:flex">
        {TABS.map(t => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`settings-pane-${t.id}`}
              onClick={() => selectTab(t.id)}
              className={[
                "inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition",
                isActive
                  ? "border-brand text-brand"
                  : "border-transparent text-black/55 hover:text-black/80",
              ].join(" ")}
            >
              <span className={isActive ? "text-brand" : "text-black/45"}>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </nav>

      <div className="mt-6 flex flex-col gap-5">
        {active === "account"     && <GeneralPane ctx={ctx} />}
        {active === "team"        && <TeamPane ctx={ctx} />}
        {active === "workspace"   && <WorkspacePane ctx={ctx} />}
        {active === "showcase"    && <Section eyebrow="Showcase Mode"><ShowcaseModePanel active={ctx.isShowcase} canManage={ctx.canManageSettings} /></Section>}
        {active === "freelancer"  && <Section eyebrow="Freelancer access"><div className="grid gap-4"><p className="max-w-2xl text-sm leading-6 text-black/58">Control what a freelancer sees and can do in their own workspace — brief, dates, their fee, deliverables, whether the client is named or anonymised, and which actions they can take. Privacy-first by default.</p><Link href="/portal/agency/freelancer-access" className="inline-flex min-h-10 w-fit items-center gap-2 rounded-md bg-black px-4 text-sm font-semibold text-white hover:bg-black/85">Configure freelancer access <ArrowUpRight size={15} /></Link></div></Section>}
        {active === "defaults"    && <DefaultsPane ctx={ctx} />}
        {active === "notifications" && <NotificationsPane ctx={ctx} />}
        {active === "updates"     && <UpdatesPane />}
        {active === "logs"        && <Section eyebrow="Activity log"><ActivityLogPanel clients={ctx.clients} /></Section>}
        {active === "launch"      && <LaunchPane readiness={ctx.readiness} />}
      </div>
    </>
  );
}

function TeamPane({ ctx }: { ctx: SettingsContext }) {
  return (
    <Section eyebrow="Team">
      <TeamUsersPanel
        initialUsers={ctx.team}
        canCreateManagers={ctx.user.role === "agency-owner"}
        companies={ctx.tradingCompanies}
      />
    </Section>
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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Stat label="Active" value={ctx.agency?.name ?? "—"} />
          <Stat label="Slug" value={ctx.agency?.slug ?? "—"} />
          <Stat label="Brand colour" value={ctx.agency?.primaryColor ?? "—"} />
        </div>
        <div className="mt-5 border-t border-black/10 pt-5">
          <BusinessSettingsForm initial={ctx.settings} canManage={ctx.canManageSettings} />
        </div>
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
        <p className="mt-1 text-xs leading-5 text-black/45">Used as the central AquaOasis-Web identity for documents, client communication, and support.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Legal or trading name"><input value={form.legalName} onChange={event => setForm(value => ({ ...value, legalName: event.target.value }))} className={control} disabled={!canManage} /></Field>
        <Field label="Support email"><input type="email" value={form.supportEmail} onChange={event => setForm(value => ({ ...value, supportEmail: event.target.value }))} className={control} disabled={!canManage} /></Field>
        <Field label="Phone"><input value={form.phone} onChange={event => setForm(value => ({ ...value, phone: event.target.value }))} className={control} disabled={!canManage} /></Field>
        <Field label="Website"><input type="url" value={form.website} onChange={event => setForm(value => ({ ...value, website: event.target.value }))} className={control} placeholder="https://milesymedia.com" disabled={!canManage} /></Field>
        <Field label="Company number"><input value={form.companyNumber} onChange={event => setForm(value => ({ ...value, companyNumber: event.target.value }))} className={control} disabled={!canManage} /></Field>
        <Field label="VAT or tax number"><input value={form.taxNumber} onChange={event => setForm(value => ({ ...value, taxNumber: event.target.value }))} className={control} disabled={!canManage} /></Field>
        <div className="sm:col-span-2"><Field label="Business address"><textarea rows={3} value={form.businessAddress} onChange={event => setForm(value => ({ ...value, businessAddress: event.target.value }))} className={`${control} resize-none py-2`} disabled={!canManage} /></Field></div>
        <Field label="Timezone"><select value={form.timezone} onChange={event => setForm(value => ({ ...value, timezone: event.target.value }))} className={control} disabled={!canManage}><option value="Europe/London">Europe/London</option><option value="UTC">UTC</option><option value="America/New_York">America/New_York</option><option value="America/Los_Angeles">America/Los_Angeles</option><option value="Europe/Paris">Europe/Paris</option></select></Field>
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
          <Field label="Default starting stage"><select value={form.defaultClientStage} onChange={event => setForm(value => ({ ...value, defaultClientStage: event.target.value as ClientStage }))} className={control} disabled={!ctx.canManageSettings}>{STAGES.map(stage => <option key={stage.value} value={stage.value}>{stage.label}</option>)}</select></Field>
          <Field label="Access-code expiry"><select value={form.portalAccessDays} onChange={event => setForm(value => ({ ...value, portalAccessDays: event.target.value }))} className={control} disabled={!ctx.canManageSettings}><option value="1">1 day</option><option value="3">3 days</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option></select></Field>
          <label className="flex min-h-11 items-center gap-3 rounded-md border border-black/10 px-3 text-sm text-black/65 sm:col-span-2"><input type="checkbox" checked={form.createPortalByDefault} onChange={event => setForm(value => ({ ...value, createPortalByDefault: event.target.checked }))} disabled={!ctx.canManageSettings} /><span><strong className="font-medium text-black/75">Create client portals by default</strong><span className="block text-xs text-black/40">This remains optional on every new client.</span></span></label>
          <div className="sm:col-span-2"><Field label="Default client welcome message"><textarea rows={4} value={form.clientWelcomeMessage} onChange={event => setForm(value => ({ ...value, clientWelcomeMessage: event.target.value }))} className={`${control} resize-none py-2`} placeholder="Welcome to your project home..." disabled={!ctx.canManageSettings} /></Field></div>
        </div>
      </Section>
      <Section eyebrow="Finance defaults">
        <p className="mb-4 text-xs leading-5 text-black/45">Applied to new products and documents. Amend individual records in <InlineLink href="/portal/agency/agency-finance/invoices">Invoices</InlineLink> or edit agreement templates inside <InlineLink href="/portal/agency/fulfilment?view=services">Services</InlineLink>.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Currency"><select value={form.defaultCurrency} onChange={event => setForm(value => ({ ...value, defaultCurrency: event.target.value }))} className={control} disabled={!ctx.canManageSettings}><option>GBP</option><option>EUR</option><option>USD</option></select></Field>
          <Field label="Default tax %"><input type="number" min="0" max="100" step="0.01" value={form.defaultTaxRatePercent} onChange={event => setForm(value => ({ ...value, defaultTaxRatePercent: event.target.value }))} className={control} disabled={!ctx.canManageSettings} /></Field>
          <Field label="Payment terms"><input type="number" min="0" max="365" value={form.defaultPaymentTermsDays} onChange={event => setForm(value => ({ ...value, defaultPaymentTermsDays: event.target.value }))} className={control} disabled={!ctx.canManageSettings} /></Field>
          <Field label="Invoice prefix"><input value={form.invoicePrefix} onChange={event => setForm(value => ({ ...value, invoicePrefix: event.target.value }))} className={control} maxLength={12} disabled={!ctx.canManageSettings} /></Field>
        </div>
      </Section>
      <SaveRow status={status} canManage={ctx.canManageSettings} />
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
          {options.map(option => <label key={option.key} className="flex cursor-pointer items-start justify-between gap-5 py-4 first:pt-0 last:pb-0"><span><strong className="text-sm font-medium text-black/75">{option.label}</strong><span className="mt-1 block text-xs leading-5 text-black/45">{option.detail}</span></span><input type="checkbox" className="mt-1" checked={notifications[option.key]} onChange={event => setNotifications(value => ({ ...value, [option.key]: event.target.checked }))} disabled={!ctx.canManageSettings} /></label>)}
        </div>
      </Section>
      <Section eyebrow="Advisor guardrails">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Lead response target"><input type="number" min="1" max="240" value={advisor.speedToLeadTargetMinutes} onChange={event => setAdvisor(value => ({ ...value, speedToLeadTargetMinutes: Number(event.target.value) }))} className={control} disabled={!ctx.canManageSettings} /></Field>
          <Field label="Lead warning after"><input type="number" min="1" max="720" value={advisor.speedToLeadWarningMinutes} onChange={event => setAdvisor(value => ({ ...value, speedToLeadWarningMinutes: Number(event.target.value) }))} className={control} disabled={!ctx.canManageSettings} /></Field>
          <Field label="Lead critical after"><input type="number" min="1" max="1440" value={advisor.speedToLeadCriticalMinutes} onChange={event => setAdvisor(value => ({ ...value, speedToLeadCriticalMinutes: Number(event.target.value) }))} className={control} disabled={!ctx.canManageSettings} /></Field>
          <Field label="Data stale after"><input type="number" min="1" max="720" value={advisor.staleDataHours} onChange={event => setAdvisor(value => ({ ...value, staleDataHours: Number(event.target.value) }))} className={control} disabled={!ctx.canManageSettings} /></Field>
        </div>
        <p className="mt-3 text-xs text-black/42">Times are in minutes, except data freshness which is measured in hours.</p>
      </Section>
      <Section eyebrow="Digest">
        <Field label="Summary frequency"><select value={notifications.digest} onChange={event => setNotifications(value => ({ ...value, digest: event.target.value as typeof notifications.digest }))} className={`${control} max-w-xs`} disabled={!ctx.canManageSettings}><option value="off">No digest</option><option value="daily">Daily summary</option><option value="weekly">Weekly summary</option></select></Field>
        <p className="mt-2 text-xs leading-5 text-black/40">The preference is saved now. Email delivery requires the <InlineLink href="/portal/agency/company?view=connections">customer email connection</InlineLink>.</p>
      </Section>
      <SaveRow status={status} canManage={ctx.canManageSettings} />
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

function LaunchPane({ readiness }: { readiness: ProductionReadiness }) {
  const required = readiness.items.filter(item => item.required);
  const readyCount = required.filter(item => item.status === "ready").length;

  return (
    <>
    <Section eyebrow="External AI">
      <ExternalAiConnectionPanel />
    </Section>
    <section aria-labelledby="launch-readiness-title" className="border-y border-black/10">
      <header className="flex flex-col gap-3 border-b border-black/10 py-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase text-emerald-700">Launch readiness</div>
          <h2 id="launch-readiness-title" className="mt-1 text-xl font-semibold text-black/90">
            {readiness.ready ? "Ready for production" : "Production setup is incomplete"}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-black/55">
            This checks the services that keep customer access, data, files, and email durable outside this computer.
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
