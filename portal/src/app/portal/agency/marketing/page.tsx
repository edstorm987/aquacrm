import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, ArrowLeft, ArrowUpRight, BarChart3, Building2, Gauge, Globe2, LockKeyhole, MapPin, Megaphone, RadioTower, Star, Target, UserRoundSearch, Users, Workflow } from "lucide-react";

import { CampaignsWorkspace } from "@/app/portal/agency/leads-pipeline/campaigns/_CampaignsWorkspace";
import { AutomationsWorkspace } from "@/app/portal/agency/automations/_AutomationsWorkspace";
import { automationWorkspaceData } from "@/app/portal/agency/automations/_automationWorkspaceData";
import { MarketingChannelsWorkspace, type MarketingAssetKind } from "./_MarketingChannelsWorkspace";
import { CustomerProfilesWorkspace } from "./_CustomerProfilesWorkspace";
import { FunnelsWorkspace } from "./_FunnelsWorkspace";
import {
  MARKETING_CUSTOMER_PROFILES_KEY,
  type MarketingAsset,
  type MarketingCustomerProfile,
} from "@/built-ins/modules/agency-marketing/src/lib/domain";
import { installPlugin, setPluginEnabled } from "@/built-ins/runtime/_runtime";
import { buildBudgetPotSnapshots } from "@/built-ins/modules/agency-finance/src/lib/budgetHealth";
import { ensureAgencyFinanceFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/agencyFinanceFoundation";
import { ensureLeadsPipelineFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/leadsPipelineFoundation";
import { requireRole } from "@/lib/server/auth/auth";
import { listPlugins } from "@/built-ins/runtime/_registry";
import { pageAllowsRoleAt } from "@/built-ins/runtime/_pageScope";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { getInstall } from "@/server/pluginInstalls";
import { getPipelineBySlug } from "@/server/pipelines";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES, type Role } from "@/server/types";
import { listClients } from "@/server/tenants";
import { listTradingCompanies } from "@/server/tradingCompanies";
import type { TradingCompany } from "@/server/types";
import { containerFor as financeContainerFor } from "@aqua/plugin-agency-finance/server";
import { containerFor as leadsContainerFor } from "@aqua/plugin-leads-pipeline/server";
import { ensureAgencyWebsite, readAgencyWebsite, summarizeAgencyWebsite } from "@/server/agencyWebsite";
import { FIRST_PARTY_DEVELOPMENT_PROJECTS } from "@/lib/projects/firstPartyDevelopmentProjects";
import { listInboxConnections } from "@/lib/server/inbox/inboxStore";
import { metaInboxReadiness } from "@/lib/server/integrations/metaMessaging";
import { listAutomationWorkflows } from "@/server/automations";
import { listWebsiteEnquiries } from "@/lib/server/websiteEnquiries";
import { attributeEnquiriesToCampaigns, marketingCommandModel, marketingDataSpine, type MarketingDataSpine } from "@/lib/server/marketingIntelligence";
import {
  MARKETING_VIEW_SECTIONS,
  marketingChannelHref,
  marketingHref,
  marketingSectionAnchor,
  marketingSectionHref,
  orderedMarketingSections,
  resolveMarketingView,
  type MarketingChannel,
  type MarketingSection,
  type MarketingView,
} from "./_marketingViews";
import { MarketingAudienceEvidencePanel, MarketingCampaignAttributionPanel, MarketingFunnelBoard, MarketingPulseWorkspace, MarketingRadarWorkspace } from "./_MarketingCommandSurfaces";
import { AttentionDot } from "@/components/chrome/NotificationAttentionProvider";
import { ClientMarketingServiceWorkspace } from "@/components/marketing/ClientMarketingServiceWorkspace";
import { cleanClientMarketingService } from "@/lib/clients/clientMarketingService";
import { clientWorkspaceDisplayName } from "@/lib/clients/clientWorkspace";
import { measuredCountLabel } from "@/lib/performance/telemetryDisplay";

const LEADS_PLUGIN = "leads-pipeline";
const FINANCE_PLUGIN = "agency-finance";
const EMAIL_PLUGIN = "email-sender";
const MARKETING_PLUGIN = "agency-marketing";
const MARKETING_ASSETS_KEY = "milesymedia/channel-assets/v1";

/**
 * May this role see Campaigns?
 *
 * Asked of the leads-pipeline MANIFEST, not answered here. The two surfaces
 * that show the campaign composer had drifted apart: the plugin page
 * (`/portal/agency/leads-pipeline/campaigns`) declares
 * `visibleToRoles: AGENCY_ADMINS`, and the surface gate closes it to
 * `agency-staff` — while THIS app route gated on `requireRole([...AGENCY_ROLES])`
 * and rendered the very same `CampaignsWorkspace` server-side, so staff read
 * every campaign by typing `/portal/agency/marketing?view=demand`. The API
 * behind it (`leads-pipeline/campaigns`) is already capped by that page, so
 * staff could read the data here and not through the API that serves it — three
 * surfaces, two answers.
 *
 * The manifest wins: it is the more recent, deliberate declaration (the note on
 * that page records exactly why the nav hid Campaigns from staff while the page
 * stayed open), and it is the one the API and the plugin host already obey.
 * Deriving the answer from it rather than restating it is what stops a fourth
 * surface drifting again.
 *
 * Default-deny if the manifest or the page ever goes missing.
 */
function campaignsVisibleToRole(role: Role): boolean {
  const plugin = listPlugins().find(candidate => candidate.id === LEADS_PLUGIN);
  const page = plugin?.pages.find(candidate => candidate.path === "campaigns");
  if (!plugin || !page) return false;
  return pageAllowsRoleAt(plugin, page, "agency", role);
}


export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; brand?: string; compose?: string; client?: string; channel?: string; section?: string }>;
}) {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  const params = await searchParams;
  const { view, channel, section } = resolveMarketingView(params.view, params.channel, params.section);
  const canManage = !session.publicShowcase
    && (session.role === "agency-owner" || session.role === "agency-manager");
  if (session.publicShowcase && view !== "pulse") redirect("/portal/agency/marketing");

  if (view === "automations") {
    const automationData = await automationWorkspaceData(session.agencyId, session.role);
    return (
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-black/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand"><LockKeyhole size={13} aria-hidden /> Internal only</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-black/90">Marketing workspace</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55">Automate internal demand, follow-up, publishing, handovers, reminders and reporting across the CRM. These controls are never exposed to clients.</p>
            <Link href={marketingHref("pulse", "all")} className="mt-3 inline-flex min-h-9 items-center gap-2 text-xs font-semibold text-brand hover:underline"><ArrowLeft size={14} /> Back to marketing pulse</Link>
          </div>
          <div className="flex items-center gap-3 rounded-md border border-black/10 bg-black/[0.025] px-4 py-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-white text-brand shadow-sm"><Workflow size={17} aria-hidden /></span>
            <div><p className="text-[10px] font-semibold uppercase tracking-wide text-black/40">Scope</p><p className="text-sm font-semibold text-black/75">Internal · All brands</p></div>
          </div>
        </header>
        <MarketingWorkspaceNavigation view={view} brandScope="all" />
        <AutomationsWorkspace {...automationData} embedded />
      </div>
    );
  }

  ensureLeadsPipelineFoundationRegistered();

  let install = getInstall({ agencyId: session.agencyId }, LEADS_PLUGIN);
  if (!install && canManage) {
    const result = await installPlugin(LEADS_PLUGIN, {
      scope: { agencyId: session.agencyId },
      installedBy: session.userId,
    });
    if (result.ok) install = result.install;
  } else if (install && !install.enabled && canManage) {
    await setPluginEnabled({ agencyId: session.agencyId }, LEADS_PLUGIN, true);
    install = getInstall({ agencyId: session.agencyId }, LEADS_PLUGIN);
  }
  if (!install) return <p className="text-sm text-red-700">Marketing records could not be opened.</p>;

  let emailInstall = getInstall({ agencyId: session.agencyId }, EMAIL_PLUGIN);
  if (!emailInstall && canManage) {
    const result = await installPlugin(EMAIL_PLUGIN, {
      scope: { agencyId: session.agencyId },
      installedBy: session.userId,
    });
    if (result.ok) emailInstall = result.install;
  } else if (emailInstall && !emailInstall.enabled && canManage) {
    await setPluginEnabled({ agencyId: session.agencyId }, EMAIL_PLUGIN, true);
    emailInstall = getInstall({ agencyId: session.agencyId }, EMAIL_PLUGIN);
  }

  let marketingInstall = getInstall({ agencyId: session.agencyId }, MARKETING_PLUGIN);
  if (!marketingInstall && canManage) {
    const result = await installPlugin(MARKETING_PLUGIN, {
      scope: { agencyId: session.agencyId },
      installedBy: session.userId,
    });
    if (result.ok) marketingInstall = result.install;
  } else if (marketingInstall && !marketingInstall.enabled && canManage) {
    await setPluginEnabled({ agencyId: session.agencyId }, MARKETING_PLUGIN, true);
    marketingInstall = getInstall({ agencyId: session.agencyId }, MARKETING_PLUGIN);
  }

  const { campaigns, leads } = leadsContainerFor({
    agencyId: session.agencyId,
    storage: makePluginStorage(install.id) as never,
  });
  const [campaignRows, leadRows] = await Promise.all([campaigns.list(), leads.list()]);
  const financeInstall = getInstall({ agencyId: session.agencyId }, FINANCE_PLUGIN);
  let budgetPotSnapshots = [] as ReturnType<typeof buildBudgetPotSnapshots>;
  if (financeInstall?.enabled) {
    ensureAgencyFinanceFoundationRegistered();
    const finance = financeContainerFor({
      agencyId: session.agencyId,
      storage: makePluginStorage(financeInstall.id) as never,
      install: financeInstall,
    });
    const [budgetPots, expenses, workforcePayments] = await Promise.all([finance.budgets.list(), finance.expenses.list(), finance.operations.listCompensationPayments()]);
    budgetPotSnapshots = buildBudgetPotSnapshots(budgetPots, campaignRows, expenses, workforcePayments);
  }
  const clients = listClients(session.agencyId);
  const attributedCampaigns = campaignRows.map(campaign => ({
    ...campaign,
    attributedLeads: campaign.sourceKey ? leadRows.filter(lead =>
      lead.source === campaign.sourceKey
      && recordBelongsToCampaign(lead.companyIds ?? (lead.companyId ? [lead.companyId] : []), campaign.companyIds)
    ).length : 0,
    attributedClients: campaign.sourceKey ? clients.filter(client => {
      const metadata = client.metadata as { leadSource?: string } | undefined;
      return metadata?.leadSource === campaign.sourceKey
        && recordBelongsToCampaign(client.companyId ? [client.companyId] : [], campaign.companyIds);
    }).length : 0,
  }));
  const pipeline = getPipelineBySlug(session.agencyId, "leads");
  const columns = pipeline?.columns.map(column => column.label) ?? ["New", "Contacted", "Qualified", "Won", "Lost"];
  const companies = listTradingCompanies(session.agencyId, true).filter(company => company.status !== "archived");
  const selectedCompany = companies.find(company => company.slug === params.brand) ?? null;
  const brandScope = params.brand === "shared" ? "shared" : selectedCompany?.slug ?? "all";
  const selectedCompanyId = selectedCompany?.id ?? null;
  const marketingStorage = marketingInstall ? makePluginStorage(marketingInstall.id) : null;
  const [marketingAssets, customerProfiles] = marketingStorage
    ? await Promise.all([
        marketingStorage.get<MarketingAsset[]>(MARKETING_ASSETS_KEY).then(rows => rows ?? []),
        marketingStorage.get<MarketingCustomerProfile[]>(MARKETING_CUSTOMER_PROFILES_KEY).then(rows => rows ?? []),
      ])
    : [[], []] as [MarketingAsset[], MarketingCustomerProfile[]];
  const scopedMarketingAssets = marketingAssets.filter(asset => recordMatchesBrand(asset.companyIds, brandScope, selectedCompanyId));
  const metaConnections = await listInboxConnections(session.agencyId).catch(() => []);
  const metaReadiness = metaInboxReadiness(session.agencyId);
  const scopedCustomerProfiles = customerProfiles.filter(profile => recordMatchesBrand(profile.companyIds, brandScope, selectedCompanyId));
  const scopedCampaigns = attributedCampaigns.filter(campaign => recordMatchesBrand(campaign.companyIds, brandScope, selectedCompanyId));
  const scopedBudgetPots = budgetPotSnapshots.filter(pot =>
    pot.status === "active"
    && pot.currency === "gbp"
    && recordMatchesBrand(pot.companyIds, brandScope, selectedCompanyId),
  );
  const scopedLeads = leadRows.filter(lead => recordMatchesBrand(lead.companyIds ?? (lead.companyId ? [lead.companyId] : []), brandScope, selectedCompanyId));
  const scopedTags = [...new Set(scopedLeads.flatMap(lead => lead.tags))].sort();
  const scopedSources = [...new Set(scopedLeads.map(lead => lead.source || "Unknown"))].sort();
  const composeChannel = composeToChannel(params.compose);
  const sourceRows = scopedSources.map(source => {
    const rows = scopedLeads.filter(lead => (lead.source || "Unknown") === source);
    return {
      source,
      leads: rows.length,
      contacted: rows.filter(lead => lead.lastContactedAt || (lead.sentCount ?? 0) > 0).length,
      meetings: rows.filter(lead => lead.nextMeetingAt).length,
      converted: rows.filter(lead => lead.tags.includes("converted")).length,
    };
  }).sort((a, b) => b.leads - a.leads);
  const ownWebsite = canManage ? ensureAgencyWebsite(session.agencyId) : readAgencyWebsite(session.agencyId);
  const ownWebsiteSummary = ownWebsite ? summarizeAgencyWebsite(ownWebsite) : null;
  const companyOptions = companies.map(company => ({ id: company.id, name: company.name, slug: company.slug, colour: company.brand.primaryColor }));
  const defaultCompanyIds = selectedCompanyId ? [selectedCompanyId] : [];
  const selectedScopeLabel = selectedCompany?.name ?? (brandScope === "shared" ? "Group / shared" : "All brands");
  const overview = buildMarketingOverview({
    campaigns: scopedCampaigns,
    assets: scopedMarketingAssets,
    leads: scopedLeads,
    sourceRows,
  });
  const automationWorkflows = listAutomationWorkflows(session.agencyId);
  // The data spine — real Aqua Tag telemetry (via the Radar marketing domain) plus
  // live website enquiries, so these views report what happened instead of what the
  // plugin records assume. A demo session reads no enquiries (same rule as the
  // inbox), which the spine reports as "not available", never as "none arrived".
  // After the 10 → 5 consolidation only two views need the command model: Pulse
  // (KPIs + radar) and Demand (the live funnel). Customers needs the spine alone,
  // and Channels needs neither — so a channel tab still costs no radar build.
  const modelViews = view === "pulse" || view === "demand";
  const spineViews = view === "customers";
  const spineEnquiries = (spineViews || modelViews) && !session.isDemo ? await listWebsiteEnquiries(session.agencyId).catch(() => null) : null;
  // The command model builds the spine from the same cached radar read, so pulse,
  // radar and funnel content cost one radar build between them, not three.
  const model = modelViews ? await marketingCommandModel(session.agencyId, { enquiries: spineEnquiries, companyId: selectedCompanyId }) : null;
  const spine = spineViews ? await marketingDataSpine(session.agencyId, { enquiries: spineEnquiries, companyId: selectedCompanyId }) : model?.spine ?? null;

  if (view === "client-services") {
    const selectedClient = clients.find(client => client.id === params.client) ?? clients.find(client => cleanClientMarketingService((client.metadata ?? {}).clientMarketingService).enabled) ?? clients[0] ?? null;
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-10">
        <header className="grid gap-5 border-b border-black/10 pb-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand"><Users size={13} aria-hidden /> Managed client delivery</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-black/90">Client social and ads services</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55">Operate client channels, approvals, paid media and attributable results from the same Marketing system used internally.</p>
            <Link href={marketingHref("pulse", "all")} className="mt-3 inline-flex min-h-9 items-center gap-2 text-xs font-semibold text-brand hover:underline"><ArrowLeft size={14} /> Back to marketing pulse</Link>
          </div>
          <div className="flex items-center gap-3 rounded-md border border-black/10 bg-black/[0.025] px-4 py-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-white text-brand shadow-sm"><Users size={17} aria-hidden /></span>
            <div><p className="text-[10px] font-semibold uppercase tracking-wide text-black/40">Service portfolio</p><p className="text-sm font-semibold text-black/75">{clients.filter(client => cleanClientMarketingService((client.metadata ?? {}).clientMarketingService).enabled).length} active · {clients.length} workspaces</p></div>
          </div>
        </header>
        <MarketingWorkspaceNavigation view={view} brandScope="all" />
        <section aria-labelledby="marketing-client-scope-heading">
          <div className="flex items-end justify-between gap-4"><div><h2 id="marketing-client-scope-heading" className="text-sm font-semibold text-black/75">Client scope</h2><p className="mt-1 text-xs text-black/45">Every record below is tenant-scoped to the selected client.</p></div>{selectedClient ? <Link href={`/portal/clients/${encodeURIComponent(selectedClient.id)}?tab=marketing`} className="text-xs font-semibold text-brand">Open client workspace <ArrowUpRight className="inline" size={13} /></Link> : null}</div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {clients.map(client => {
              const active = client.id === selectedClient?.id;
              const service = cleanClientMarketingService((client.metadata ?? {}).clientMarketingService);
              return <Link key={client.id} href={`/portal/agency/marketing?view=client-services&client=${encodeURIComponent(client.id)}`} aria-current={active ? "page" : undefined} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border px-3 text-xs font-semibold ${active ? "border-brand bg-brand text-white" : "border-black/10 bg-white text-black/58"}`}><span className={`size-2 rounded-full ${service.enabled && service.status === "active" ? "bg-emerald-400" : "bg-black/20"}`} />{clientWorkspaceDisplayName(client)}</Link>;
            })}
          </div>
        </section>
        {selectedClient ? <ClientMarketingServiceWorkspace clientId={selectedClient.id} clientName={clientWorkspaceDisplayName(selectedClient)} initial={cleanClientMarketingService((selectedClient.metadata ?? {}).clientMarketingService)} canManage canApprove={false} embeddedInMarketing /> : <p className="border-y border-black/10 py-16 text-center text-sm text-black/45">Add a client before configuring a managed social or ads service.</p>}
      </div>
    );
  }

  // Campaigns is the plugin's surface, shown here. `campaignsVisibleToRole`
  // asks the manifest so the two cannot disagree; a role it refuses loses the
  // block, its tab in the in-view nav, and the `?section=campaigns` deep link
  // in one move, because all three read this list.
  const canSeeCampaigns = campaignsVisibleToRole(session.role);
  const visibleSections = (blocks: readonly MarketingSection[]): MarketingSection[] =>
    blocks.filter(block => block !== "campaigns" || canSeeCampaigns);

  // The blocks the merged views carry. A retired `?view=` lands on its old block
  // first (see resolveMarketingView) so a bookmark opens on what it asked for.
  const sectionBlocks: Partial<Record<MarketingSection, React.ReactNode>> = view === "pulse" ? {
    pulse: model ? <MarketingPulseWorkspace pulse={model.pulse} spine={model.spine} /> : null,
    radar: model ? <MarketingRadarWorkspace spine={model.spine} /> : null,
  } : view === "demand" ? {
    funnel: model ? <MarketingFunnelBoard funnel={model.funnel} spine={model.spine} /> : null,
    campaigns: !canSeeCampaigns ? null : (
      <div className="space-y-5">
        <div className="flex items-end justify-between border-b border-black/10 pb-3">
          <div>
            <h2 className="text-lg font-semibold text-black/85">Campaigns</h2>
            <p className="mt-1 text-sm text-black/50">Every demand motion in this brand scope, with what it is attributed to.</p>
          </div>
          <Link href="/portal/agency/agency-marketing" className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/65">Templates</Link>
        </div>
        <CampaignQuickStarts brandScope={brandScope} />
        <MarketingCampaignAttributionPanel attribution={spine ? attributeEnquiriesToCampaigns(scopedCampaigns, spine.enquiries) : null} />
        <CampaignsWorkspace
          campaigns={scopedCampaigns}
          availableTags={scopedTags}
          availableSources={scopedSources}
          pipelineColumns={columns}
          emailSenderReady={Boolean(emailInstall?.enabled)}
          companies={companyOptions}
          defaultCompanyIds={defaultCompanyIds}
          defaultChannel={composeChannel}
          budgetPots={scopedBudgetPots}
          customerProfiles={scopedCustomerProfiles}
          embedded
        />
      </div>
    ),
    sources: (
      <div>
        <div className="flex items-end justify-between border-b border-black/10 pb-3">
          <div>
            <h2 className="text-lg font-semibold text-black/85">Lead sources</h2>
            <p className="mt-1 text-sm text-black/50">Where leads came from and what happened next.</p>
          </div>
          <Link href="/portal/agency/pipelines/leads" className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/65">Open leads</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b border-black/10 text-xs text-black/40">
              <tr>
                <th className="py-3 pr-4 font-medium">Source</th>
                <th className="px-3 py-3 text-right font-medium">Leads</th>
                <th className="px-3 py-3 text-right font-medium">Contacted</th>
                <th className="px-3 py-3 text-right font-medium">Meetings</th>
                <th className="py-3 pl-3 text-right font-medium">Converted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.07]">
              {sourceRows.map(row => (
                <tr key={row.source}>
                  <td className="py-4 pr-4 font-medium text-black/75">{sourceLabel(row.source)}</td>
                  <td className="px-3 py-4 text-right tabular-nums text-black/60">{row.leads}</td>
                  <td className="px-3 py-4 text-right tabular-nums text-black/60">{row.contacted}</td>
                  <td className="px-3 py-4 text-right tabular-nums text-black/60">{row.meetings}</td>
                  <td className="py-4 pl-3 text-right font-semibold tabular-nums text-black/75">{row.converted}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sourceRows.length === 0 ? <p className="py-12 text-center text-sm text-black/40">Lead sources will appear when leads are added.</p> : null}
        </div>
        <MarketingEnquirySources spine={spine} />
      </div>
    ),
  } : {};

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <header className="grid gap-5 border-b border-black/10 pb-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-end">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand"><LockKeyhole size={13} aria-hidden /> Internal workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-black/90">Marketing across the business</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55">Five places, not ten: how marketing is performing, where demand comes from, who it is for, the channels carrying it, and the automations behind it.</p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            {canManage ? <Link href={marketingHref("client-services", "all")} className="inline-flex min-h-9 items-center gap-2 text-xs font-semibold text-brand hover:underline"><Users size={14} /> Client services</Link> : null}
            <Link href={MARKETING_KPI_BANK_HREF} className="inline-flex min-h-9 items-center gap-2 text-xs font-semibold text-brand hover:underline"><Gauge size={14} /> Explore in the KPI bank</Link>
            {canManage ? <Link href="/portal/agency/agency-marketing" className="inline-flex min-h-9 items-center gap-2 text-xs font-semibold text-brand hover:underline"><ArrowUpRight size={14} /> Templates, reports and calendar</Link> : null}
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-md border border-black/10 bg-black/[0.025] px-4 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-white text-brand shadow-sm"><Building2 size={17} aria-hidden /></span>
          <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wide text-black/40">Viewing</p><p className="truncate text-sm font-semibold text-black/75">{selectedScopeLabel}</p></div>
        </div>
      </header>

      <BrandScopeNavigation companies={companies} view={view} activeScope={brandScope} canManage={canManage} />

      <MarketingWorkspaceNavigation view={view} brandScope={brandScope} canManage={canManage} />

      {view === "pulse" || view === "demand" ? (
        <div className="space-y-7">
          {view === "pulse" ? <MarketingDataSpinePanel spine={spine} brandScope={brandScope} /> : null}
          {view === "pulse" ? <MarketingAtAGlance overview={overview} customerProfiles={scopedCustomerProfiles} sourceRows={sourceRows} emailSenderReady={Boolean(emailInstall?.enabled)} automationStats={{ total: automationWorkflows.length, active: automationWorkflows.filter(workflow => workflow.status === "active").length }} canSeeCampaigns={canSeeCampaigns} /> : null}
          <MarketingSectionNavigation view={view} section={section} brandScope={brandScope} sections={visibleSections(MARKETING_VIEW_SECTIONS[view] ?? [])} />
          {visibleSections(orderedMarketingSections(view, section)).map(block => (
            <section key={block} id={marketingSectionAnchor(block)} className="scroll-mt-24">
              {sectionBlocks[block] ?? null}
            </section>
          ))}
        </div>
      ) : view === "funnels" ? (
        <div className="space-y-7">
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-black/10 bg-black/[0.02] px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-black/80">Funnels &amp; booking</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-black/50">Build the journey here. How it is <em>performing</em> — pageviews through to won — is the live funnel on Demand, so the two can never disagree.</p>
            </div>
            <Link href={marketingSectionHref("demand", "funnel", brandScope)} className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md border border-black/12 bg-white px-3 text-xs font-semibold text-black/68">Open the live funnel <ArrowUpRight size={14} /></Link>
          </section>
          <FunnelsWorkspace
            assets={scopedMarketingAssets.filter(asset => asset.kind === "funnel")}
            companies={companyOptions}
            defaultCompanyIds={defaultCompanyIds}
            projects={FIRST_PARTY_DEVELOPMENT_PROJECTS.map(project => ({
              id: project.id,
              name: project.name,
              brand: project.brand,
              previewUrl: project.previewUrl,
              publicUrl: project.publicUrl,
              repositoryUrl: project.repositoryUrl,
              sourcePath: project.sourcePath,
            }))}
          />
        </div>
      ) : view === "customers" ? (
        <div className="space-y-6">
          <MarketingAudienceEvidencePanel spine={spine} />
          <CustomerProfilesWorkspace profiles={scopedCustomerProfiles} companies={companyOptions} defaultCompanyIds={defaultCompanyIds} />
        </div>
      ) : view === "channels" ? (
        <div className="space-y-6">
          <MarketingChannelNavigation channel={channel} brandScope={brandScope} />
          {channel === "social" ? (
        <div className="space-y-7">
          <section className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-brand/20 bg-brand/[0.045] p-4">
            <div>
              <h2 className="text-sm font-semibold text-black/80">Plan the content before it goes live.</h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-black/50">Build the post once, inspect feed and story variants at their real proportions, and check crop and safe areas before approving it.</p>
            </div>
            {/* Gated with the composer it opens. A role that cannot see the
                campaigns section lands on a view with no composer — a dead
                end, which is worse than not offering it. */}
            {canSeeCampaigns ? (
              <Link href={campaignComposerHref(brandScope, "social")} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white hover:bg-black/85">
                Create social content <ArrowUpRight size={15} />
              </Link>
            ) : null}
          </section>
          <SocialBrandPlanner
            canCompose={canSeeCampaigns}
            assets={scopedMarketingAssets.filter(asset => asset.kind === "social")}
            companies={companyOptions}
            activeScope={brandScope}
          />
          <MarketingChannelsWorkspace
            kind="social"
            assets={scopedMarketingAssets.filter(asset => asset.kind === "social")}
            companies={companyOptions}
            defaultCompanyIds={defaultCompanyIds}
            inboxConnections={metaConnections}
            metaConfigured={metaReadiness.configured}
            inboxReturnUrl={marketingChannelHref("social", brandScope)}
          />
        </div>
      ) : channel === "funnels" ? (
        <div className="space-y-7">
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-black/10 bg-black/[0.02] px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-black/80">Funnels &amp; booking</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-black/50">Build the journey here. How it is <em>performing</em> — pageviews through to won — is the live funnel on Demand, so the two can never disagree.</p>
            </div>
            <Link href={marketingSectionHref("demand", "funnel", brandScope)} className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md border border-black/12 bg-white px-3 text-xs font-semibold text-black/68">Open the live funnel <ArrowUpRight size={14} /></Link>
          </section>
          <FunnelsWorkspace
          assets={scopedMarketingAssets.filter(asset => asset.kind === "funnel")}
          companies={companyOptions}
          defaultCompanyIds={defaultCompanyIds}
          projects={FIRST_PARTY_DEVELOPMENT_PROJECTS.map(project => ({
            id: project.id,
            name: project.name,
            brand: project.brand,
            previewUrl: project.previewUrl,
            publicUrl: project.publicUrl,
            repositoryUrl: project.repositoryUrl,
            sourcePath: project.sourcePath,
          }))}
          />
        </div>
      ) : channel === "google-business" ? (
        <GoogleBusinessProfileWorkspace
          assets={scopedMarketingAssets.filter(asset => asset.kind === "reputation" && asset.platform === "Google Business Profile")}
          allReputationAssets={scopedMarketingAssets.filter(asset => asset.kind === "reputation")}
          companies={companyOptions}
          defaultCompanyIds={defaultCompanyIds}
          brandScope={brandScope}
        />
      ) : channel === "website" ? (
        <div className="space-y-7">
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-black/10 bg-black/[0.02] px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-black/80">Per-site traffic lives in Performance</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-black/50">
                Property-by-property pageviews, load times and Search Console data are already reported there from the same Aqua Tag telemetry. Marketing links to it rather than keeping a second copy that could disagree.
              </p>
            </div>
            <Link href="/portal/agency/performance" className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md border border-black/12 bg-white px-3 text-xs font-semibold text-black/68">Open performance <ArrowUpRight size={14} /></Link>
          </section>
          {brandScope === "all" || selectedCompany?.slug === "aquaoasis-web" ? <section className="border-y border-black/10">
            <div className="flex flex-wrap items-start justify-between gap-4 py-5">
              <div className="flex items-start gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-md bg-brand text-white"><Globe2 size={20} /></span>
                <div>
                  <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-black/85">AquaOasis-Web website</h2><span className="rounded-full bg-black/[0.045] px-2 py-1 text-[10px] font-semibold uppercase text-black/45">Owned channel</span></div>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-black/50">The same first-party website Development controls, viewed here as a marketing asset: traffic, conversion routes, public availability and the pages carrying the offer.</p>
                </div>
              </div>
              <Link href="/portal/agency/fulfilment/technical/website" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-black px-3 text-sm font-semibold text-white">Open website control <ArrowUpRight size={15} /></Link>
            </div>
            {ownWebsite && ownWebsiteSummary ? (
              <div className="grid border-t border-black/10 sm:grid-cols-4">
                <WebsiteMetric icon={<RadioTower size={15} />} label="Public mode" value={ownWebsite.status === "live" ? "Live" : ownWebsite.status === "maintenance" ? "Maintenance" : "Redesign gate"} />
                {/* Unmeasured is "—", never 0. This tile used to print a measured-looking
                    "0" directly beside the "Tag: Waiting" tile next to it. */}
                <WebsiteMetric icon={<Activity size={15} />} label="Views today" value={measuredCountLabel(ownWebsiteSummary.pageviews24h, ownWebsite.telemetryLastSeenAt)} />
                <WebsiteMetric icon={<Activity size={15} />} label="Load time" value={ownWebsiteSummary.averageLoadMs ? `${ownWebsiteSummary.averageLoadMs} ms` : "Waiting"} />
                <WebsiteMetric icon={<RadioTower size={15} />} label="Tag" value={ownWebsite.telemetryLastSeenAt ? "Connected" : "Waiting"} />
              </div>
            ) : (
              <div className="border-t border-black/10 px-4 py-5 text-sm text-black/55">
                Website not configured for this workspace.
              </div>
            )}
          </section> : null}
          <MarketingChannelsWorkspace
            kind="website"
            assets={scopedMarketingAssets.filter(asset => asset.kind === "website")}
            companies={companyOptions}
            defaultCompanyIds={defaultCompanyIds}
          />
        </div>
      ) : (
        <MarketingChannelsWorkspace
          kind={channelToAssetKind(channel)}
          assets={scopedMarketingAssets.filter(asset => asset.kind === channelToAssetKind(channel))}
          companies={companyOptions}
          defaultCompanyIds={defaultCompanyIds}
        />
      )}
        </div>
      ) : null}
    </div>
  );
}

/** The one marketing-scoped explorer link: the KPI bank, filtered to marketing. */
const MARKETING_KPI_BANK_HREF = "/portal/agency/radar?view=kpis&domain=marketing";

const SECTION_META: Record<MarketingSection, { label: string; icon: typeof Activity }> = {
  pulse: { label: "KPIs vs plan", icon: Gauge },
  radar: { label: "Radar signals", icon: RadioTower },
  funnel: { label: "Live funnel", icon: Workflow },
  campaigns: { label: "Campaigns", icon: Megaphone },
  sources: { label: "Lead sources", icon: Activity },
};

/**
 * The blocks inside a merged view. Same pattern as the channel switcher: real
 * links, so every block stays addressable after its own tab was retired.
 */
function MarketingSectionNavigation({ view, section, brandScope, sections: allowed }: { view: MarketingView; section: MarketingSection | null; brandScope: string; sections?: readonly MarketingSection[] }) {
  // `allowed` is the caller's already-gated list. Defaulting to the full set
  // keeps the component honest for views with nothing to hide, but the Demand
  // view always passes its own so a role refused Campaigns is not offered a tab
  // that renders an empty section.
  const sections = allowed ?? MARKETING_VIEW_SECTIONS[view] ?? [];
  if (sections.length < 2) return null;
  return (
    <nav aria-label="In this view" className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-black/40">In this view</span>
      {sections.map(block => {
        const active = block === section;
        const Icon = SECTION_META[block].icon;
        return (
          <Link
            key={block}
            href={marketingSectionHref(view, block, brandScope)}
            aria-current={active ? "true" : undefined}
            className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-xs font-semibold ${active ? "border-black bg-black text-white" : "border-black/10 bg-white text-black/58 hover:bg-black/[0.03]"}`}
          >
            <Icon size={13} aria-hidden />{SECTION_META[block].label}
          </Link>
        );
      })}
    </nav>
  );
}

