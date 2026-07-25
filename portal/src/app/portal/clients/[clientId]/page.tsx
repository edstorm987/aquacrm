// Per-client overview — /portal/clients/[clientId].
//
// One screen, tabbed. Tab persists via `?tab=`:
//   Overview · Website · Fulfilment · Kanban · Finance · Assets · Systems.
//
// Server-rendered: every tab's content is computed here so deep-links
// (e.g. `?tab=systems`) hydrate with full data. The "+ Add system"
// picker on the Systems tab is the only client-side mutating UI.

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
import { listPlugins } from "@/built-ins/runtime/_registry";
import { TABS, type TabId } from "./_tabs";
import { toolCopy } from "./toolCopy";
import { BuildPortalWizard, type WizardPlugin } from "./_BuildPortalWizard";
import { ClientSopsTab } from "./_ClientSopsTab";
import { KanbanTabClient } from "./_KanbanTabClient";
import { CommsRow } from "./_CommsRow";
import { FilesTabClient, type FileCategory } from "./_FilesTabClient";
import { FinanceTabClient } from "./_FinanceTabClient";
import type { ClientContract } from "@/lib/clientContracts";
import { PropertiesTabClient, type ClientProperty } from "./_PropertiesTabClient";
import { ClientSystemsWorkspace } from "./_ClientSystemsWorkspace";
import { FulfilmentPortalPreview, type CustomerPortalMode } from "./_FulfilmentPortalPreview";
import { PhaseTransitionButton } from "./_PhaseTransitionButton";
import { ClientRequestsPanel } from "./_ClientRequestsPanel";
import type { ClientRequest } from "@/app/api/tenants/client-requests/route";
import type { ClientApproval } from "@/app/api/tenants/client-approvals/route";
import { assertSopsAccess, familiesForStage, SopsAccessError } from "@/lib/server/sopsAccess";
import { RequirePermission } from "@/lib/server/RequirePermission";
import { OnboardingDashboardPanel, type OnboardingPhase } from "./_OnboardingDashboardPanel";
import { loadCustomerPortalData } from "@/app/portal/customer/_portalData";
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

