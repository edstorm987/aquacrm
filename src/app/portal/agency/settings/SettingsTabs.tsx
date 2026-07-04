"use client";

// Client-side tab switcher for /portal/settings. Each tab renders a
// section of read-mostly info + deep-link buttons to the existing
// detail pages (Profile, Preferences, Permissions, Phases). Keeps the
// "one massive page" feel while reusing the canonical surfaces for
// real editing.

import Link from "next/link";
import { useState, type ReactNode } from "react";

interface SettingsContext {
  user: { name?: string; email: string; role: string; avatarUrl?: string };
  agency?: { id: string; name: string; slug: string; primaryColor?: string };
  workspace?: {
    clientCount: number;
    phaseCount: number;
    pluginCount: number;
  };
}

type TabId = "general" | "profile" | "preferences" | "permissions" | "workspace" | "phases";

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: "general",     label: "General",     icon: <Icon path="M3 12h18M3 6h18M3 18h18" /> },
  { id: "profile",     label: "Profile",     icon: <Icon path="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 7a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" /> },
  { id: "preferences", label: "Preferences", icon: <Icon path="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09" /> },
  { id: "permissions", label: "Permissions", icon: <Icon path="M3 11h18v11H3z M7 11V7a5 5 0 0 1 10 0v4" /> },
  { id: "workspace",   label: "Workspace",   icon: <Icon path="M3 21h18 M5 21V7l8-4v18 M19 21V11l-6-4" /> },
  { id: "phases",      label: "Phases",      icon: <Icon path="M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83 M2 12h4 M18 12h4 M4.93 19.07l2.83-2.83 M16.24 7.76l2.83-2.83" /> },
];

function Icon({ path }: { path: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {path.split(" M").map((seg, i) => <path key={i} d={(i === 0 ? "" : "M") + seg} />)}
    </svg>
  );
}

export function SettingsTabs({ ctx }: { ctx: SettingsContext }) {
  const [active, setActive] = useState<TabId>("general");

  return (
    <>
      <nav role="tablist" aria-label="Settings sections" className="-mb-px flex flex-wrap gap-1 border-b border-black/10">
        {TABS.map(t => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`settings-pane-${t.id}`}
              onClick={() => setActive(t.id)}
              className={[
                "inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition",
                isActive
                  ? "border-[var(--brand-primary)] text-[var(--brand-primary)]"
                  : "border-transparent text-black/55 hover:text-black/80",
              ].join(" ")}
            >
              <span className={isActive ? "text-[var(--brand-primary)]" : "text-black/45"}>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </nav>

      <div className="mt-6 flex flex-col gap-5">
        {active === "general"     && <GeneralPane ctx={ctx} />}
        {active === "profile"     && <ProfilePane ctx={ctx} />}
        {active === "preferences" && <PreferencesPane />}
        {active === "permissions" && <PermissionsPane ctx={ctx} />}
        {active === "workspace"   && <WorkspacePane ctx={ctx} />}
        {active === "phases"      && <PhasesPane ctx={ctx} />}
      </div>
    </>
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
      <Section eyebrow="Tenant">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Stat label="Active" value={ctx.agency?.name ?? "—"} />
          <Stat label="Slug" value={ctx.agency?.slug ?? "—"} />
          <Stat label="Brand colour" value={ctx.agency?.primaryColor ?? "—"} />
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
        Permissions are inherited from the role grid; founders bypass every gate.
      </p>
      <div className="mt-4">
        <PrimaryLink href="/portal/account/permissions">Open permissions grid</PrimaryLink>
      </div>
    </Section>
  );
}

function WorkspacePane({ ctx }: { ctx: SettingsContext }) {
  return (
    <Section eyebrow="Workspace">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Stat label="Clients"  value={String(ctx.workspace?.clientCount ?? 0)} />
        <Stat label="Phases"   value={String(ctx.workspace?.phaseCount ?? 0)} />
        <Stat label="Plugins"  value={String(ctx.workspace?.pluginCount ?? 0)} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <PrimaryLink href="/portal/agency">Agency dashboard</PrimaryLink>
        {ctx.agency && <PrimaryLink href="/portal/agency/phases">Manage phases</PrimaryLink>}
      </div>
    </Section>
  );
}

function PhasesPane({ ctx }: { ctx: SettingsContext }) {
  return (
    <Section eyebrow="Phases">
      <p className="text-sm text-black/65">
        Aqua phases drive the client onboarding sequence and the plugins each tier installs.
      </p>
      <div className="mt-4">
        <PrimaryLink href={ctx.agency ? "/portal/agency/phases" : "/portal/agency"}>Open phases editor</PrimaryLink>
      </div>
    </Section>
  );
}
