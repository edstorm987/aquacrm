"use client";

// Client-side tab switcher for /portal/settings. Each tab renders a
// section of read-mostly info + deep-link buttons to the existing
// detail pages (Profile, Preferences, Permissions, Phases). Keeps the
// "one massive page" feel while reusing the canonical surfaces for
// real editing.

import Link from "next/link";
import { Bell, Boxes, CircleUserRound, Eye, PanelsTopLeft, PlugZap, Save, ScrollText, ShieldCheck, SlidersHorizontal, UsersRound } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { ProductionReadiness, ReadinessGroup, ReadinessStatus } from "@/lib/server/productionReadiness";
import type { AgencyWorkspaceSettings, ClientStage } from "@/server/types";
import { TeamUsersPanel } from "./TeamUsersPanel";
import { PortalEditorPanel } from "./PortalEditorPanel";
import { ShowcaseModePanel } from "./ShowcaseModePanel";
import { ActivityLogPanel } from "./ActivityLogPanel";
import { ExternalAiConnectionPanel } from "./ExternalAiConnectionPanel";

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

type TabId = "account" | "team" | "workspace" | "showcase" | "portal-editor" | "defaults" | "notifications" | "integrations" | "logs" | "launch";

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: "account", label: "Account", icon: <CircleUserRound size={16} /> },
  { id: "team", label: "Team", icon: <UsersRound size={16} /> },
  { id: "workspace", label: "Workspace", icon: <Boxes size={16} /> },
  { id: "showcase", label: "Showcase", icon: <Eye size={16} /> },
  { id: "portal-editor", label: "Portal editor", icon: <PanelsTopLeft size={16} /> },
  { id: "defaults", label: "Defaults", icon: <SlidersHorizontal size={16} /> },
  { id: "notifications", label: "Notifications", icon: <Bell size={16} /> },
  { id: "integrations", label: "Integrations", icon: <PlugZap size={16} /> },
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
        {active === "portal-editor" && <Section eyebrow="Portal editor"><PortalEditorPanel canManage={ctx.canManageSettings} /></Section>}
        {active === "defaults"    && <DefaultsPane ctx={ctx} />}
        {active === "notifications" && <NotificationsPane ctx={ctx} />}
        {active === "integrations" && <IntegrationsPane readiness={ctx.readiness} />}
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
    <section className="rounded-xl border border-black/10 bg-white/60 shadow-sm">
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
          <PrimaryLink href="/portal/account/preferences">Preferences</PrimaryLink>
          <PrimaryLink href="/portal/account/permissions">Permissions</PrimaryLink>
          {ctx.agency && <PrimaryLink href="/portal/agency/phases">Phases</PrimaryLink>}
          {ctx.agency && <PrimaryLink href="/portal/agency">Agency dashboard</PrimaryLink>}
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
        Theme, density, notifications and editor preferences live on the dedicated preferences page.
      </p>
      <div className="mt-4">
        <PrimaryLink href="/portal/account/preferences">Open preferences</PrimaryLink>
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
          <SettingsDestination title="Clients and journey" detail="Contacts, lifecycle stages, pipelines, client portals, and delivery progress." links={[["Clients & contacts", "/portal/clients"], ["Journey", "/portal/agency/pipelines/leads"], ["Stages", "/portal/agency/phases"]]} />
          <SettingsDestination title="Products and fulfilment" detail="Products, packages, contracts, billing defaults, welcome packs, and delivery knowledge." links={[["Products", "/portal/agency/products"], ["Performance", "/portal/agency/performance"], ["Development", "/portal/agency/development"]]} />
          <SettingsDestination title="Work and knowledge" detail="Team actions, recurring work, reminders, and SOPs." links={[["Actions", "/portal/agency/actions"], ["SOP library", "/portal/agency/sop-library"]]} />
          <SettingsDestination title="Money and growth" detail="Invoices, income, expenses, campaigns, attribution, and client-care activity." links={[["Finance", "/portal/agency/agency-finance"], ["Marketing", "/portal/agency/marketing"], ["Client care", "/portal/agency/you-deserve-it"]]} />
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
        <p className="mb-4 text-xs leading-5 text-black/45">Starting points for new records. Every client can still be changed individually.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Default starting stage"><select value={form.defaultClientStage} onChange={event => setForm(value => ({ ...value, defaultClientStage: event.target.value as ClientStage }))} className={control} disabled={!ctx.canManageSettings}>{STAGES.map(stage => <option key={stage.value} value={stage.value}>{stage.label}</option>)}</select></Field>
          <Field label="Access-code expiry"><select value={form.portalAccessDays} onChange={event => setForm(value => ({ ...value, portalAccessDays: event.target.value }))} className={control} disabled={!ctx.canManageSettings}><option value="1">1 day</option><option value="3">3 days</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option></select></Field>
          <label className="flex min-h-11 items-center gap-3 rounded-md border border-black/10 px-3 text-sm text-black/65 sm:col-span-2"><input type="checkbox" checked={form.createPortalByDefault} onChange={event => setForm(value => ({ ...value, createPortalByDefault: event.target.checked }))} disabled={!ctx.canManageSettings} /><span><strong className="font-medium text-black/75">Create client portals by default</strong><span className="block text-xs text-black/40">This remains optional on every new client.</span></span></label>
          <div className="sm:col-span-2"><Field label="Default client welcome message"><textarea rows={4} value={form.clientWelcomeMessage} onChange={event => setForm(value => ({ ...value, clientWelcomeMessage: event.target.value }))} className={`${control} resize-none py-2`} placeholder="Welcome to your project home..." disabled={!ctx.canManageSettings} /></Field></div>
        </div>
      </Section>
      <Section eyebrow="Finance defaults">
        <p className="mb-4 text-xs leading-5 text-black/45">Applied to new products and documents, while remaining editable per invoice or agreement.</p>
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
  const [status, setStatus] = useState("");
  const options: Array<{ key: Exclude<keyof typeof notifications, "digest">; label: string; detail: string }> = [
    { key: "overdueTasks", label: "Overdue work", detail: "Tasks, reminders, and recurring actions needing attention." },
    { key: "outages", label: "Client outages", detail: "Production errors and monitoring signals from connected client properties." },
    { key: "supportRequests", label: "Support and feedback", detail: "Tickets, suggestions, cancellations, and provider handover requests." },
    { key: "meetingReminders", label: "Meetings", detail: "Upcoming reminders, missing confirmations, and follow-up attempts." },
    { key: "financeAlerts", label: "Finance", detail: "Overdue invoices, payment gaps, expenses, and recurring costs." },
    { key: "marketingAlerts", label: "Marketing", detail: "Campaign budget, spend, lead attribution, and target warnings." },
  ];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("Saving...");
    const result = await saveSettings({ notifications });
    setStatus(result.ok ? "Notification preferences saved." : result.error);
  }

  return (
    <form onSubmit={submit}>
      <Section eyebrow="Notifications">
        <div className="divide-y divide-black/10">
          {options.map(option => <label key={option.key} className="flex cursor-pointer items-start justify-between gap-5 py-4 first:pt-0 last:pb-0"><span><strong className="text-sm font-medium text-black/75">{option.label}</strong><span className="mt-1 block text-xs leading-5 text-black/45">{option.detail}</span></span><input type="checkbox" className="mt-1" checked={notifications[option.key]} onChange={event => setNotifications(value => ({ ...value, [option.key]: event.target.checked }))} disabled={!ctx.canManageSettings} /></label>)}
        </div>
      </Section>
      <Section eyebrow="Digest">
        <Field label="Summary frequency"><select value={notifications.digest} onChange={event => setNotifications(value => ({ ...value, digest: event.target.value as typeof notifications.digest }))} className={`${control} max-w-xs`} disabled={!ctx.canManageSettings}><option value="off">No digest</option><option value="daily">Daily summary</option><option value="weekly">Weekly summary</option></select></Field>
        <p className="mt-2 text-xs leading-5 text-black/40">The preference is saved now. Email delivery requires the customer email service to be connected.</p>
      </Section>
      <SaveRow status={status} canManage={ctx.canManageSettings} />
    </form>
  );
}