// System set the operator typically pulls into a Live-stage custom
// portal (chapter 19b §5a). Surfaced as a one-click "Recommended for
// Live" action on the Systems tab and as the default-checked system set
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

  const rawTabInput = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const rawTab = rawTabInput === "tools" ? "systems" : rawTabInput === "portal" ? "fulfilment" : rawTabInput;
  const tab: TabId = rawTab && TAB_IDS.has(rawTab as TabId) ? (rawTab as TabId) : "overview";

  const installs = listInstalledFor({ agencyId: client.agencyId, clientId: client.id });
  const installedIds = new Set(installs.map(i => i.pluginId));
  const recentActivity = listActivity({ agencyId: client.agencyId, clientId: client.id, limit: 8 });

  const phases = listPhasesForAgency(client.agencyId);
  const currentPhase = phases.find(p => p.stage === client.stage);
  const meta = (client.metadata ?? {}) as {
    planTier?: "foundational" | "expansion" | "mastery";
    whatsappLink?: string;
    clientEmail?: string;
    lastContactedAt?: number;
    stripeLink?: string;
    lockInPaid?: boolean;
    therapistName?: string;
    practiceName?: string;
    notes?: string;
    nextMeetingAt?: number;
    meetingLink?: string;
    meetingNotes?: string;
    callRecordingUrl?: string;
    sessionNotes?: string;
    inspirationLinks?: string[];
    potentialProblems?: string;
    potentialSolutions?: string;
    pricePoints?: string;
    budgetRange?: string;
    designFeedback?: string;
    supportNotes?: string;
    portalLoginEmail?: string;
    portalMode?: CustomerPortalMode;
    portalContactName?: string;
    portalServicePlan?: string;
    portalPlanSummary?: string;
    portalPlanIncludes?: string[];
    portalBillingCadence?: string;
    portalWelcomeNote?: string;
    portalSupportEmail?: string;
    portalSupportPhone?: string;
    portalSupportWhatsappUrl?: string;
    portalLogoUrl?: string;
    portalAccentColor?: string;
    buyingJourney?: {
      source?: string;
      capturedAt?: number;
      meetingAt?: number;
      meetingLink?: string;
      callRecordingUrl?: string;
      sessionNotes?: string;
      inspirationLinks?: string[];
      potentialProblems?: string;
      potentialSolutions?: string;
      pricePoints?: string;
      budgetRange?: string;
      notes?: string;
    };
    clientRequests?: ClientRequest[];
    properties?: ClientProperty[];
    portalBuiltAt?: number;
    portalAccessSentAt?: number;
    portalAccessPreparedAt?: number;
    files?: Array<{ id: string; category?: string }>;
    contracts?: ClientContract[];
    portalBrief?: {
      businessOverview?: string;
      primaryGoal?: string;
      idealCustomer?: string;
      mustHaves?: string;
      launchTiming?: string;
      additionalNotes?: string;
      submittedAt?: number;
      submittedBy?: string;
    };
    portalApprovals?: ClientApproval[];
  };
  const PLAN_LABELS: Record<NonNullable<typeof meta.planTier>, string> = {
    foundational: "Foundational Flow",
    expansion:    "Expansion Plan",
    mastery:      "Mastery Plan",
  };
  const planLabel = meta.planTier ? PLAN_LABELS[meta.planTier] : null;
  const customerPortalData = tab === "fulfilment"
    ? await loadCustomerPortalData(client, meta.portalContactName ?? client.name)
    : null;

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
                plugins={listPlugins().map<WizardPlugin>(plugin => {
                  const copy = toolCopy({
                    id: plugin.id,
                    name: plugin.name ?? plugin.id,
                    description: plugin.description,
                  });
                  return {
                    id: plugin.id,
                    name: copy.name,
                    description: copy.description,
                    installed: installedIds.has(plugin.id),
                    recommended: liveRecommended.includes(plugin.id),
                  };
                })}
              />
            )}
          </div>
        )}
      </header>

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
          <div className="rounded-xl border border-black/10 bg-white p-4 md:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium uppercase tracking-wide text-black/55">Buying context</h2>
                <p className="mt-1 text-sm text-black/60">
                  The trail from lead to client: call notes, recordings, risks, ideas, budgets, and useful links.
                </p>
              </div>
              {meta.portalLoginEmail && (
                <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] text-black/55">
                  Portal login: {meta.portalLoginEmail}
                </span>
              )}
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <ContextItem label="Budget" value={meta.budgetRange ?? meta.buyingJourney?.budgetRange} />
              <ContextItem label="Price points" value={meta.pricePoints ?? meta.buyingJourney?.pricePoints} />
              <ContextItem label="Next meeting" value={meta.nextMeetingAt ? new Date(meta.nextMeetingAt).toLocaleString() : meta.buyingJourney?.meetingAt ? new Date(meta.buyingJourney.meetingAt).toLocaleString() : undefined} />
              <ContextItem label="Problems to solve" value={meta.potentialProblems ?? meta.buyingJourney?.potentialProblems} wide />
              <ContextItem label="Potential solutions" value={meta.potentialSolutions ?? meta.buyingJourney?.potentialSolutions} wide />
              <ContextItem label="Session notes" value={meta.sessionNotes ?? meta.buyingJourney?.sessionNotes ?? meta.meetingNotes ?? meta.notes} wide />
              <ContextItem label="Design feedback" value={meta.designFeedback} wide />
              <ContextItem label="Support notes" value={meta.supportNotes} wide />
              <ContextItem label="Business overview" value={meta.portalBrief?.businessOverview} wide />
              <ContextItem label="Customer's goal" value={meta.portalBrief?.primaryGoal} wide />
              <ContextItem label="Ideal customer" value={meta.portalBrief?.idealCustomer} />
              <ContextItem label="Must-haves" value={meta.portalBrief?.mustHaves} wide />
              <ContextItem label="Launch timing" value={meta.portalBrief?.launchTiming} />
              <ContextItem label="Additional brief notes" value={meta.portalBrief?.additionalNotes} wide />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {meta.meetingLink && <ExternalPill href={meta.meetingLink} label="Meeting link" />}
              {meta.buyingJourney?.meetingLink && !meta.meetingLink && <ExternalPill href={meta.buyingJourney.meetingLink} label="Meeting link" />}
              {meta.callRecordingUrl && <ExternalPill href={meta.callRecordingUrl} label="Call recording" />}
              {meta.buyingJourney?.callRecordingUrl && !meta.callRecordingUrl && <ExternalPill href={meta.buyingJourney.callRecordingUrl} label="Call recording" />}
              {(meta.inspirationLinks ?? meta.buyingJourney?.inspirationLinks ?? []).map((href, index) => (
                <ExternalPill key={`${href}:${index}`} href={href} label={`Inspiration ${index + 1}`} />
              ))}
              <Link href={`/portal/clients/${client.id}?tab=files`} className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-black/70 hover:bg-black/[0.03]">
                Add files / screenshots
              </Link>
            </div>
          </div>
          <div className="rounded-xl border border-black/10 bg-white p-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-black/55">Phase</h2>
            <div className="mt-2 text-base font-semibold text-black/90">{phaseLabel(client.stage)}</div>
            {currentPhase?.description && (
              <p className="mt-1 text-sm text-black/60">{phaseDescription(currentPhase.description)}</p>
            )}
            <div className="mt-3 text-xs text-black/55">
              {Array.isArray(meta.properties) ? meta.properties.length : 0} connected propert{Array.isArray(meta.properties) && meta.properties.length === 1 ? "y" : "ies"} ·{" "}
              {Array.isArray(meta.properties) ? meta.properties.filter(property => property.tagStatus === "installed").length : 0} monitored
            </div>
          </div>
          <div className="rounded-xl border border-black/10 bg-white p-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-black/55">Quick actions</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/portal/clients/${client.id}?tab=website`} className="rounded-md bg-brand px-3 py-2 text-xs font-medium text-white shadow hover:opacity-90">
                Edit website
              </Link>
              <Link href={`/portal/clients/${client.id}?tab=fulfilment`} className="rounded-md border border-black/15 px-3 py-2 text-xs hover:bg-black/5">
                Portal preview
              </Link>
              <Link href={`/portal/clients/${client.id}?tab=systems`} className="rounded-md border border-black/15 px-3 py-2 text-xs hover:bg-black/5">
                + Add system
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
          <ClientRequestsPanel clientId={client.id} initialRequests={meta.clientRequests ?? []} />
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
            Build pages, sections, assets, and launch previews for {client.name}.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/portal/clients/${client.id}/pages`}
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white shadow hover:opacity-90"
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

      {tab === "fulfilment" && (
        <FulfilmentPortalPreview
          clientId={client.id}
          clientName={client.name}
          initial={{
            mode: meta.portalMode,
            loginEmail: meta.portalLoginEmail ?? meta.clientEmail ?? client.ownerEmail ?? "",
            contactName: meta.portalContactName ?? meta.therapistName ?? "",
            servicePlan: meta.portalServicePlan ?? planLabel ?? "",
            planSummary: meta.portalPlanSummary ?? "",
            planIncludes: meta.portalPlanIncludes ?? [],
            billingCadence: meta.portalBillingCadence ?? "As agreed",
            welcomeNote: meta.portalWelcomeNote ?? "",
            supportEmail: meta.portalSupportEmail ?? customerPortalData?.support.email ?? "",
            supportPhone: meta.portalSupportPhone ?? customerPortalData?.support.phone ?? "",
            supportWhatsappUrl: meta.portalSupportWhatsappUrl ?? customerPortalData?.support.whatsappUrl ?? "",
            logoUrl: meta.portalLogoUrl ?? "",
            accentColor: meta.portalAccentColor ?? "#8b6c33",
            billingUrl: meta.stripeLink ?? "",
            websiteUrl: client.websiteUrl,
            stageLabel: phaseLabel(client.stage),
            portalBuiltAt: meta.portalBuiltAt,
            accessSentAt: meta.portalAccessSentAt,
            accessPreparedAt: meta.portalAccessPreparedAt,
            fileCount: customerPortalData?.files.length ?? 0,
            invoiceCount: customerPortalData?.invoices.length ?? 0,
            outstandingInvoiceCount: customerPortalData?.invoices.filter(invoice => invoice.status === "sent" || invoice.status === "overdue").length ?? 0,
            contractCount: customerPortalData?.contracts.filter(contract => contract.status === "accepted").length ?? 0,
            propertyCount: customerPortalData?.properties.length ?? 0,
            tagInstalledCount: customerPortalData?.properties.filter(property => property.tagStatus === "installed").length ?? 0,
            approvals: customerPortalData?.approvals ?? [],
          }}
        />
      )}

      {tab === "properties" && (
        <PropertiesTabClient
          clientId={client.id}
          clientName={client.name}
          initialProperties={Array.isArray(meta.properties) ? meta.properties : []}
        />
      )}

      {tab === "kanban" && (
        <KanbanTabClient clientId={client.id} clientName={client.name} />
      )}

      {tab === "finance" && (
        <RequirePermission session={session} requires={["finance.view"]}>
          <FinanceTabClient
            clientId={client.id}
            initialContracts={Array.isArray(meta.contracts) ? meta.contracts : []}
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
            Brand assets, uploads, screenshots, design references, and working files.
          </p>
          <div className="mt-4">
            <Link
              href={`/portal/clients/${client.id}/assets`}
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white shadow hover:opacity-90"
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

      {tab === "systems" && (
        <RequirePermission session={session} requires={["clients.view"]}>
          <ClientSystemsWorkspace
            clientId={client.id}
            clientName={client.name}
            properties={Array.isArray(meta.properties) ? meta.properties : []}
          />
        </RequirePermission>
      )}
    </div>
  );
}

function ContextItem({
  label,
  value,
  wide,
}: {
  label: string;
  value?: string;
  wide?: boolean;
}) {
  return (
    <div className={`rounded-lg border border-black/10 bg-black/[0.02] p-3 ${wide ? "lg:col-span-3" : ""}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-black/45">{label}</div>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-black/75">{value || "Not captured yet."}</p>
    </div>
  );
}

function ExternalPill({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-black/70 hover:bg-black/[0.03]"
    >
      {label} ↗
    </a>
  );
}

function phaseDescription(description: string): string {
  return description
    .replace(/\bNo plugin installs yet\./gi, "No extra systems are needed yet.")
    .replace(/\bAll plugins disabled, config preserved\./gi, "Engagement ended; history and settings are preserved.")
    .replace(/\bplugin installs\b/gi, "system setup")
    .replace(/\bplugins\b/gi, "systems");
}
