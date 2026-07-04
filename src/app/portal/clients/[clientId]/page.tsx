// Per-client overview — /portal/clients/[clientId].
//
// One screen, tabbed. Tab persists via `?tab=`:
//   Overview · Website · Portal · Kanban · Finance · Assets · Tools.
//
// Server-rendered: every tab's content is computed here so deep-links
// (e.g. `?tab=tools`) hydrate with full data. The "+ Add capability"
// picker on the Tools tab is the only client-side mutating UI.

import { existsSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { requireRoleForClient } from "@/lib/server/auth";
import { ALL_ROLES, type ClientStage } from "@/server/types";
import { getClientForAgency } from "@/server/tenants";
import { listInstalledFor } from "@/server/pluginInstalls";
import { listActivity } from "@/server/activity";
import { phaseLabel, listPhasesForAgency } from "@/server/phases";
import { listPlugins } from "@/plugins/_registry";
import { OverviewTabs } from "./_OverviewTabs";
import { TABS, type TabId } from "./_tabs";
import { ToolsPicker, type PickerPlugin } from "./_ToolsPicker";
import { BuildPortalWizard, type WizardPlugin } from "./_BuildPortalWizard";
import { ClientSopsTab } from "./_ClientSopsTab";
import { KanbanTabClient } from "./_KanbanTabClient";
import { CommsRow } from "./_CommsRow";
import { FilesTabClient, type FileCategory } from "./_FilesTabClient";
import { FinanceTabClient } from "./_FinanceTabClient";
import { PhaseTransitionButton } from "./_PhaseTransitionButton";
import { assertSopsAccess, familiesForStage, SopsAccessError } from "@/lib/server/sopsAccess";
import { RequirePermission } from "@/lib/server/RequirePermission";
import { OnboardingDashboardPanel, type OnboardingPhase } from "./_OnboardingDashboardPanel";
import {
  AQUA_PHASE_ORDER,
  AQUA_MILESTONES,
  isAquaStage,
  getMilestoneState,
  isPhaseComplete,
} from "@/lib/server/onboardingMilestones";

// Phases that materialise into a per-client custom portal (architecture
// extension ch.19b). `aqua-mastery` is the Aqua-flavoured Live; `live`
// is the legacy generic Live still kept for compatibility.
const LIVE_STAGES: ReadonlySet<ClientStage> = new Set(["aqua-mastery", "live"]);
function isLivePhase(stage: ClientStage): boolean {
  return LIVE_STAGES.has(stage);
}

// Plugin set the operator typically pulls into a Live-stage custom
// portal (chapter 19b §5a). Surfaced as a one-click "Recommended for
// Live" install on the Tools tab and as the default-checked plugin set
// in the Build-custom-portal wizard.
const LIVE_RECOMMENDED_PLUGINS: readonly string[] = [
  "website-editor",
  "client-crm",
  "forms",
  "ecommerce",
  "memberships",
  "affiliates",
  "agency-marketing",
];

// Repo root → `04-the-final-portal/clients/<slug>/` lives two levels
// above `portal/`. We resolve from `process.cwd()` (= the portal app
// root in dev + Vercel build) and walk up.
function customPortalExists(slug: string): boolean {
  const root = process.cwd();
  const path = join(root, "..", "clients", slug);
  return existsSync(path);
}

const TAB_IDS = new Set(TABS.map(t => t.id));

function formatRelative(ts: number): string {
  const delta = Date.now() - ts;
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h ago`;
  if (delta < 7 * 86_400_000) return `${Math.round(delta / 86_400_000)}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default async function ClientHome({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await ensureHydrated();
  const { clientId } = await params;
  const sp = await searchParams;
  const session = await requireRoleForClient([...ALL_ROLES], clientId);
  const client = getClientForAgency(session.agencyId, clientId);
  if (!client) notFound();

  const rawTab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: TabId = rawTab && TAB_IDS.has(rawTab as TabId) ? (rawTab as TabId) : "overview";

  const installs = listInstalledFor({ agencyId: client.agencyId, clientId: client.id });
  const enabledIds = new Set(installs.filter(i => i.enabled).map(i => i.pluginId));
  const installedIds = new Set(installs.map(i => i.pluginId));
  const recentActivity = listActivity({ agencyId: client.agencyId, clientId: client.id, limit: 8 });

  const phases = listPhasesForAgency(client.agencyId);
  const currentPhase = phases.find(p => p.stage === client.stage);
  const presetIds = new Set(currentPhase?.pluginPreset ?? []);

  const meta = (client.metadata ?? {}) as {
    planTier?: "foundational" | "expansion" | "mastery";
    whatsappLink?: string;
    clientEmail?: string;
    lastContactedAt?: number;
    stripeLink?: string;
    lockInPaid?: boolean;
    therapistName?: string;
    practiceName?: string;
  };
  const PLAN_LABELS: Record<NonNullable<typeof meta.planTier>, string> = {
    foundational: "Foundational Flow",
    expansion:    "Expansion Plan",
    mastery:      "Mastery Plan",
  };
  const planLabel = meta.planTier ? PLAN_LABELS[meta.planTier] : null;

  const live = isLivePhase(client.stage);
  const portalMaterialized = live && customPortalExists(client.slug);
  const liveRecommended = LIVE_RECOMMENDED_PLUGINS;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-4">
        {client.brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={client.brand.logoUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center rounded-lg text-base font-semibold text-white"
            style={{ backgroundColor: client.brand.primaryColor }}
          >
            {client.name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join("") || "·"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-black/90">{client.name}</h1>
          <div className="mt-2">
            <CommsRow
              clientId={client.id}
              initial={{
                whatsappLink: meta.whatsappLink ?? "",
                clientEmail: meta.clientEmail ?? "",
                lastContactedAt: meta.lastContactedAt ?? 0,
              }}
            />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-black/60">
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-white"
              style={{ backgroundColor: client.brand.primaryColor }}
            >
              {phaseLabel(client.stage)}
            </span>
            {live && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                Live
              </span>
            )}
            <PhaseTransitionButton
              clientId={client.id}
              currentStage={client.stage}
              isFounder={session.role === "agency-owner"}
            />
            {planLabel && (
              <span className="text-[11px] text-black/55">Plan tier: <span className="font-medium text-black/75">{planLabel}</span></span>
            )}
            {meta.lockInPaid && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-800">
                Lock-in paid
              </span>
            )}
            {client.websiteUrl && (
              <a href={client.websiteUrl} target="_blank" rel="noreferrer" className="hover:underline">
                {client.websiteUrl}
              </a>
            )}
          </div>
        </div>
        {live && (
          <div className="flex shrink-0 items-center">
            {portalMaterialized ? (
              <a
                href={`/clients/${client.slug}/`}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 shadow-sm hover:bg-amber-100"
              >
                Open custom portal ↗
              </a>
            ) : (
              <BuildPortalWizard
                clientId={client.id}
                clientName={client.name}
                slug={client.slug}
                plugins={listPlugins().map<WizardPlugin>(plugin => ({
                  id: plugin.id,
                  name: plugin.name ?? plugin.id,
                  description: plugin.description,
                  installed: installedIds.has(plugin.id),
                  recommended: liveRecommended.includes(plugin.id),
                }))}
              />
            )}
          </div>
        )}
      </header>

      <OverviewTabs clientId={client.id} active={tab} />

      {tab === "overview" && isAquaStage(client.stage) && (() => {
        const aquaPhases = phases.filter(p => AQUA_PHASE_ORDER.includes(p.stage));
        aquaPhases.sort((a, b) => AQUA_PHASE_ORDER.indexOf(a.stage) - AQUA_PHASE_ORDER.indexOf(b.stage));
        const currentIdx = AQUA_PHASE_ORDER.indexOf(client.stage);
        const onboardingPhases: OnboardingPhase[] = aquaPhases.map(p => {
          const idx = AQUA_PHASE_ORDER.indexOf(p.stage);
          const state: OnboardingPhase["state"] =
            idx < currentIdx ? "complete" : idx === currentIdx ? "active" : "future";
          const seeds = AQUA_MILESTONES[p.stage] ?? [];
          const milestones = getMilestoneState(client, p.stage).map(m => ({
            id: m.id,
            label: seeds.find(s => s.id === m.id)?.label ?? m.id,
            done: m.done,
          }));
          return {
            id: p.id,
            stage: p.stage,
            label: p.label,
            order: p.order,
            state,
            milestones,
            allComplete: isPhaseComplete(client, p.stage),
          };
        });
        return (
          <OnboardingDashboardPanel
            clientId={client.id}
            phases={onboardingPhases}
            currentStage={client.stage}
          />
        );
      })()}

      {tab === "overview" && (
        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-black/10 bg-white p-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-black/55">Phase</h2>
            <div className="mt-2 text-base font-semibold text-black/90">{phaseLabel(client.stage)}</div>
            {currentPhase?.description && (
              <p className="mt-1 text-sm text-black/60">{currentPhase.description}</p>
            )}
            <div className="mt-3 text-xs text-black/55">
              {installs.length} install{installs.length === 1 ? "" : "s"} ·{" "}
              {enabledIds.size} enabled
            </div>
          </div>
          <div className="rounded-xl border border-black/10 bg-white p-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-black/55">Quick actions</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/portal/clients/${client.id}?tab=website`} className="rounded-md bg-[var(--brand-primary)] px-3 py-2 text-xs font-medium text-white shadow hover:opacity-90">
                Edit website
              </Link>
              <Link href={`/portal/clients/${client.id}?tab=portal`} className="rounded-md border border-black/15 px-3 py-2 text-xs hover:bg-black/5">
                Edit portal
              </Link>
              <Link href={`/portal/clients/${client.id}?tab=tools`} className="rounded-md border border-black/15 px-3 py-2 text-xs hover:bg-black/5">
                + Add capability
              </Link>
              {meta.whatsappLink && (
                <a
                  href={meta.whatsappLink}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                >
                  Open WhatsApp group ↗
                </a>
              )}
              {meta.stripeLink && (
                <a
                  href={meta.stripeLink}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-black/15 px-3 py-2 text-xs hover:bg-black/5"
                >
                  Stripe / invoice ↗
                </a>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-black/10 bg-white p-4 md:col-span-2">
            <h2 className="text-sm font-medium uppercase tracking-wide text-black/55">Recent activity</h2>
            {recentActivity.length === 0 ? (
              <p className="mt-2 text-sm text-black/55">Nothing yet.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-1.5 text-sm">
                {recentActivity.map(a => (
                  <li key={a.id} className="flex items-baseline justify-between gap-3 border-b border-black/5 pb-1.5 last:border-0">
                    <span className="text-black/80">{a.message}</span>
                    <span className="shrink-0 text-[11px] text-black/45">{formatRelative(a.ts)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {tab === "website" && (
        <section className="rounded-xl border border-black/10 bg-white p-6">
          <h2 className="text-lg font-medium text-black/90">Website</h2>
          <p className="mt-1 text-sm text-black/60">
            The website-editor manages pages, blocks, and assets for {client.name}.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/portal/clients/${client.id}/website-editor/pages`}
              className="rounded-md bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white shadow hover:opacity-90"
            >
              Edit website
            </Link>
            {client.websiteUrl && (
              <a href={client.websiteUrl} target="_blank" rel="noreferrer" className="rounded-md border border-black/15 px-4 py-2 text-sm hover:bg-black/5">
                Open live site ↗
              </a>
            )}
          </div>
        </section>
      )}

      {tab === "portal" && (
        <section className="rounded-xl border border-black/10 bg-white p-6">
          <h2 className="text-lg font-medium text-black/90">Portal</h2>
          <p className="mt-1 text-sm text-black/60">
            The end-customer portal painted with {client.name}&apos;s brand kit.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/portal/clients/${client.id}/website-editor/portal-variants`}
              className="rounded-md bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white shadow hover:opacity-90"
            >
              Edit portal
            </Link>
            <Link
              href={`/portal/clients/${client.id}/portal-export`}
              className="rounded-md border border-black/15 px-4 py-2 text-sm hover:bg-black/5"
            >
              Export to repo
            </Link>
          </div>
        </section>
      )}

      {tab === "kanban" && (
        <KanbanTabClient clientId={client.id} clientName={client.name} />
      )}

      {tab === "finance" && (
        <RequirePermission session={session} requires={["finance.view"]}>
          <FinanceTabClient
            clientId={client.id}
            initial={{
              planTier: meta.planTier,
              lockInPaid: meta.lockInPaid,
              stripeLink: meta.stripeLink,
            }}
          />
        </RequirePermission>
      )}

      {tab === "assets" && (
        <section className="rounded-xl border border-black/10 bg-white p-6">
          <h2 className="text-lg font-medium text-black/90">Assets</h2>
          <p className="mt-1 text-sm text-black/60">
            Brand assets, uploads, and the website-editor asset library.
          </p>
          <div className="mt-4">
            <Link
              href={`/portal/clients/${client.id}/website-editor/assets`}
              className="rounded-md bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white shadow hover:opacity-90"
            >
              Open assets
            </Link>
          </div>
        </section>
      )}

      {tab === "sops" && (() => {
        try {
          assertSopsAccess(session, undefined);
        } catch (err) {
          if (err instanceof SopsAccessError) {
            return (
              <section className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
                403 — {err.message}
              </section>
            );
          }
          throw err;
        }
        const families = familiesForStage(client.stage);
        return (
          <ClientSopsTab families={families} phaseLabel={phaseLabel(client.stage)} />
        );
      })()}

      {tab === "files" && (
        <FilesTabClient
          clientId={client.id}
          initialFiles={(((client.metadata ?? {}) as { files?: Array<{
            id: string; name: string; url: string;
            category: FileCategory; uploadedBy?: string; uploadedAt: number;
          }> }).files) ?? []}
        />
      )}

      {tab === "tools" && (
        <RequirePermission session={session} requires={["plugins.install"]}>
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-medium text-black/90">Capabilities</h2>
              <p className="mt-1 text-sm text-black/60">
                Install or uninstall plugins for {client.name}. Plugins from the current phase preset are labelled.
              </p>
            </div>
            <span className="text-xs text-black/55">
              {installs.length} installed · {enabledIds.size} enabled
            </span>
          </div>
          <ToolsPicker
            clientId={client.id}
            isLive={live}
            liveRecommended={liveRecommended}
            plugins={listPlugins().map<PickerPlugin>(plugin => {
              const install = installs.find(i => i.pluginId === plugin.id);
              return {
                id: plugin.id,
                name: plugin.name ?? plugin.id,
                description: plugin.description,
                installed: installedIds.has(plugin.id),
                enabled: enabledIds.has(plugin.id),
                fromPreset: install ? presetIds.has(plugin.id) : false,
              };
            })}
          />
        </section>
        </RequirePermission>
      )}
    </div>
  );
}