const CHANNEL_TABS: ReadonlyArray<{ id: MarketingChannel; label: string; icon: typeof Activity }> = [
  { id: "social", label: "Social media", icon: RadioTower },
  { id: "website", label: "Websites", icon: Globe2 },
  { id: "funnels", label: "Funnels & booking", icon: Workflow },
  { id: "google-ads", label: "Google Ads", icon: Target },
  { id: "google-business", label: "Google Business Profile", icon: MapPin },
  { id: "reputation", label: "Reputation", icon: Star },
];

/**
 * The channel switcher inside the consolidated Channels view — the five tabs
 * that used to sit in the main bar. Kept as links (not client state) so every
 * channel stays individually addressable and bookmarkable.
 */
function MarketingChannelNavigation({ channel, brandScope }: { channel: MarketingChannel; brandScope: string }) {
  return (
    <nav aria-label="Marketing channel" className="flex gap-2 overflow-x-auto pb-1">
      {CHANNEL_TABS.map(tab => {
        const active = tab.id === channel;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.id}
            href={marketingChannelHref(tab.id, brandScope)}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border px-3 text-xs font-semibold ${active ? "border-black bg-black text-white" : "border-black/10 bg-white text-black/58 hover:bg-black/[0.03]"}`}
          >
            <Icon size={14} aria-hidden />{tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

function BrandScopeNavigation({ companies, view, activeScope, canManage }: { companies: TradingCompany[]; view: MarketingView; activeScope: string; canManage: boolean }) {
  return (
    <section aria-labelledby="brand-scope-heading">
      <div className="flex items-center justify-between gap-4">
        <div><h2 id="brand-scope-heading" className="text-sm font-semibold text-black/75">Brand scope</h2><p className="mt-0.5 text-xs text-black/45">Switch the whole workspace without splitting the CRM.</p></div>
        <Link href="/portal/agency/company?view=companies" className="shrink-0 text-xs font-medium text-brand hover:underline">{canManage ? "Manage brands" : "View brands"}</Link>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        <BrandScopeLink href={marketingHref(view, "all")} active={activeScope === "all"} label="All brands" colour="#111111" />
        <BrandScopeLink href={marketingHref(view, "shared")} active={activeScope === "shared"} label="Group / shared" colour="#8E7340" />
        {companies.map(company => <BrandScopeLink key={company.id} href={marketingHref(view, company.slug)} active={activeScope === company.slug} label={company.name} colour={company.brand.primaryColor} />)}
      </div>
    </section>
  );
}

interface MarketingOverview {
  campaigns: number;
  activeCampaigns: number;
  draftCampaigns: number;
  trackedAssets: number;
  activeAssets: number;
  leads: number;
  contacted: number;
  meetings: number;
  converted: number;
  spendCents: number;
  conversions: number;
}

/**
 * Marketing at a glance — the record counts and readiness that used to sit on
 * the retired overview tab, kept as one compact strip at the top of Pulse
 * rather than a whole view whose only job was linking to the other nine.
 */
function MarketingAtAGlance({
  overview,
  customerProfiles,
  sourceRows,
  emailSenderReady,
  automationStats,
  canSeeCampaigns,
}: {
  overview: MarketingOverview;
  customerProfiles: MarketingCustomerProfile[];
  sourceRows: Array<{ source: string; leads: number; contacted: number; meetings: number; converted: number }>;
  emailSenderReady: boolean;
  automationStats: { total: number; active: number };
  /** The campaigns plugin page is owner/manager-only; its NUMBERS follow it. */
  canSeeCampaigns: boolean;
}) {
  const activeProfiles = customerProfiles.filter(profile => profile.status === "active").length;
  const validatedProfiles = customerProfiles.filter(profile => profile.evidenceConfidence === "validated").length;
  const leadToMeetingRate = overview.leads > 0 ? Math.round(overview.meetings / overview.leads * 100) : 0;
  const leadToWinRate = overview.leads > 0 ? Math.round(overview.converted / overview.leads * 100) : 0;

  return (
    <section aria-labelledby="marketing-at-a-glance" className="space-y-3">
      <h2 id="marketing-at-a-glance" className="sr-only">Marketing at a glance</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {/* Campaign counts and spend are campaign CONTENT. The plugin page
            that owns them is owner/manager-only, so a staff Pulse must not
            restate them here — that was the surface disagreement. */}
        {canSeeCampaigns ? <OverviewMetric label="Campaigns" value={String(overview.campaigns)} detail={`${overview.activeCampaigns} active · ${overview.draftCampaigns} drafts`} icon={<Megaphone size={16} />} /> : null}
        <OverviewMetric label="Customer profiles" value={String(customerProfiles.length)} detail={`${activeProfiles} active · ${validatedProfiles} validated`} icon={<UserRoundSearch size={16} />} />
        <OverviewMetric label="Lead activity" value={String(overview.leads)} detail={`${overview.contacted} contacted · ${overview.meetings} meetings`} icon={<Users size={16} />} />
        <OverviewMetric label="Conversions" value={String(overview.converted + overview.conversions)} detail={`${overview.converted} lead wins · ${overview.conversions} asset conversions`} icon={<Target size={16} />} />
        <OverviewMetric label="Tracked channels" value={String(overview.trackedAssets)} detail={`${overview.activeAssets} active assets`} icon={<Gauge size={16} />} />
        {canSeeCampaigns ? <OverviewMetric label="Spend tracked" value={formatMoney(overview.spendCents)} detail={`${sourceRows.length} lead source${sourceRows.length === 1 ? "" : "s"}`} icon={<BarChart3 size={16} />} /> : null}
      </div>
      <dl className="flex flex-wrap gap-2 text-xs">
        <GlanceChip label="Email sender" value={emailSenderReady ? "Ready" : "Needs setup"} />
        <GlanceChip label="Active automations" value={`${automationStats.active}/${automationStats.total}`} />
        <GlanceChip label="Lead to meeting" value={`${leadToMeetingRate}%`} />
        <GlanceChip label="Lead to win" value={`${leadToWinRate}%`} />
      </dl>
    </section>
  );
}

function GlanceChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-black/10 bg-white px-2.5 py-1.5">
      <dt className="text-black/45">{label}</dt>
      <dd className="font-semibold text-black/72">{value}</dd>
    </div>
  );
}

function CampaignQuickStarts({ brandScope }: { brandScope: string }) {
  const starts: Array<{ label: string; compose: string }> = [
    { label: "Social media", compose: "social" },
    { label: "Newsletter", compose: "newsletter" },
    { label: "Physical", compose: "physical" },
    { label: "DM", compose: "dm" },
    { label: "Cold", compose: "cold" },
    { label: "Charity", compose: "charity" },
  ];

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-black/10 bg-black/[0.018] p-3">
      <div>
        <h2 className="text-sm font-semibold text-black/78">Campaign lanes</h2>
        <p className="mt-0.5 text-xs text-black/45">Jump straight into the kind of marketing activity you are planning.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {starts.map(start => (
          <Link key={start.compose} href={campaignComposerHref(brandScope, start.compose)} className="min-h-9 rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/62 hover:bg-black/[0.03]">
            {start.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

function SocialBrandPlanner({
  assets,
  companies,
  activeScope,
  canCompose,
}: {
  assets: MarketingAsset[];
  companies: Array<{ id: string; name: string; slug: string; colour: string }>;
  activeScope: string;
  /** Whether this role can reach the composer these buttons open. */
  canCompose: boolean;
}) {
  const rows = [
    {
      id: "shared",
      name: "Group / shared",
      slug: "shared",
      colour: "#8E7340",
      profiles: assets.filter(asset => !asset.companyIds?.length),
    },
    ...companies.map(company => ({
      ...company,
      profiles: assets.filter(asset => asset.companyIds?.includes(company.id)),
    })),
  ].filter(row => activeScope === "all" || activeScope === row.slug);

  return (
    <section className="border-y border-black/10">
      <div className="flex flex-wrap items-end justify-between gap-3 py-4">
        <div>
          <h2 className="text-sm font-semibold text-black/78">Social media by brand</h2>
          <p className="mt-1 text-xs text-black/45">Each brand keeps its own profiles, owners, objectives and social campaign lane.</p>
        </div>
        {canCompose ? (
        <Link href={campaignComposerHref(activeScope === "all" ? "all" : activeScope, "social")} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/65 hover:bg-black/[0.03]">
          Social campaign <ArrowUpRight size={13} />
        </Link>
        ) : null}
      </div>
      <div className="divide-y divide-black/[0.07]">
        {rows.map(row => {
          const activeProfiles = row.profiles.filter(profile => profile.status === "active").length;
          const platforms = Array.from(new Set(row.profiles.map(profile => profile.platform).filter(Boolean))).slice(0, 4);
          return (
            <article key={row.id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: row.colour }} aria-hidden />
                  <h3 className="truncate text-sm font-semibold text-black/80">{row.name}</h3>
                </div>
                <p className="mt-1 truncate text-xs text-black/45">{platforms.length ? platforms.join(" · ") : "No social profiles saved yet."}</p>
              </div>
              <div className="flex gap-4 text-xs text-black/52 md:justify-end">
                <span><strong className="font-semibold text-black/75">{row.profiles.length}</strong> profiles</span>
                <span><strong className="font-semibold text-black/75">{activeProfiles}</strong> active</span>
              </div>
              <div className="flex flex-wrap gap-2 md:justify-end">
                <Link href={marketingChannelHref("social", row.slug)} className="min-h-9 rounded-md border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/62 hover:bg-black/[0.03]">Profiles</Link>
                {canCompose ? <Link href={campaignComposerHref(row.slug, "social")} className="min-h-9 rounded-md bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-black/85">Campaign</Link> : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function GoogleBusinessProfileWorkspace({
  assets,
  allReputationAssets,
  companies,
  defaultCompanyIds,
  brandScope,
}: {
  assets: MarketingAsset[];
  allReputationAssets: MarketingAsset[];
  companies: Array<{ id: string; name: string; slug: string; colour: string }>;
  defaultCompanyIds: string[];
  brandScope: string;
}) {
  const reviews = assets.reduce((sum, asset) => sum + (asset.reviewCount ?? 0), 0);
  const unanswered = assets.reduce((sum, asset) => sum + (asset.unansweredReviews ?? 0), 0);
  const nonGbpProfiles = allReputationAssets.filter(asset => asset.platform !== "Google Business Profile").length;

  return (
    <div className="space-y-7">
      <section className="rounded-md border border-brand/20 bg-brand/[0.045]">
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-md bg-white text-brand shadow-sm"><MapPin size={20} /></span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand">Local trust</p>
              <h2 className="mt-1 text-lg font-semibold text-black/85">Google Business Profile</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-black/52">Track the local profile for each brand: public link, owner, rating, review count, unanswered replies and what the profile is meant to generate.</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <OverviewMetric label="Profiles" value={String(assets.length)} detail={`${nonGbpProfiles} other reputation`} icon={<Star size={15} />} />
            <OverviewMetric label="Reviews" value={String(reviews)} detail="GBP total" icon={<Users size={15} />} />
            <OverviewMetric label="Replies due" value={String(unanswered)} detail="Needs response" icon={<Gauge size={15} />} />
          </div>
        </div>
      </section>

      <MarketingChannelsWorkspace
        kind="reputation"
        assets={assets}
        companies={companies}
        defaultCompanyIds={defaultCompanyIds}
        defaultPlatform="Google Business Profile"
      />

      <section className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-4">
        <p className="text-sm text-black/50">Need Trustpilot, Facebook, Yell or other review profiles too?</p>
        <Link href={marketingChannelHref("reputation", brandScope)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-black/10 bg-white px-3 text-xs font-semibold text-black/62 hover:bg-black/[0.03]">Open all reputation <ArrowUpRight size={13} /></Link>
      </section>
    </div>
  );
}

function BrandScopeLink({ href, active, label, colour }: { href: string; active: boolean; label: string; colour: string }) {
  return <Link href={href} aria-current={active ? "true" : undefined} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition ${active ? "border-black bg-black text-white" : "border-black/10 bg-white text-black/60 hover:border-black/25 hover:text-black/80"}`}><span className="size-2 rounded-full ring-1 ring-white/30" style={{ backgroundColor: colour }} aria-hidden />{label}</Link>;
}

function WebsiteMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex items-center gap-3 border-b border-black/10 px-4 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><span className="text-brand">{icon}</span><div><p className="text-[10px] font-semibold uppercase text-black/35">{label}</p><p className="mt-1 text-sm font-semibold text-black/70">{value}</p></div></div>;
}

/** Honest rendering: a measure that was never taken shows "—", never 0. */
function spineNumber(value: number | null): string {
  return value === null ? "—" : value.toLocaleString();
}

function spinePercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 10) / 10}%`;
}

function spineChange(value: number | null): string {
  if (value === null) return "No movement measured";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}% vs previous 7 days`;
}