function IntegrationsPane({ readiness }: { readiness: ProductionReadiness }) {
  const groups: Array<{ id: ReadinessGroup; label: string; detail: string }> = [
    { id: "core", label: "App foundation", detail: "Data, security, private files and encrypted credentials." },
    { id: "communication", label: "Access and communication", detail: "Customer email and optional Google sign-in." },
    { id: "money", label: "Payments", detail: "Card payments, subscriptions and payment reconciliation." },
    { id: "development", label: "Development and reliability", detail: "Repositories, deployments, domains and incident monitoring." },
    { id: "intelligence", label: "AI access", detail: "The built-in assistant and model-independent external access." },
  ];

  return (
    <>
      <Section eyebrow="Connections">
        <div className="flex flex-col gap-3 border-b border-black/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-black/90">Everything the app can connect to</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-black/55">
              This page checks configuration without exposing any private value to the browser.
            </p>
          </div>
          <div className="shrink-0 text-sm font-semibold text-black/70">
            {readiness.items.filter(item => item.status === "ready").length} of {readiness.items.length} connected
          </div>
        </div>

        <div className="divide-y divide-black/10">
          {groups.map(group => {
            const items = readiness.items.filter(item => item.group === group.id);
            return (
              <section key={group.id} className="py-5 first:pt-5 last:pb-0">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-black/80">{group.label}</h3>
                  <p className="mt-0.5 text-xs leading-5 text-black/45">{group.detail}</p>
                </div>
                <div className="grid gap-2">
                  {items.map(item => (
                    <details key={item.id} className="group rounded-lg border border-black/10 bg-white/70 open:bg-white">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3">
                        <span className="flex min-w-0 items-center gap-3">
                          <StatusDot status={item.status} />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-black/75">{item.label}</span>
                            <span className="mt-0.5 block truncate text-xs text-black/45">{item.summary}</span>
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-medium text-black/40">{connectionStatusLabel(item.status)}</span>
                      </summary>
                      <div className="border-t border-black/[0.07] px-4 py-3">
                        <p className="text-xs leading-5 text-black/55">{item.action}</p>
                        <div className="mt-3 flex flex-wrap gap-1.5" aria-label={`${item.label} environment variables`}>
                          {item.envKeys.map(key => <code key={key} className="rounded bg-black/[0.05] px-2 py-1 text-[11px] font-medium text-black/60">{key}</code>)}
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </Section>
      <Section eyebrow="Where keys live">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-black/10 bg-white/70 p-4">
            <h3 className="text-sm font-semibold text-black/80">This computer</h3>
            <p className="mt-1 text-xs leading-5 text-black/50">Add local credentials to <code className="font-semibold">.env.local</code>, then restart the local server.</p>
          </div>
          <div className="rounded-lg border border-black/10 bg-white/70 p-4">
            <h3 className="text-sm font-semibold text-black/80">Live on Vercel</h3>
            <p className="mt-1 text-xs leading-5 text-black/50">Add the same names in Project Settings → Environment Variables, then redeploy.</p>
          </div>
        </div>
        <p className="mt-4 text-xs leading-5 text-black/45">Keys are never saved in workspace data, activity logs, client portals or browser storage.</p>
      </Section>
      <Section eyebrow="Integration workspaces">
        <div className="flex flex-wrap gap-2">
          <PrimaryLink href="/portal/agency/agency-finance">Payments and finance</PrimaryLink>
          <PrimaryLink href="/portal/agency/development">GitHub, Vercel and monitoring</PrimaryLink>
          <PrimaryLink href="/portal/agency/marketing">Campaigns and attribution</PrimaryLink>
          <PrimaryLink href="/portal/agency/inbox">Inbox channels</PrimaryLink>
        </div>
      </Section>
    </>
  );
}

function SettingsDestination({ title, detail, links }: { title: string; detail: string; links: Array<[string, string]> }) {
  return <div className="grid gap-3 py-5 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div><h3 className="text-sm font-semibold text-black/75">{title}</h3><p className="mt-1 max-w-2xl text-xs leading-5 text-black/45">{detail}</p></div><div className="flex flex-wrap gap-2">{links.map(([label, href]) => <PrimaryLink key={href} href={href}>{label}</PrimaryLink>)}</div></div>;
}

function StatusDot({ status }: { status: ReadinessStatus }) {
  return <span className={`size-2 rounded-full ${status === "ready" ? "bg-emerald-500" : status === "needs-setup" ? "bg-amber-500" : "bg-black/20"}`} aria-hidden="true" />;
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

function connectionStatusLabel(status: ReadinessStatus): string {
  if (status === "ready") return "Connected";
  if (status === "needs-setup") return "Required";
  return "Not connected";
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