/**
 * The live spine — Aqua Tag telemetry (through the Radar marketing domain) and
 * real website enquiries. Agency-wide by design: the Radar monitors properties,
 * not brand scopes, so the panel says so rather than implying a filtered number.
 */
function MarketingDataSpinePanel({ spine, brandScope }: { spine: MarketingDataSpine | null; brandScope: string }) {
  if (!spine) return null;
  const { traffic, enquiries, tag } = spine;
  const firing = spine.attention.length;
  return (
    <section aria-labelledby="marketing-spine-heading" className="rounded-md border border-black/10 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 px-4 py-3">
        <div>
          <h2 id="marketing-spine-heading" className="text-base font-semibold text-black/82">Live data spine</h2>
          <p className="mt-1 text-xs text-black/45">Measured, not assumed. Enquiries follow the selected brand through the tag&rsquo;s routing registry; traffic and conversions stay agency-wide, because the Radar monitors properties rather than brands.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {firing ? <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800"><RadioTower size={13} aria-hidden /> {firing} marketing signal{firing === 1 ? "" : "s"} firing</span> : null}
          <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold ${spine.available && tag.connected ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-black/10 bg-black/[0.03] text-black/55"}`}>
            {spine.available ? tag.connected ? "Tag reporting" : "No tag signal yet" : "Radar unavailable"}
          </span>
        </div>
      </div>
      <dl className="grid gap-px bg-black/[0.07] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <SpineMetric label="Traffic · 7 days" value={spineNumber(traffic.last7d)} detail={spineChange(traffic.changePercent)} />
        <SpineMetric label="Traffic · 24 hours" value={spineNumber(traffic.last24h)} detail={`Previous 7 days ${spineNumber(traffic.previous7d)}`} />
        <SpineMetric label="Form submissions · 7 days" value={spineNumber(spine.forms7d)} detail="Tracked website form events" />
        <SpineMetric label="Tracked conversions" value={spineNumber(spine.conversions7d)} detail={`Conversion rate ${spinePercent(spine.conversionRatePercent)}`} />
        <SpineMetric
          label="Website enquiries · 7 days"
          value={enquiries.available ? spineNumber(enquiries.last7d) : "—"}
          detail={enquiries.available ? `${enquiries.last30d.toLocaleString()} in 30 days · ${spinePercent(enquiries.attributionPercent)} attributed${enquiries.scopedToCompanyId ? " · this brand only" : ""}` : "Not read in this session"}
        />
        <SpineMetric
          label="Tag coverage"
          value={`${tag.connectedSources}/${tag.totalSources}`}
          detail={`${tag.registeredSources} tagged site${tag.registeredSources === 1 ? "" : "s"} · ${tag.monitoredProperties} monitored`}
        />
      </dl>
      {enquiries.available && enquiries.bySource.length ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-black/10 px-4 py-3">
          <span className="text-xs font-medium text-black/45">Enquiries by source:</span>
          {enquiries.bySource.slice(0, 6).map(row => (
            <span key={row.key} className="inline-flex items-center gap-1.5 rounded-md border border-black/10 bg-black/[0.025] px-2.5 py-1 text-xs text-black/62">
              {sourceLabel(row.label)} <strong className="font-semibold text-black/78">{row.total}</strong>
            </span>
          ))}
          <Link href={marketingSectionHref("demand", "sources", brandScope)} className="text-xs font-semibold text-brand hover:underline">Open sources</Link>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Where real enquiries actually came from — the live half of "sources". The
 * table above counts CRM lead records; this counts what arrived through the tag
 * and the public forms, so an unattributed pile is visible rather than implied.
 */
function MarketingEnquirySources({ spine }: { spine: MarketingDataSpine | null }) {
  if (!spine) return null;
  const { enquiries } = spine;
  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-black/10 pb-3">
        <div>
          <h3 className="text-base font-semibold text-black/85">Website enquiry sources</h3>
          <p className="mt-1 text-sm text-black/50">Real submissions from the Aqua Tag and public forms, across every monitored property.</p>
        </div>
        {enquiries.available ? (
          <span className="text-xs font-medium text-black/45">
            {enquiries.total.toLocaleString()} enquiries · {spinePercent(enquiries.attributionPercent)} attributed
          </span>
        ) : null}
      </div>
      {!enquiries.available ? (
        <p className="py-12 text-center text-sm text-black/40">Enquiries were not read in this session, so live sources cannot be shown. That is a demo session or a failed read — not zero enquiries.</p>
      ) : !enquiries.bySource.length ? (
        <p className="py-12 text-center text-sm text-black/40">No website enquiries have arrived yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b border-black/10 text-xs text-black/40">
              <tr>
                <th className="py-3 pr-4 font-medium">Source</th>
                <th className="px-3 py-3 text-right font-medium">7 days</th>
                <th className="px-3 py-3 text-right font-medium">30 days</th>
                <th className="py-3 pl-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.07]">
              {enquiries.bySource.map(row => (
                <tr key={row.key}>
                  <td className="py-4 pr-4 font-medium text-black/75">{sourceLabel(row.label)}</td>
                  <td className="px-3 py-4 text-right tabular-nums text-black/60">{row.last7d}</td>
                  <td className="px-3 py-4 text-right tabular-nums text-black/60">{row.last30d}</td>
                  <td className="py-4 pl-3 text-right font-semibold tabular-nums text-black/75">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {enquiries.available && enquiries.byCampaign.length ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-black/45">Campaigns seen on enquiries:</span>
          {enquiries.byCampaign.slice(0, 8).map(row => (
            <span key={row.key} className="inline-flex items-center gap-1.5 rounded-md border border-black/10 bg-black/[0.025] px-2.5 py-1 text-xs text-black/62">
              {row.label} <strong className="font-semibold text-black/78">{row.total}</strong>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SpineMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="bg-white px-4 py-3">
      <dt className="text-xs font-medium text-black/45">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums text-black/85">{value}</dd>
      <p className="mt-1 text-xs text-black/42">{detail}</p>
    </div>
  );
}

function OverviewMetric({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: React.ReactNode }) {
  return <div className="rounded-md border border-black/10 bg-white p-4"><div className="flex items-start justify-between gap-3"><dt className="text-xs font-medium text-black/45">{label}</dt><span className="text-brand">{icon}</span></div><dd className="mt-2 text-2xl font-semibold text-black/85">{value}</dd><p className="mt-1 text-xs text-black/42">{detail}</p></div>;
}

function MarketingTab({ href, active, icon: Icon, children }: { href: string; active: boolean; icon: typeof Activity; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`relative inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap py-3 text-sm font-medium ${active ? "text-black" : "text-black/45 hover:text-black/70"}`}>
      <Icon size={15} aria-hidden="true" />{children}<AttentionDot href={href} categories={href.includes("view=demand") ? ["marketing"] : undefined} />
      {active ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-black" /> : null}
    </Link>
  );
}

/**
 * The six tabs. Funnels sits right after Demand — the funnel builder is a
 * first-class destination (Ed calls it vital), one click from Marketing rather
 * than buried two levels deep in Channels; the Channels → Funnels channel path
 * still resolves for old links. Client services is deliberately absent — it is a
 * header link now — while `?view=client-services` stays a live URL, and
 * Automations is agency-wide so it never carries a brand scope.
 */
function MarketingWorkspaceNavigation({ view, brandScope, canManage = true }: { view: MarketingView; brandScope: string; canManage?: boolean }) {
  return (
    <nav aria-label="Marketing view" className="flex gap-5 overflow-x-auto border-b border-black/10">
      <MarketingTab href={marketingHref("pulse", brandScope)} active={view === "pulse"} icon={Gauge}>Pulse</MarketingTab>
      {canManage ? <MarketingTab href={marketingHref("demand", brandScope)} active={view === "demand"} icon={Megaphone}>Demand</MarketingTab> : null}
      {canManage ? <MarketingTab href={marketingHref("funnels", brandScope)} active={view === "funnels"} icon={Workflow}>Funnels</MarketingTab> : null}
      {canManage ? <MarketingTab href={marketingHref("customers", brandScope)} active={view === "customers"} icon={UserRoundSearch}>Customers</MarketingTab> : null}
      {canManage ? <MarketingTab href={marketingHref("channels", brandScope)} active={view === "channels"} icon={Globe2}>Channels</MarketingTab> : null}
      {canManage ? <MarketingTab href={marketingHref("automations", "all")} active={view === "automations"} icon={LockKeyhole}>Automations</MarketingTab> : null}
    </nav>
  );
}

/**
 * A channel's asset kind. Total, not a narrowed `Exclude<…>`: `funnels` and
 * `google-business` are channel names that do not name an asset kind.
 */
function channelToAssetKind(channel: MarketingChannel): MarketingAssetKind {
  if (channel === "funnels") return "funnel";
  if (channel === "google-business") return "reputation";
  return channel;
}

function campaignComposerHref(brandScope: string, compose: string): string {
  const params = new URLSearchParams({ view: "demand", section: "campaigns", compose });
  if (brandScope !== "all") params.set("brand", brandScope);
  return `/portal/agency/marketing?${params.toString()}`;
}

function buildMarketingOverview({
  campaigns,
  assets,
  leads,
  sourceRows,
}: {
  campaigns: Array<{ status: string; spendCents?: number }>;
  assets: MarketingAsset[];
  leads: Array<{ lastContactedAt?: number; sentCount?: number; nextMeetingAt?: number; tags: string[] }>;
  sourceRows: Array<{ converted: number }>;
}): MarketingOverview {
  return {
    campaigns: campaigns.length,
    activeCampaigns: campaigns.filter(campaign => campaign.status === "active" || campaign.status === "scheduled" || campaign.status === "sending").length,
    draftCampaigns: campaigns.filter(campaign => campaign.status === "draft").length,
    trackedAssets: assets.length,
    activeAssets: assets.filter(asset => asset.status === "active").length,
    leads: leads.length,
    contacted: leads.filter(lead => lead.lastContactedAt || (lead.sentCount ?? 0) > 0).length,
    meetings: leads.filter(lead => lead.nextMeetingAt).length,
    converted: sourceRows.reduce((sum, source) => sum + source.converted, 0),
    spendCents: campaigns.reduce((sum, campaign) => sum + (campaign.spendCents ?? 0), 0) + assets.reduce((sum, asset) => sum + asset.spendCents, 0),
    conversions: assets.reduce((sum, asset) => sum + asset.conversions, 0),
  };
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(cents / 100);
}

function composeToChannel(compose: string | undefined): "email" | "newsletter" | "cold-outreach" | "dm" | "direct-mail" | "google-ads" | "meta-ads" | "organic" | "social" | "charity" | undefined {
  if (compose === "social" || compose === "organic") return "social";
  if (compose === "newsletter") return "newsletter";
  if (compose === "physical" || compose === "print" || compose === "direct-mail") return "direct-mail";
  if (compose === "dm") return "dm";
  if (compose === "cold") return "cold-outreach";
  if (compose === "charity") return "charity";
  if (compose === "google-ads") return "google-ads";
  if (compose === "meta-ads" || compose === "paid") return "meta-ads";
  return undefined;
}

function recordMatchesBrand(companyIds: string[] | undefined, brandScope: string, selectedCompanyId: string | null): boolean {
  if (brandScope === "all") return true;
  if (brandScope === "shared") return !companyIds?.length;
  return Boolean(selectedCompanyId && companyIds?.includes(selectedCompanyId));
}

function recordBelongsToCampaign(recordCompanyIds: string[], campaignCompanyIds: string[] | undefined): boolean {
  if (!campaignCompanyIds?.length) return true;
  return recordCompanyIds.some(companyId => campaignCompanyIds.includes(companyId));
}

function sourceLabel(source: string): string {
  return source
    .replace(/^csv:/, "CSV · ")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, character => character.toUpperCase());
}
